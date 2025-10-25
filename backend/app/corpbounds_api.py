# backend/app/corpbonds_api.py
from bs4 import BeautifulSoup
import httpx, re
import logging
from typing import Optional
from . import other

logger = logging.getLogger(__name__)

def _norm(txt: str) -> str:
    """Убираем лишние пробелы и неразрывные пробелы."""
    cleaned = txt.replace("∑", "")
    return " ".join(cleaned.replace("\xa0", " ").split()).strip()

def _looks_like_formula(txt: str) -> bool:
    """Определяем, похоже ли значение на формулу, а не на рейтинг или просто число."""
    t = txt.lower()
    # Должно содержать ключевые слова формулы
    if not any(key in t for key in ["кс", "kc", "mosprime", "ruonia", "ключ"]):
        return False
    # Не должно содержать слова про рейтинги
    if any(bad in t for bad in ["акра", "эксперт ра", "нкр"]):
        return False
    return True

async def fetch_ratings_from_corpbonds(code: str, is_ofz: bool = False):
    """
    code — ISIN для обычных бумаг, SECID для ОФЗ
    is_ofz — True, если это ОФЗ
    """
    url = f"https://corpbonds.ru/bond/{code}"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url)
        r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")

    # --- Цена ---
    price_val = None
    price_el = soup.select_one(
        "#root > main > section > main > article:nth-child(1) > table > tbody > tr:nth-child(6) > td:nth-child(2) > p"
    )
    if price_el:
        m = re.search(r"[\d\s,]+", price_el.get_text())
        if m:
            try:
                price_val = float(m.group(0).replace(" ", "").replace(",", "."))
            except ValueError:
                pass

    # --- YTM (для ОФЗ, по точному селектору) ---
    ytm_val = None
    if is_ofz:
        # Эквивалент твоему XPath:
        # /html/body/div[1]/main/section/main/article[1]/table/tbody/tr[2]/td[2]/p/span[1]
        # В CSS без tbody и индексируем через :nth-of-type(...)
        sel = "main section main article:nth-of-type(1) table tr:nth-of-type(2) td:nth-of-type(2) p span"
        el = soup.select_one(sel)
        if not el:
            # иногда у corpbonds у этого <span> есть класс .val — пробуем его
            el = soup.select_one("main section main article:nth-of-type(1) table tr:nth-of-type(2) td:nth-of-type(2) p span.val")
        if el:
            raw = el.get_text(strip=True)
            # logger.debug(f"YTM raw text (direct): {raw}")
            cleaned = raw.replace("%", "").replace("\xa0", "").replace(" ", "")
            try:
                ytm_val = float(cleaned.replace(",", "."))
                # logger.debug(f"YTM parsed (direct): {ytm_val}")
            except ValueError:
                logger.debug("YTM parse failed (direct), leaving as None")
                ytm_val = None



    ratings = {
        "akra": {"rating": None, "forecast": None},
        "raexpert": {"rating": None, "forecast": None},
        "nkr": {"rating": None, "forecast": None},
        "coupon_type": None,
        "coupon_rate": None,
        "currency": None,
        "last_price": price_val,
        "ytm": ytm_val,
    }

    # --- Рейтинги ---
    rating_div = soup.find("div", class_="text-rating")
    if rating_div:
        for p in rating_div.find_all("p"):
            text = _norm(p.get_text())
            low = text.lower()
            if low.startswith("акра"):
                ratings["akra"]["rating"] = text.replace("АКРА", "").strip()
            elif low.startswith("эксперт ра"):
                ratings["raexpert"]["rating"] = text.replace("Эксперт РА", "").strip()
            elif low.startswith("нкр"):
                ratings["nkr"]["rating"] = text.replace("НКР", "").strip()

    # --- Таблица характеристик ---
    table = soup.select_one("#root main section main article:nth-child(2) table")
    if table:
        for tr in table.select("tbody > tr"):
            cells = tr.find_all("td")
            if len(cells) < 2:
                continue
            key = _norm(cells[0].get_text()).lower()
            val = _norm(cells[1].get_text())

            if "тип купона" in key:
                ratings["coupon_type"] = val
            elif any(k in key for k in ["ставка купона", "процентная ставка", "плавающая ставка"]):
                if _looks_like_formula(val):
                    ratings["coupon_rate"] = val
                else:
                    for p in cells[1].select("p"):
                        txt = _norm(p.get_text())
                        if _looks_like_formula(txt):
                            ratings["coupon_rate"] = txt
                            break
                    if not ratings["coupon_rate"]:
                        for part in val.split("\n"):
                            if _looks_like_formula(part):
                                ratings["coupon_rate"] = _norm(part)
                                break
            elif "валюта" in key:
                ratings["currency"] = _norm(val)

    if not ratings["coupon_rate"]:
        for p in soup.select("p.val"):
            txt = _norm(p.get_text())
            if _looks_like_formula(txt):
                ratings["coupon_rate"] = txt
                break
    return ratings

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