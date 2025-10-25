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

class CouponOut(BaseModel):
    date: date
    value: Optional[float] = None
    currency: str | None = None

    model_config = ConfigDict(from_attributes=True)
    
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
    coupons: list[CouponOut] = []
    day_open: Optional[float]
    week_open: Optional[float]
    month_open: Optional[float]
    year_open: Optional[float]
    last_buy_price: Optional[float] = None
    stale: bool = False
    stale_reason: Optional[str] = None
    nkd: Optional[float] = None
    
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

class BondShort(BaseModel):
    id: int
    name: str
    currency: Optional[str] = None
    currency_symbol: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class TradeIn(BaseModel):
    bond_id: int
    buy_date: Optional[date] = None
    buy_price: Optional[float] = None
    buy_qty: Optional[int] = None
    buy_nkd: Optional[float] = None
    sell_date: Optional[date] = None
    sell_price: Optional[float] = None
    sell_qty: Optional[int] = None
    sell_nkd: Optional[float] = None

class TradeOut(TradeIn):
    id: int
    bond_id: int
    buy_date: Optional[date]
    buy_price: Optional[float]
    buy_qty: Optional[int]
    buy_nkd: Optional[float]
    sell_date: Optional[date]
    sell_price: Optional[float]
    sell_qty: Optional[int]
    sell_nkd: Optional[float]
    total_amount: Optional[float]
    bond: Optional[BondShort] 
    fx_rate: Optional[float] = None
    buy_commission: Optional[float] = None
    sell_commission: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)

class TradeCreate(BaseModel):
    bond_id: int
    buy_date: Optional[date] = None
    buy_price: Optional[float] = None
    buy_qty: Optional[int] = None
    buy_nkd: Optional[float] = None
    sell_date: Optional[date] = None
    sell_price: Optional[float] = None
    sell_qty: Optional[int] = None
    sell_nkd: Optional[float] = None
    total_amount: Optional[float] = None
    fx_rate: Optional[float] = None
    buy_commission: Optional[float] = None
    sell_commission: Optional[float] = None

# Базовая схема (общие поля)
class PortfolioSummaryBase(BaseModel):
    invested: float
    trades_sum: float
    coupon_profit: float
    current_value: float
    total_value: float
    profit_percent: float

# Для ответа (GET/PUT)
class PortfolioSummaryOut(BaseModel):
    invested: float
    trades_sum: float
    coupon_profit: float
    current_value: float
    total_value: float
    profit_percent: float

    class Config:
        from_attributes = True

# Для входных данных (PUT) — только "Вложено"
class PortfolioSummaryIn(BaseModel):
    invested: float

# Модель позиции
class Position(BaseModel):
    bond_id: int
    buy_qty: int
    buy_price: Optional[float] = None
    buy_date: Optional[str] = None

class BondWithWeightOut(BaseModel):
    id: int
    secid: str
    name: str
    last_price: Optional[float] = None
    total_qty: Optional[int] = None
    bond_value: Optional[float] = None
    weight: Optional[float] = None

class FxRateOut(BaseModel):
    currency: str
    rate: float
    updated_at: Optional[datetime]