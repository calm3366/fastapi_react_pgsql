# backend/app/other.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, literal
from sqlalchemy.sql import case
from app.models import Bond, Trade
from app import models, schemas
from app.database import async_session
from urllib.parse import urlencode
import xml.etree.ElementTree as ET
from typing import Sequence, Optional
from datetime import datetime
import asyncio, logging, json 

logger = logging.getLogger(__name__)

async def get_bonds_with_weights(db: AsyncSession):
    # 1. Считаем общую стоимость портфеля — защищённо, используем COALESCE чтобы не получить None
    total_value_result = await db.execute(
        select(func.coalesce(func.sum(Trade.buy_qty * Bond.last_price), 0.0))
        .select_from(Trade)
        .join(Bond, Bond.id == Trade.bond_id)
    )
    total_value = float(total_value_result.scalar() or 0.0)

    # 2. Считаем позиции по каждой бумаге — также защищённо: COALESCE для сумм
    portfolio_result = await db.execute(
        select(
            Trade.bond_id,
            func.coalesce(func.sum(Trade.buy_qty), 0).label("total_qty"),
            func.coalesce(func.sum(Trade.buy_qty * Bond.last_price), 0.0).label("bond_value"),
            Bond.secid,
            Bond.name,
            func.coalesce(Bond.last_price, 0.0).label("last_price")
        )
        .select_from(Trade)
        .join(Bond, Bond.id == Trade.bond_id)
        .group_by(Trade.bond_id, Bond.secid, Bond.name, Bond.last_price)
    )
    portfolio = portfolio_result.all()

    # 3. Формируем результат, защищаясь от None и конвертируя типы
    result = []
    for bond_id, total_qty, bond_value, secid, name, last_price in portfolio:
        # приведение к числам
        total_qty_n = int(total_qty or 0)
        bond_value_n = float(bond_value or 0.0)
        last_price_n = float(last_price or 0.0)

        weight = round((bond_value_n / total_value) * 100, 2) if total_value else 0.0

        result.append({
            "id": bond_id,
            "secid": secid,
            "name": name,
            "last_price": last_price_n,
            "total_qty": total_qty_n,
            "bond_value": bond_value_n,
            "weight": weight,
        })

    return result

CBR_URL = "https://www.cbr.ru/scripts/XML_daily.asp"

async def fetch_fx_rates(currencies: Sequence[str]) -> dict:
    """
    Возвращает mapping currency -> rate (RUB per 1 unit of currency) или None.
    Источник: Центробанк РФ (XML), не требует API ключа.
    """
    if not currencies:
        return {}

    currencies = [c.upper() for c in currencies]

    def _sync_get():
        import requests
        # запрос без параметра date_req возвращает актуальную на сегодня таблицу
        r = requests.get(CBR_URL, timeout=10)
        r.raise_for_status()
        return r.content

    try:
        xml_bytes = await asyncio.to_thread(_sync_get)
    except Exception as e:
        raise RuntimeError("Failed to fetch CBR rates: " + str(e))

    rates = {c: None for c in currencies}
    try:
        root = ET.fromstring(xml_bytes)
        # структура: <ValCurs Date="dd.mm.yyyy" name="Foreign Currency Market">
        for val in root.findall("Valute"):
            code = val.findtext("CharCode")
            if not code:
                continue
            code = code.upper()
            if code not in rates:
                continue
            nominal_text = val.findtext("Nominal") or "1"
            value_text = val.findtext("Value") or "0"
            try:
                nominal = int(nominal_text)
            except Exception:
                nominal = 1
            # CBR uses comma as decimal separator
            value = float(value_text.replace(",", "."))
            # value is RUB per nominal units => rate per 1 unit:
            rates[code] = value / nominal
    except Exception as e:
        raise RuntimeError("Failed to parse CBR XML: " + str(e))

    return rates

async def update_fx_rates_for_currencies(currencies: list[str] | None, async_session):
    # собрать currencies если None
    if not currencies:
        async with async_session() as session:
            res = await session.execute(select(models.Bond.currency).where(models.Bond.currency.isnot(None)))
            raw = [r[0] for r in res.fetchall()]
            currencies = list({(c or "").upper() for c in raw if c and c.upper() not in ("SUR","RUB")})
    else:
        currencies = [c.upper() for c in currencies if c and c.upper() not in ("SUR","RUB")]

    if not currencies:
        return []

    rates = await fetch_fx_rates(currencies)

    now = datetime.utcnow()
    saved = []
    async with async_session() as session:
        for cur, rate in rates.items():
            if rate is None:
                continue
            obj = await session.get(models.FxRate, cur)
            if obj:
                obj.rate = rate
                obj.updated_at = now
            else:
                obj = models.FxRate(currency=cur, rate=rate, updated_at=now)
                session.add(obj)
            saved.append(obj)
        await session.commit()
    return saved

