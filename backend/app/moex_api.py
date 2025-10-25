# backend/app/moex_api.py
import httpx, hashlib, requests, logging
from fastapi import APIRouter, Query
from typing import Optional, Any, Dict, Tuple, List, Iterable
from datetime import date, datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas import BondOut
from statistics import median

BASE_MARKET_URL = "https://iss.moex.com/iss/engines/stock/markets/{market}/securities.json"
logger = logging.getLogger("app.moex_open")

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

# поиск значения НКД
def parse_nkd_from_rec(rec):
    # возможные ключи: ACCRUEDINT, ACCRUEDINTPERCENT, ACCRUEDINTPRICE
    for key in ("ACCRUEDINT", "ACCRUEDINTPRICE", "ACCRUEDINTPERCENT", "accruedint"):
        v = rec.get(key)
        if v is not None and v != "":
            try:
                return float(v)
            except Exception:
                # возможно строка с пробелами или символами — попытка очистки
                try:
                    return float(str(v).replace(",", ".").strip())
                except Exception:
                    continue
    return None