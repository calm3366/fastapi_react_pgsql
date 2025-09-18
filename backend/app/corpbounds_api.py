# backend/app/corpbonds_api.py
from bs4 import BeautifulSoup
import httpx, re
import logging

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

    # --- Цена (для всех бумаг) ---
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

    # --- YTM (только для ОФЗ) ---
    ytm_val = None
    if is_ofz:
        ytm_el = soup.select_one(
            "#root > main > section > main > article:nth-child(1) > table > tbody > tr:nth-child(2) > td:nth-child(2) > p > span:nth-child(1)"
        )
        if ytm_el:
            m = re.search(r"[\d\s,]+", ytm_el.get_text())
            if m:
                try:
                    ytm_val = float(m.group(0).replace(" ", "").replace(",", "."))
                except ValueError:
                    pass

    # --- Рейтинги ---
    ratings = {
        "akra": {"rating": None, "forecast": None},
        "raexpert": {"rating": None, "forecast": None},
        "nkr": {"rating": None, "forecast": None},
        "coupon_type": None,
        "coupon_rate": None,
        "currency": None,
        "last_price": price_val,
        "ytm": ytm_val
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
    table = soup.select_one("#root > main > section > main > article:nth-child(2) > table")
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
                # Проверяем само значение
                if _looks_like_formula(val):
                    ratings["coupon_rate"] = val
                else:
                    # Ищем формулу внутри ячейки (<p>)
                    for p in cells[1].select("p"):
                        txt = _norm(p.get_text())
                        if _looks_like_formula(txt):
                            ratings["coupon_rate"] = txt
                            break
                    # Если <p> нет или не нашли — пробуем по <br> или \n
                    if not ratings["coupon_rate"]:
                        for part in val.split("\n"):
                            if _looks_like_formula(part):
                                ratings["coupon_rate"] = _norm(part)
                                break

            elif "валюта" in key:
                ratings["currency"] = _norm(val)

    # --- Fallback: ищем формулу по всему документу ---
    if not ratings["coupon_rate"]:
        for p in soup.select("p.val"):
            txt = _norm(p.get_text())
            if _looks_like_formula(txt):
                ratings["coupon_rate"] = txt
                break

    logger.debug(f"Corpbonds parsed: {code} -> {ratings}")
    return ratings
