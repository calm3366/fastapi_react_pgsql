# backend/app/moex_client.py
import httpx, logging, re
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
from datetime import datetime, date, timedelta
from types import SimpleNamespace
from bs4 import BeautifulSoup

_ISIN_RE = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}[0-9]$")

MOEX_BASE = "https://iss.moex.com/iss"

MARKETS = [
    "bonds",
    "corporate_bonds",
    "municipal_bonds",
    "subfederal_bonds",
    "ofz", 
]

logger = logging.getLogger(__name__)

class BondMoex(BaseModel):
    record: Dict[str, Any]


async def fetch_bond_from_moex(secid_or_isin: str):
    secid_or_isin = (secid_or_isin or "").strip().upper()
    if not secid_or_isin:
        return None

    async with httpx.AsyncClient(timeout=10) as client:
        # Попытка считать как SECID: прямо по странице бумаги в каждом рынке
        for market in MARKETS:
            url = f"{MOEX_BASE}/engines/stock/markets/{market}/securities/{secid_or_isin}.json"
            try:
                r = await client.get(url, params={"iss.meta": "off"})
            except Exception:
                # сетевые ошибки — пробуем следующий рынок
                continue

            # если ресурс не найден на этом рынке — идём дальше
            if r.status_code == 404:
                continue

            try:
                r.raise_for_status()
            except Exception:
                # другие ошибки статуса — пробуем следующий рынок
                continue

            try:
                data = r.json()
            except Exception:
                continue

            # данные секьюрити могут быть в data["securities"] или в других секциях,
            # но в странице конкретной бумаги обычно есть "securities" и "marketdata"
            rec = {}
            if data.get("securities") and data["securities"].get("data"):
                cols = data["securities"].get("columns", [])
                row = data["securities"]["data"][0]
                rec.update(dict(zip(cols, row)))

            # подтягиваем marketdata если есть
            if data.get("marketdata"):
                md_cols = data["marketdata"].get("columns", [])
                md_data = data["marketdata"].get("data") or []
                if md_data:
                    md_row = dict(zip(md_cols, md_data[0]))
                    rec.update(md_row)

                    # пересчёт LAST и LCURRENTPRICE в абсолют (умножаем на FACEVALUE/100)
                    try:
                        facevalue = float(rec.get("FACEVALUE") or 1000)
                    except Exception:
                        facevalue = 1000.0
                    try:
                        if md_row.get("LAST") is not None:
                            rec["LAST_ABS"] = float(md_row["LAST"]) * facevalue / 100.0
                    except Exception:
                        pass
                    try:
                        if md_row.get("LCURRENTPRICE") is not None:
                            rec["LCURRENTPRICE_ABS"] = float(md_row["LCURRENTPRICE"]) * facevalue / 100.0
                    except Exception:
                        pass

            # Если у нас есть хотя бы SECID или ISIN — считаем результат найденным
            if rec:
                return SimpleNamespace(record=rec)

        # Fallback: поиск по ISIN на общем endpoint
        # Если входной идентификатор уже был SECID, но не найден — всё равно пробуем поиск по isin
        try:
            url = f"{MOEX_BASE}/securities.json"
            params = {"isin": secid_or_isin, "iss.meta": "off"}
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()
            sec_data = data.get("securities", {})
            if sec_data.get("data"):
                rec = dict(zip(sec_data.get("columns", []), sec_data["data"][0]))
                return SimpleNamespace(record=rec)
        except Exception:
            pass

    return 


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


HTTP_TIMEOUT = 10.0

async def compute_last_price_from_iss(secid: str, timeout: float = HTTP_TIMEOUT) -> Optional[float]:
    """
    Логика:
    - Запрос: https://iss.moex.com/iss/engines/stock/markets/bonds/securities/[secid].json
    - Ищем FACEVALUE в секции securities; если в первой строке значение None/0 ищем в следующей строке
    - Ищем LAST в секции marketdata; проходим строки по порядку и берём первый ненулевой непустой LAST
    - Если LAST пуст/0 для всех строк, берём PREVPRICE из секции securities (по строкам, первой найденной)
    - Вычисляем last_price = FACEVALUE * (price_percent / 100)
    - Возвращаем float или None
    """
    url = f"https://iss.moex.com/iss/engines/stock/markets/bonds/securities/{secid}.json"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(url)
            r.raise_for_status()
            payload = r.json()
    except Exception:
        return None

    # секции
    sec_cols = payload.get("securities", {}).get("columns") or []
    sec_rows = payload.get("securities", {}).get("data") or []
    md_cols = payload.get("marketdata", {}).get("columns") or []
    md_rows = payload.get("marketdata", {}).get("data") or []

    # карты имени->индекс
    sec_map = {c: i for i, c in enumerate(sec_cols)}
    md_map = {c: i for i, c in enumerate(md_cols)}

    # helper: получить первое числовое значение колонки name из списка строк
    def first_numeric_from_rows(rows, colname_candidates):
        for colname in colname_candidates:
            idx = sec_map.get(colname) if rows is sec_rows else md_map.get(colname)
            if idx is None:
                continue
            for row in rows:
                if row is None or idx >= len(row):
                    continue
                v = row[idx]
                if v is None:
                    continue
                try:
                    num = float(v)
                except Exception:
                    continue
                if num == 0:
                    continue
                return num
        return None

    # Найти facevalue: пробуем несколько имен и каждую строку пока не найдём валидное число >0
    face_candidates = ["FACEVALUE", "FACE", "FACEVALUEONSETTLEDATE", "LOTVALUE"]
    face = None
    for name in face_candidates:
        idx = sec_map.get(name)
        if idx is None:
            continue
        for row in sec_rows:
            if not row or idx >= len(row):
                continue
            v = row[idx]
            if v is None:
                continue
            try:
                f = float(v)
            except Exception:
                continue
            if f <= 0:
                continue
            face = f
            break
        if face is not None:
            break

    if face is None:
        return None

    # Найти last% в marketdata: ищем FIRST non-null non-zero в колонках c приоритетом
    last_col_candidates = ["LAST", "LASTPRICE", "LASTTRADE", "LCUR", "LASTVALUE"]
    last_pct = first_numeric_from_rows(md_rows, last_col_candidates)

    # Если last_pct не найден, fallback к PREVPRICE в securities (перебираем строки)
    if last_pct is None:
        prev_idx = sec_map.get("PREVPRICE")
        if prev_idx is not None:
            for row in sec_rows:
                if not row or prev_idx >= len(row):
                    continue
                pv = row[prev_idx]
                if pv is None:
                    continue
                try:
                    pvf = float(pv)
                except Exception:
                    continue
                if pvf == 0:
                    continue
                last_pct = pvf
                break

    if last_pct is None:
        return None

    try:
        return round((last_pct * face) / 100.0, 6)
    except Exception:
        return None