async def _get_name_from_db_by_isin(isin: str) -> Optional[str]:
    """Попытка получить name из локальной БД по ISIN. Возвращает None если не найдено."""
    if not isin:
        return None
    try:
        async with async_session() as session:
            q = select(Bond.name).where(Bond.isin == isin).limit(1)
            res = await session.execute(q)
            row = res.scalar_one_or_none()
            if row:
                return row
    except Exception:
        logger.exception("DB lookup failed for ISIN %s", isin)
    return None

# функция расчёта разбивки и сумм в рублях
async def calc_trades_sum_breakdown(db_session: AsyncSession) -> dict:
    """
    Возвращает {"by_currency": {CUR: amt, ...}, "trades_sum_in_rub": number}
    Учитывает trade.total_amount (приоритет) и комиссии buy_commission/sell_commission,
    а при конверсии использует per-trade fx_rate если задан, иначе внешний/current rate.
    """
    try:
        cur_expr = func.coalesce(models.Trade.currency, models.Bond.currency, literal("SUR"))

        total_amount_col = getattr(models.Trade, "total_amount", None)
        buy_price_col = getattr(models.Trade, "buy_price", None) or getattr(models.Trade, "price", None)
        buy_qty_col = None
        for q in ("buy_qty", "qty", "quantity", "amount"):
            if hasattr(models.Trade, q):
                buy_qty_col = getattr(models.Trade, q)
                break

        # commissions columns
        buy_comm_col = getattr(models.Trade, "buy_commission", None)
        sell_comm_col = getattr(models.Trade, "sell_commission", None)

        # per-trade amount expression (prefer total_amount, else price*qty + commission + nkd)
        # we compute a numeric expression in SQL for aggregation where possible
        # build price*qty expression if available
        price_qty_expr = None
        if buy_price_col is not None and buy_qty_col is not None:
            price_qty_expr = buy_price_col * buy_qty_col

        # combine commission and nkd when present
        nkd_col = getattr(models.Trade, "buy_nkd", None) or getattr(models.Trade, "sell_nkd", None) or None
        # prefer total_amount, else price_qty + nkd + commission
        comp_expr = None
        if total_amount_col is not None:
            comp_expr = func.coalesce(
                total_amount_col,
                (price_qty_expr + func.coalesce(buy_comm_col, literal(0.0)) + func.coalesce(models.Trade.buy_nkd, literal(0.0)))
                if price_qty_expr is not None else literal(0.0)
            )
        else:
            if price_qty_expr is not None:
                comp_expr = price_qty_expr + func.coalesce(buy_comm_col, literal(0.0)) + func.coalesce(models.Trade.buy_nkd, literal(0.0))
            else:
                comp_expr = literal(0.0)

        # aggregate: sum amount, sum amount where fx_rate IS NOT NULL, sum(amount * fx_rate) for those trades
        q = (
            select(
                cur_expr.label("cur"),
                func.sum(comp_expr).label("sum_amt"),
                func.sum(case((models.Trade.fx_rate.isnot(None), comp_expr), else_=0)).label("sum_with_fx_amt"),
                func.sum(case((models.Trade.fx_rate.isnot(None), comp_expr * models.Trade.fx_rate), else_=0)).label("sum_rub_from_fx"),
            )
            .select_from(models.Trade)
            .join(models.Bond, models.Trade.bond_id == models.Bond.id, isouter=True)
            .group_by(cur_expr)
        )

        res = await db_session.execute(q)
        rows = res.all()

        by_currency = {}
        for r in rows:
            cur = (r.cur or "SUR").upper()
            by_currency[cur] = by_currency.get(cur, 0.0) + float(r.sum_amt or 0.0)

        # external rates for remaining conversions
        foreign = [c for c in by_currency.keys() if c and c.upper() not in ("SUR", "RUB")]
        rates = {}
        if foreign:
            try:
                rates = await fetch_fx_rates(foreign)
            except Exception:
                try:
                    res2 = await db_session.execute(select(models.FxRate.currency, models.FxRate.rate))
                    rates = {row[0].upper(): float(row[1]) for row in res2.all()}
                except Exception:
                    logger.exception("calc_trades_sum_breakdown: failed to load fallback fx rates")
                    rates = {}

        trades_sum_in_rub = 0.0
        # use aggregated fields to compute RUB: per-currency use per-trade fx contributions + remaining via external rate
        for r in rows:
            cur = (r.cur or "SUR").upper()
            sum_amt = float(r.sum_amt or 0.0)
            sum_with_fx = float(getattr(r, "sum_with_fx_amt", 0.0) or 0.0)
            sum_rub_from_fx = float(getattr(r, "sum_rub_from_fx", 0.0) or 0.0)

            if cur in ("SUR", "RUB", None, ""):
                trades_sum_in_rub += sum_amt
            else:
                rub_from_fx = sum_rub_from_fx
                remaining = max(0.0, sum_amt - sum_with_fx)
                external_rate = rates.get(cur)
                rub_from_external = remaining * external_rate if external_rate else 0.0
                trades_sum_in_rub += rub_from_fx + rub_from_external

        return {"by_currency": by_currency, "trades_sum_in_rub": trades_sum_in_rub}

    except Exception:
        logger.exception("calc_trades_sum_breakdown failed")
        return {"by_currency": {}, "trades_sum_in_rub": 0.0}

