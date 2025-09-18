# backend/app/schemas.py
from pydantic import BaseModel, ConfigDict, computed_field
from typing import Optional
from datetime import date, datetime
import logging

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Входная схема — только secid
class BondIn(BaseModel):
    secid: str

# Схема для поиска (данные с MOEX, без id)
class BondSearchOut(BaseModel):
    secid: str
    isin: Optional[str] = None
    name: Optional[str] = None
    emitent: Optional[str] = None
    market: Optional[str] = None
    coupon: Optional[float] = None
    maturity_date: Optional[str] = None
    rating: Optional[str] = None

# Схема для работы с БД (с id)
class BondOut(BaseModel):
    id: int
    secid: str
    isin: Optional[str] = None
    name: Optional[str] = None
    emitent: Optional[str] = None
    market: Optional[str] = None
    coupon: Optional[float] = None
    maturity_date: Optional[date] = None
    ytm: Optional[float] = None
    ytm_date: Optional[date] = None
    coupon_type: Optional[str] = None
    coupon_display: Optional[str] = None
    # Pydantic v2: разрешаем читать атрибуты ORM-объекта
    model_config = ConfigDict(from_attributes=True)
    last_price: Optional[float] = None
    offer_date: Optional[date] = None
    amortization: Optional[bool] = None
    akra_rating: Optional[str] = None
    akra_forecast: Optional[str] = None
    raexpert_rating: Optional[str] = None
    raexpert_forecast: Optional[str] = None
    nkr_rating: Optional[str] = None
    nkr_forecast: Optional[str] = None
    currency: Optional[str] = None
    currency_symbol: Optional[str] = None
    updated_at: datetime | None = None
    
    @computed_field
    @property
    def rating(self) -> str:
        parts = []
        if self.akra_rating:
            parts.append(f"АКРА: {self.akra_rating}" + (f" ({self.akra_forecast})" if self.akra_forecast else ""))
        if self.raexpert_rating:
            parts.append(f"ЭкспРА: {self.raexpert_rating}" + (f" ({self.raexpert_forecast})" if self.raexpert_forecast else ""))
        if self.nkr_rating:
            parts.append(f"НКР: {self.nkr_rating}" + (f" ({self.nkr_forecast})" if self.nkr_forecast else ""))
        return "\n".join(parts) if parts else "Нет рейтинга"

    @computed_field
    @property
    def amortization_display(self) -> str:
        return "Есть" if self.amortization else "-"
    
class EventLogOut(BaseModel):
    id: int
    timestamp: datetime
    message: str
    # Pydantic v2
    model_config = ConfigDict(from_attributes=True)

class EventLogIn(BaseModel):
    message: str