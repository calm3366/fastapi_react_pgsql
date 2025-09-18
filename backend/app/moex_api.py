# backend/app/moex_api.py
import httpx, hashlib, requests
from fastapi import APIRouter, Query
from typing import Optional, Any, Dict, Tuple, List
from datetime import date, datetime
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas import BondOut

router = APIRouter()

BASE_MARKET_URL = "https://iss.moex.com/iss/engines/stock/markets/{market}/securities.json"
APIRouter()

def get_bond_prices_from_moex(secid: str):
    url = f"https://iss.moex.com/iss/history/engines/stock/markets/bonds/securities/{secid}.json"
    resp = requests.get(url)
    if resp.status_code != 200:
        return []

    data = resp.json()
    if "history" not in data or "data" not in data["history"]:
        return []

    columns = data["history"]["columns"]
    idx_date = columns.index("TRADEDATE")
    idx_price = columns.index("CLOSE")

    prices = []
    for row in data["history"]["data"]:
        try:
            prices.append({
                "date": datetime.strptime(row[idx_date], "%Y-%m-%d").date(),
                "price": float(row[idx_price]),
                "secid": secid
            })
        except (ValueError, TypeError):
            continue

    return prices

async def _search_bonds_by_markets(query: str) -> List[Dict]:
    markets = ["bonds", "corporate_bonds", "municipal_bonds", "subfederal_bonds", "ofz"]
    q_lower = (query or "").strip().lower()
    seen = set()
    results = []

    async with httpx.AsyncClient(timeout=60) as client:
        for market in markets:
            start = 0
            limit = 5000

            while True:
                url = BASE_MARKET_URL.format(market=market)
                params = {
                    "limit": limit,
                    "start": start,
                    "iss.meta": "off",
                    "iss.only": "securities"
                }
                print(f"DEBUG: fetching market='{market}' start={start}")
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                tbl = resp.json().get("securities", {})
                cols = tbl.get("columns", [])
                rows = tbl.get("data", [])

                if not rows:
                    break

                idx = {name: i for i, name in enumerate(cols)}

                for r in rows:
                    secid   = r[idx["SECID"]]
                    isin    = r[idx["ISIN"]]
                    shortnm = r[idx.get("SHORTNAME", -1)] or ""
                    secname = r[idx.get("SECNAME", -1)] or ""
                    emitent = r[idx["emitent_title"]] if "emitent_title" in idx else ""
                    coupon = r[idx["COUPONPERCENT"]] if "COUPONPERCENT" in idx else None
                    maturity_date = None
                    if "MATURITYDATE" in idx and r[idx["MATURITYDATE"]]:
                        try:
                            maturity_date = datetime.strptime(r[idx["MATURITYDATE"]], "%Y-%m-%d").date()
                        except ValueError:
                            pass
                    rating = r[idx["RATING"]] if "RATING" in idx else None
                    currency = r[idx["FACEUNIT"]] if "FACEUNIT" in idx else None
                    amortization = r[idx["AMORTIZATION"]] if "AMORTIZATION" in idx else None
                    offer_date = None
                    if "OFFERDATE" in idx and r[idx["OFFERDATE"]]:
                        try:
                            offer_date = datetime.strptime(r[idx["OFFERDATE"]], "%Y-%m-%d").date()
                        except ValueError:
                            pass
                    # Собираем все поля для поиска
                    blob_parts = [
                        emitent or "",
                        shortnm or "",
                        secname or "",
                        isin or "",
                        secid or ""
                    ]
                    blob = " ".join(blob_parts).lower()

                    # Если query пустой — берём всё, иначе фильтруем
                    if (not q_lower or q_lower in blob) and secid not in seen:
                        seen.add(secid)
                        results.append({
                            "secid": secid,
                            "isin": isin,
                            "name": shortnm or secname,
                            "emitent": emitent,
                            "market": market,
                            "coupon": coupon or 0.0,
                            "maturity_date": maturity_date,
                            "rating": rating,
                            "currency": currency,
                            "amortization": amortization,
                            "offer_date": offer_date
                        })

                if len(rows) < limit:
                    break
                start += limit

    print(f"DEBUG: found {len(results)} bonds total")
    return results

async def upsert_bond(session: AsyncSession, sec: dict):
    stmt = insert(Bond).values(**sec).on_conflict_do_update(
        index_elements=["secid"],
        set_=sec
    )
    await session.execute(stmt)

def _apply_filters(sec, filters):
    if filters["coupon_from"] is not None and sec["coupon"] < filters["coupon_from"]:
        return False
    if filters["coupon_to"] is not None and sec["coupon"] > filters["coupon_to"]:
        return False
    if filters["maturity_from"] and sec["maturity_date"] < filters["maturity_from"]:
        return False
    if filters["maturity_to"] and sec["maturity_date"] > filters["maturity_to"]:
        return False
    if filters["rating"] and sec.get("rating") != filters["rating"]:
        return False
    return True

# ─── ПАРАМЕТРЫ КЭША ───────────────────────
CACHE_TTL = 600       # сек (10 минут)
CACHE_MAXSIZE = 1000  # макс. записей

# ─── СТРУКТУРА КЭША ───────────────────────
# ключ -> (timestamp_expire, value)
_cache: Dict[str, Tuple[float, Any]] = {}

def _make_key(query: str, params: dict) -> str:
    """
    Формирует хеш-ключ по запросу и всем параметрам.
    """
    src = f"{query}|{sorted(params.items())}"
    return hashlib.sha1(src.encode()).hexdigest()

def _get_from_cache(key: str) -> Any:
    """
    Возвращает value из кэша или None, если нет / просрочено.
    """
    entry = _cache.get(key)
    if not entry:
        return None
    expire_at, val = entry
    if time.time() > expire_at:
        del _cache[key]
        return None
    return val

def _set_to_cache(key: str, value: Any) -> None:
    """
    Ставит в кэш, очищая самый старый при переполнении.
    """
    # уборка просроченных
    now = time.time()
    for k, (exp, _) in list(_cache.items()):
        if exp < now:
            del _cache[k]

    if len(_cache) >= CACHE_MAXSIZE:
        # удаляем случайный (или самый старый) элемент
        oldest = min(_cache.items(), key=lambda i: i[1][0])[0]
        del _cache[oldest]

    _cache[key] = (now + CACHE_TTL, value)