async def build_positions_with_amounts(db: AsyncSession) -> dict:
    out_positions = []
    by_currency = {}

    q = select(models.Trade, models.Bond).join(models.Bond, models.Trade.bond_id == models.Bond.id, isouter=True)
    res = await db.execute(q)
    rows = res.all()  # list of (Trade, Bond)

    for trade, bond in rows:
        try:
            total_amount = getattr(trade, "total_amount", None)
            buy_price = getattr(trade, "buy_price", None) or getattr(trade, "price", None)
            buy_qty = getattr(trade, "buy_qty", None) or getattr(trade, "qty", None) or getattr(trade, "quantity", None)
            buy_nkd = getattr(trade, "buy_nkd", None) or 0.0
            buy_comm = getattr(trade, "buy_commission", None) or 0.0
            sell_comm = getattr(trade, "sell_commission", None) or 0.0
            last_price = getattr(bond, "last_price", None) or getattr(trade, "last_price", None)
            face = getattr(bond, "face_value", None) or getattr(bond, "nominal", None) or getattr(bond, "face", None)
            currency = getattr(trade, "currency", None) or getattr(bond, "currency", None) or "SUR"
            currency = str(currency).upper()
            trade_fx_rate = getattr(trade, "fx_rate", None)

            chosen_reason = None
            chosen_amount = 0.0
            if total_amount is not None:
                chosen_amount = float(total_amount)
                chosen_reason = "total_amount"
            elif buy_price is not None and buy_qty is not None:
                chosen_amount = float(buy_price) * float(buy_qty) + float(buy_nkd or 0.0) + float(buy_comm or 0.0)
                chosen_reason = "price*qty + nkd + buy_commission"
            elif last_price is not None and buy_qty is not None:
                chosen_amount = float(last_price) * float(buy_qty) + float(buy_comm or 0.0)
                chosen_reason = "last_price*qty + buy_commission"
            elif last_price is not None and face is not None and buy_qty is not None:
                chosen_amount = (float(last_price) / 100.0) * float(face) * float(buy_qty) + float(buy_comm or 0.0)
                chosen_reason = "last_price%*face*qty + buy_commission"
            else:
                chosen_reason = "none"
                chosen_amount = 0.0

            by_currency[currency] = by_currency.get(currency, 0.0) + float(chosen_amount)

            out_positions.append({
                "trade_id": getattr(trade, "id", None),
                "bond_id": getattr(trade, "bond_id", None),
                "currency": currency,
                "computed_amount": float(chosen_amount),
                "chosen_reason": chosen_reason,
                "raw_total_amount": total_amount,
                "raw_buy_price": buy_price,
                "raw_buy_qty": buy_qty,
                "raw_buy_nkd": buy_nkd,
                "raw_buy_commission": buy_comm,
                "raw_sell_commission": sell_comm,
                "raw_last_price": last_price,
                "raw_face": face,
                "fx_rate": float(trade_fx_rate) if trade_fx_rate is not None else None,
            })
        except Exception:
            logger.exception("build_positions_with_amounts: failed for trade")
            out_positions.append({"currency": "SUR", "computed_amount": 0.0, "chosen_reason": "error", "fx_rate": None})

    # get external rates
    foreign = [c for c in by_currency.keys() if c and c.upper() not in ("SUR", "RUB")]
    rates = {}
    if foreign:
        try:
            rates = await fetch_fx_rates(foreign)
        except Exception:
            try:
                res2 = await db.execute(select(models.FxRate.currency, models.FxRate.rate))
                rates = {r[0].upper(): float(r[1]) for r in res2.all()}
            except Exception:
                rates = {}

    # compute per-position RUB using trade.fx_rate when present
    sum_in_rub = 0.0
    for pos in out_positions:
        cur = (pos.get("currency") or "SUR").upper()
        amt = float(pos.get("computed_amount") or 0.0)
        fx = pos.get("fx_rate")
        if cur in ("SUR", "RUB", None, ""):
            pos["computed_amount_rub"] = float(amt)
            sum_in_rub += float(amt)
        else:
            if fx is not None:
                pos["computed_amount_rub"] = float(amt) * float(fx)
                sum_in_rub += pos["computed_amount_rub"]
            else:
                rate = rates.get(cur)
                if rate:
                    pos["computed_amount_rub"] = float(amt) * float(rate)
                    sum_in_rub += pos["computed_amount_rub"]
                else:
                    pos["computed_amount_rub"] = None

    return {"positions": out_positions, "by_currency": by_currency, "sum_in_rub": sum_in_rub}

