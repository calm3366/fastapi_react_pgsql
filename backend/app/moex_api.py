# backend/app/moex_api.py
import httpx, hashlib, requests, logging
from fastapi import APIRouter, Query
from typing import Optional, Any, Dict, Tuple, List
from datetime import date, datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas import BondOut

router = APIRouter()

BASE_MARKET_URL = "https://iss.moex.com/iss/engines/stock/markets/{market}/securities.json"
APIRouter()

logger = logging.getLogger(__name__)

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



# универсальный помощник при некорректном соединении
async def _safe_request(url: str) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url)
            r.raise_for_status()
            return r.json()
    except httpx.RequestError as e:
        logger.warning(f"Сетевая ошибка при запросе {url}: {e}")
    except httpx.HTTPStatusError as e:
        logger.warning(f"MOEX вернул {e.response.status_code} для {url}")
    except Exception as e:
        logger.warning(f"Неожиданная ошибка при запросе {url}: {e}")
    return None



# --- утилиты для получения цены открытия ---
async def get_day_open(secid: str) -> float | None:
    # 1. Сначала пробуем marketdata (актуальные данные за сегодня)
    url = f"https://iss.moex.com/iss/engines/stock/markets/bonds/securities/{secid}.json"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        logger.warning(f"Ошибка запроса marketdata для {secid}: {e}")
        data = None

    if data:
        try:
            rows = data.get("marketdata", {}).get("data", [])
            cols = data.get("marketdata", {}).get("columns", [])
            if rows:
                open_idx = cols.index("OPEN")
                face_idx = cols.index("FACEVALUE") if "FACEVALUE" in cols else None
                raw_open = rows[0][open_idx]
                if raw_open is not None:
                    facevalue = rows[0][face_idx] if face_idx is not None else 1000
                    return float(raw_open) * float(facevalue or 1000) / 100.0
        except Exception as e:
            logger.warning(f"Ошибка парсинга marketdata для {secid}: {e}")

    # 2. Если marketdata пусто — ищем последний торговый день в history
    for i in range(5):  # проверим последние 5 дней
        d = date.today() - timedelta(days=i)
        url = (
            f"https://iss.moex.com/iss/history/engines/stock/markets/bonds/"
            f"securities/{secid}.json?from={d}&till={d}"
        )
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(url)
                r.raise_for_status()
                data = r.json()
        except Exception as e:
            logger.warning(f"Ошибка запроса history для {secid} ({d}): {e}")
            continue

        try:
            rows = data.get("history", {}).get("data", [])
            cols = data.get("history", {}).get("columns", [])
            if not rows:
                continue
            open_idx = cols.index("OPEN")
            face_idx = cols.index("FACEVALUE") if "FACEVALUE" in cols else None
            raw_open = rows[0][open_idx]
            if raw_open is None:
                continue
            facevalue = rows[0][face_idx] if face_idx is not None else 1000
            return float(raw_open) * float(facevalue or 1000) / 100.0
        except Exception as e:
            logger.warning(f"Ошибка парсинга history для {secid} ({d}): {e}")
            continue

    return None


async def get_week_month_open(secid: str, from_date: date) -> float | None:
    url = (
        f"https://iss.moex.com/iss/history/engines/stock/markets/bonds/"
        f"securities/{secid}.json?from={from_date}&till={from_date}"
    )
    data = await _safe_request(url)
    if not data:
        return None

    try:
        rows = data.get("history", {}).get("data", [])
        cols = data.get("history", {}).get("columns", [])
        if not rows:
            return None
        open_idx = cols.index("OPEN")
        face_idx = cols.index("FACEVALUE") if "FACEVALUE" in cols else None
        raw_open = rows[0][open_idx]
        if raw_open is None:
            return None
        facevalue = rows[0][face_idx] if face_idx is not None else 1000
        return float(raw_open) * float(facevalue or 1000) / 100.0
    except Exception as e:
        logger.warning(f"Ошибка парсинга week/month_open для {secid}: {e}")
        return None


async def get_year_open(secid: str, year: int) -> float | None:
    first_day = date(year, 1, 1)
    # ищем ближайший торговый день вперёд
    for i in range(10):
        d = first_day + timedelta(days=i)
        url = (
            f"https://iss.moex.com/iss/history/engines/stock/markets/bonds/"
            f"securities/{secid}.json?from={d}&till={d}"
        )
        data = await _safe_request(url)
        if not data:
            continue
        try:
            rows = data.get("history", {}).get("data", [])
            cols = data.get("history", {}).get("columns", [])
            if not rows:
                continue
            open_idx = cols.index("OPEN")
            face_idx = cols.index("FACEVALUE") if "FACEVALUE" in cols else None
            raw_open = rows[0][open_idx]
            if raw_open is None:
                continue
            facevalue = rows[0][face_idx] if face_idx is not None else 1000
            return float(raw_open) * float(facevalue or 1000) / 100.0
        except Exception as e:
            logger.warning(f"Ошибка парсинга year_open для {secid} ({d}): {e}")
            continue
    return None