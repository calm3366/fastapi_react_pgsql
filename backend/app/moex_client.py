# backend/app/moex_client.py
import httpx, logging, re
from typing import Optional
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
from datetime import datetime, date, timedelta
from types import SimpleNamespace
from bs4 import BeautifulSoup

_ISIN_RE = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}[0-9]$")

MOEX_BASE = "https://iss.moex.com/iss"

# Текущие рынки, которые ты уже перебираешь
MARKETS = [
    "bonds",
    "corporate_bonds",
    "municipal_bonds",
    "subfederal_bonds",
    "ofz",  # добавляем явный рынок ОФЗ
]

logger = logging.getLogger(__name__)

class BondMoex(BaseModel):
    record: Dict[str, Any]

def _is_isin(identifier: str) -> bool:
    return bool(_ISIN_RE.fullmatch(identifier.strip().upper()))

async def _get_secid_by_isin(isin: str, timeout: float) -> Optional[str]:
    isin_up = isin.strip().upper()

    # 1. Глобальный поиск
    url = "https://iss.moex.com/iss/securities.json"
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(url, params={
            "isin": isin_up,
            "iss.meta": "off",
            "iss.only": "securities"
        })
        resp.raise_for_status()
        sec_block = resp.json().get("securities", {})
        cols = sec_block.get("columns", [])
        rows = sec_block.get("data", [])
        if rows:
            first = dict(zip(cols, rows[0]))
            secid = (first.get("SECID") or "").upper()
            if secid:
                return secid

    # 2. Поиск по рынкам
    markets = ["bonds", "ofz", "corporate_bonds", "municipal_bonds", "subfederal_bonds"]
    for m in markets:
        url = f"https://iss.moex.com/iss/engines/stock/markets/{m}/securities.json"
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, params={"iss.meta": "off", "limit": 5000})
            resp.raise_for_status()
            tbl = resp.json().get("securities", {})
            cols = tbl.get("columns", [])
            for row in tbl.get("data", []):
                rec = dict(zip(cols, row))
                if rec.get("ISIN", "").upper() == isin_up:
                    return (rec.get("SECID") or "").upper() or None
    return None


async def detect_amortization_from_corpbonds(bond_code: str) -> Optional[bool]:
    url = f"https://corpbonds.ru/bond/{bond_code}"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        # Ищем ячейку с текстом "Амортизация"
        rows = soup.select("article.bond-info__item table tbody tr")
        for row in rows:
            cells = row.find_all("td")
            if len(cells) >= 2 and "амортизац" in cells[0].get_text(strip=True).lower():
                val = cells[1].get_text(strip=True).lower()
                if val == "да":
                    return True
                if val == "нет":
                    return False
        return None


async def fetch_bond_from_moex(secid_or_isin: str):
    secid_or_isin = secid_or_isin.strip().upper()

    async with httpx.AsyncClient(timeout=10) as client:
        # 1. Перебор рынков
        for market in MARKETS:
            url = f"{MOEX_BASE}/engines/stock/markets/{market}/securities.json"
            params = {"iss.meta": "off", "limit": 5000}
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()
            columns = data["securities"]["columns"]
            for row in data["securities"]["data"]:
                rec = dict(zip(columns, row))
                if rec.get("SECID") == secid_or_isin or rec.get("ISIN") == secid_or_isin:
                    logger.debug("Found %s in market %s", secid_or_isin, market)
                    return SimpleNamespace(record=rec)

        # 2. Fallback — прямой поиск по ISIN
        logger.debug("Trying direct ISIN search for %s", secid_or_isin)
        url = f"{MOEX_BASE}/securities.json"
        params = {"isin": secid_or_isin, "iss.meta": "off"}
        r = await client.get(url, params=params)
        r.raise_for_status()
        data = r.json()
        columns = data["securities"]["columns"]
        if data["securities"]["data"]:
            rec = dict(zip(columns, data["securities"]["data"][0]))
            logger.debug("Found %s via direct ISIN search", secid_or_isin)
            return SimpleNamespace(record=rec)

    logger.warning("ISIN/SECID %s not found on MOEX", secid_or_isin)
    return None

async def fetch_coupons_from_moex(secid: str) -> list[dict]:
    """
    Возвращает список купонов в формате:
    [{"date": date, "value": float|None, "currency": "RUB", "is_past": bool}, ...]
    - Берём все купоны начиная с года назад и до будущего
    - Добавляем флаг is_past (True если купон <= сегодня)
    """
    url = f"https://iss.moex.com/iss/securities/{secid}/bondization.json"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url)
        r.raise_for_status()
        data = r.json()

    coupons = []
    cols = data["coupons"]["columns"]

    today = date.today()
    year_ago = today - timedelta(days=365)

    for row in data["coupons"]["data"]:
        row_dict = dict(zip(cols, row))

        # Дата купона
        date_val = None
        if row_dict.get("coupondate"):
            try:
                date_val = date.fromisoformat(row_dict["coupondate"])
            except ValueError:
                pass

        if not date_val:
            continue

        # фильтруем: только за последний год и будущее
        if date_val < year_ago:
            continue

        # Значение купона
        raw_value = row_dict.get("value")
        if raw_value in (None, ""):
            value = None
        else:
            try:
                value = float(str(raw_value).replace(",", "."))
            except (ValueError, TypeError):
                value = None

        coupons.append({
            "date": date_val,
            "value": value,
            "currency": row_dict.get("currency"),
            "is_past": date_val <= today
        })

    # сортировка по дате
    coupons.sort(key=lambda c: c["date"])
    return coupons