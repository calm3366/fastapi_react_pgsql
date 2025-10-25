# backend/app/portfolio.py
from sqlalchemy import select, func, literal
from sqlalchemy.ext.asyncio import AsyncSession
from app import models
from . import other
import logging

# Сумма сделок
async def calc_trades_sum(session: AsyncSession) -> float:
    result = await session.execute(
        select(func.coalesce(func.sum(models.Trade.total_amount), 0.0))
    )
    return result.scalar_one()

# Прибыль от купонов (с учётом даты покупки)
async def calc_coupon_profit(session: AsyncSession) -> float:
    from datetime import date
    today = date.today()

    result = await session.execute(
        select(func.coalesce(func.sum(models.Coupon.value * models.Trade.buy_qty), 0.0))
        .join(models.Trade, models.Trade.bond_id == models.Coupon.bond_id)
        .where(models.Coupon.date >= models.Trade.buy_date)
        .where(models.Coupon.date <= today)
    )
    return result.scalar_one()

# Текущая стоимость портфеля (по последней цене из Price)
async def calc_current_value(db_session: AsyncSession) -> float:
    """
    Считает текущую стоимость всех облигаций в портфеле в RUB.
    Логика:
      - Для каждой облигации берём last_price и количество (aggregate positions/trades).
      - Сумма по валютам: sum(price * qty) grouped by bond.currency (fallback SUR/RUB).
      - Конвертируем иностранные валюты в RUB через fetch_fx_rates; fallback через таблицу FxRate.
      - Возвращаем float (рубли).
    """

    logger = logging.getLogger(__name__)
    try:
        # Определяем поля количества и цены
        qty_field = None
        for cand in ("buy_qty", "qty", "quantity", "total_qty", "amount"):
            if hasattr(models.Trade, cand):
                qty_field = getattr(models.Trade, cand)
                break

        # last_price берём у Bond; если его нет — возможно цена хранится в Trade.buy_price
        bond_last_price = getattr(models.Bond, "last_price", None)
        trade_price = getattr(models.Trade, "buy_price", None) or getattr(models.Trade, "price", None)

        # cur expression used in SELECT and GROUP BY (must be identical)
        cur_expr = func.coalesce(models.Bond.currency, literal("SUR"))

        # Форма суммы: если есть qty в Trade — суммируем last_price * qty, иначе пытаемся агрегировать по bonds
        if qty_field is not None and bond_last_price is not None:
            # aggregate using trades join bonds:
            # sum( (bond.last_price + coalesce(bond.nkd, 0)) * trade.qty ) grouped by cur_expr
            # use COALESCE to treat missing nkd as 0
            sum_expr = (models.Bond.last_price + func.coalesce(getattr(models.Bond, "nkd", literal(0)), literal(0))) * qty_field
            q = (
                select(
                    cur_expr.label("cur"),
                    func.sum(sum_expr).label("sum_amt")
                )
                .select_from(models.Trade)
                .join(models.Bond, models.Trade.bond_id == models.Bond.id)
                .where(models.Bond.last_price.isnot(None))
                .group_by(cur_expr)
            )
        else:
            # fallback: aggregate by bonds using bond.last_price * bond_qty_candidate
            qty_candidate = None
            for cand in ("total_qty", "held_qty", "qty"):
                if hasattr(models.Bond, cand):
                    qty_candidate = getattr(models.Bond, cand)
                    break
            if bond_last_price is None or qty_candidate is None:
                logger.warning("calc_current_value: cannot determine price or qty fields; returning 0")
                return 0.0
            sum_expr = (bond_last_price + func.coalesce(getattr(models.Bond, "nkd", literal(0)), literal(0))) * qty_candidate
            q = (
                select(
                    cur_expr.label("cur"),
                    func.sum(sum_expr).label("sum_amt")
                )
                .select_from(models.Bond)
                .where(bond_last_price.isnot(None))
                .group_by(cur_expr)
            )

        res = await db_session.execute(q)
        rows = res.all()

        by_currency: dict[str, float] = {}
        for r in rows:
            cur = (r.cur or "SUR").upper()
            amt = float(r.sum_amt or 0)
            by_currency[cur] = by_currency.get(cur, 0.0) + amt

        # Получаем курсы для иностранных валют
        foreign = [c for c in by_currency.keys() if c and c.upper() not in ("SUR", "RUB")]
        rates = {}
        if foreign:
            try:
                rates = await fetch_fx_rates(foreign)
            except Exception:
                try:
                    res2 = await db_session.execute(select(models.FxRate.currency, models.FxRate.rate))
                    rates = {r[0].upper(): float(r[1]) for r in res2.all()}
                except Exception:
                    logger.exception("calc_current_value: failed to fetch fallback fx rates")

        total_rub = 0.0
        for cur, amt in by_currency.items():
            key = (cur or "SUR").upper()
            if key in ("SUR", "RUB", None, ""):
                total_rub += float(amt)
            else:
                rate = rates.get(key)
                if not rate:
                    logger.warning("calc_current_value: missing FX rate for %s, skipping", key)
                    continue
                total_rub += float(amt) * float(rate)

        return total_rub

    except Exception:
        logger.exception("calc_current_value failed")
        return 0.0

