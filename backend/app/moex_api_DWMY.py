# backend/app/moex_api_DWMY.py
import httpx, hashlib, requests, logging
from fastapi import APIRouter, Query
from typing import Optional, Any, Dict, Tuple, List, Iterable
from datetime import date, datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas import BondOut
from statistics import median

logger = logging.getLogger("app.moex_open")


HTTP_TIMEOUT = 10.0
LOOKAHEAD_DAYS = 5  # для week/month пробуем следующие N дней

async def fetch_json(url: str, timeout: float = HTTP_TIMEOUT) -> Optional[dict]:
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(url)
            r.raise_for_status()
            return r.json()
    except Exception:
        return None

# Получение day_open из securities endpoint (marketdata.data[9] и securities.data[11])
async def get_day_open_from_securities(secid: str) -> Optional[float]:
    """
    Try to compute day_open from securities endpoint.
    If OPEN is missing in the first marketdata row, scan following rows
    and pick the first row with a valid OPEN and a usable FACE value.
    """
    url = f"https://iss.moex.com/iss/engines/stock/markets/bonds/securities/{secid}.json"
    data = await fetch_json(url)
    if not data:
        return None

    md_rows = data.get("marketdata", {}).get("data") or []
    md_cols = data.get("marketdata", {}).get("columns") or []
    sec_rows = data.get("securities", {}).get("data") or []
    sec_cols = data.get("securities", {}).get("columns") or []

    try:
        md_map = {c: i for i, c in enumerate(md_cols)}
        sec_map = {c: i for i, c in enumerate(sec_cols)}

        if not md_rows:
            return None

        # Find first marketdata row that contains a usable OPEN and a face (from securities or marketdata)
        chosen_open = None
        chosen_face = None

        # helper to extract face from securities rows if available
        def _face_from_securities():
            if not sec_rows:
                return None
            # try known keys in securities columns
            for key in ("FACEVALUE", "FACE", "FACEVALUE_RUR", "FACEUNIT"):
                idx = sec_map.get(key)
                if idx is not None and sec_rows and idx < len(sec_rows[0]):
                    val = sec_rows[0][idx]
                    if val is not None:
                        return val
            return None

        # pre-read face from securities section (preferred)
        sec_face_val = _face_from_securities()

        # iterate over marketdata rows to find OPEN and face
        for row in md_rows:
            # attempt to extract OPEN from marketdata row
            open_idx = md_map.get("OPEN")
            open_val = None
            if open_idx is not None and open_idx < len(row):
                open_val = row[open_idx]
            else:
                # try alternative names if present in md_map
                for alt in ("OPENPRICE", "PRICE_OPEN"):
                    alt_idx = md_map.get(alt)
                    if alt_idx is not None and alt_idx < len(row):
                        open_val = row[alt_idx]
                        break

            if open_val is None:
                # no open in this row, continue to next
                continue

            # determine face: prefer securities face if available, otherwise try to read from the same marketdata row
            face_val = sec_face_val
            if face_val is None:
                # try to get FACEVALUE or FACE from marketdata row (md_map)
                for key in ("FACEVALUE", "FACE", "FACEVALUE_RUR", "FACEUNIT"):
                    idx = md_map.get(key)
                    if idx is not None and idx < len(row):
                        candidate = row[idx]
                        if candidate is not None:
                            face_val = candidate
                            break

            # if still no face, skip this row
            if open_val is None or face_val is None:
                continue

            # try parse numeric values
            try:
                face = float(face_val)
                open_pct = float(open_val)
            except Exception:
                # parsing failed, try next row
                continue

            # compute price and return
            price = (open_pct * face) / 100.0
            price = float(round(price, 6))
            # logger.info("day_open from securities for %s -> %s (OPEN=%s FACE=%s source=marketdata/scanned)", secid, price, open_val, face)
            return price

        # nothing found after scanning rows
        logger.info("no valid OPEN/ FACE found in marketdata for %s", secid)
        return None

    except Exception:
        logger.exception("day_open_from_securities failed for %s", secid)
        return None

# Получение history OPEN для конкретной даты (history.data[0][14], history.data[0][31])
async def get_history_open_for_date(secid: str, date_iso: str) -> Optional[float]:
    url = f"https://iss.moex.com/iss/history/engines/stock/markets/bonds/securities/{secid}.json?from={date_iso}&till={date_iso}"
    data = await fetch_json(url)
    if not data:
        return None

    rows = data.get("history", {}).get("data") or []
    cols = data.get("history", {}).get("columns") or []
    if not rows:
        return None

    try:
        row = rows[0]
        colmap = {c: i for i, c in enumerate(cols)}

        open_idx = colmap.get("OPEN")
        if open_idx is None:
            for alt in ("OPENPRICE", "PRICE_OPEN"):
                if alt in colmap:
                    open_idx = colmap[alt]
                    break
        if open_idx is None or open_idx >= len(row):
            return None
        open_val = row[open_idx]

        face_idx = colmap.get("FACEVALUE") or colmap.get("FACE") or colmap.get("FACEVALUE_RUR") or colmap.get("FACEUNIT")
        face_val = None
        if face_idx is not None and face_idx < len(row):
            face_val = row[face_idx]
        else:
            for k in ("FACEVALUE", "FACE"):
                if k in colmap and colmap[k] < len(row):
                    face_val = row[colmap[k]]
                    break

        if open_val is None or face_val is None:
            return None

        try:
            face = float(face_val)
        except Exception:
            return None

        open_pct = float(open_val)
        price = (open_pct * face) / 100.0
        price = float(round(price, 6))
        return price
    except Exception:
        return None

# Публичные функции get_day_open/get_week_open/get_month_open/get_year_open
async def get_day_open(secid: str) -> Optional[float]:
    return await get_day_open_from_securities(secid)

async def _find_history_with_lookahead(secid: str, date_ref: datetime, lookahead_days: int) -> Optional[float]:
    """
    Try to find history open starting from date_ref and scanning forward up to lookahead_days.
    Returns the first found value and logs the date that produced it. Logs a single message if nothing found.
    """
    found = None
    checked_dates = []
    for d in range(0, lookahead_days):
        dt = date_ref + timedelta(days=d)
        dt_iso = dt.date().isoformat()
        checked_dates.append(dt_iso)
        val = await get_history_open_for_date(secid, dt_iso)
        if val is not None:
            #  logger.info("found history open for %s at lookahead day %s -> %s", secid, dt_iso, val)
            found = val
            break
    # if found is None:
    #     logger.info("no history open found for %s in lookahead %s days from %s; checked=%s",
    #                 secid, lookahead_days, date_ref.date().isoformat(), ",".join(checked_dates))
    return found

async def get_week_open(secid: str, today: Optional[datetime] = None) -> Optional[float]:
    if today is None:
        today = datetime.utcnow()
    target = today - timedelta(days=7)
    return await _find_history_with_lookahead(secid, target, LOOKAHEAD_DAYS)

async def get_month_open(secid: str, today: Optional[datetime] = None) -> Optional[float]:
    if today is None:
        today = datetime.utcnow()
    target = today - timedelta(days=30)
    return await _find_history_with_lookahead(secid, target, LOOKAHEAD_DAYS)

async def get_year_open(secid: str, today: Optional[datetime] = None) -> Optional[float]:
    if today is None:
        today = datetime.utcnow()
    # look for exact date one year ago, but allow lookahead scanning similar to week/month logic
    target = today - timedelta(days=365)
    val = await _find_history_with_lookahead(secid, target, LOOKAHEAD_DAYS)
    return val

