# backend/app/models.py
from sqlalchemy import Column, String, Date, Float, Integer, ForeignKey, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
from datetime import datetime

class Bond(Base):
    __tablename__ = "bonds"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    secid         = Column(String, unique=True, index=True, nullable=True)
    isin = Column(String, nullable=True)
    name          = Column(String, nullable=False)
    emitent       = Column(String, index=True, nullable=True)
    market        = Column(String, index=True, nullable=True)
    coupon        = Column(Float, nullable=True)
    coupon_display = Column(String, nullable=True) 
    coupon_type  = Column(String, nullable=True)
    maturity_date = Column(Date, index=True, nullable=True)
    # rating        = Column(String, index=True, nullable=True)
    ytm          = Column(Float, nullable=True) 
    ytm_date     = Column(Date,  nullable=True) 
    last_price = Column(Float, nullable=True)    
    amortization = Column(Boolean, nullable=True)     
    offer_date = Column(Date, nullable=True)  
    # связь с таблицей цен
    prices = relationship("Price", back_populates="bond", cascade="all, delete-orphan")
    akra_rating = Column(String, nullable=True)
    akra_forecast = Column(String, nullable=True)
    raexpert_rating = Column(String, nullable=True)
    raexpert_forecast = Column(String, nullable=True)
    nkr_rating = Column(String, nullable=True)
    nkr_forecast = Column(String, nullable=True)
    currency = Column(String, nullable=True)         # код или название валюты
    currency_symbol = Column(String, nullable=True)  # ₽, $, €, ¥
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    trades = relationship("Trade", back_populates="bond", cascade="all, delete-orphan")
    coupons = relationship("Coupon", back_populates="bond", cascade="all, delete-orphan")
    # поля для сравнения цены
    day_open = Column(Float, nullable=True)
    week_open = Column(Float, nullable=True)
    month_open = Column(Float, nullable=True)
    year_open = Column(Float, nullable=True)
    stale_reason = Column(String, nullable=True) 
    nkd = Column(Float, nullable=True) 

class Price(Base):
    __tablename__ = "prices"

    id      = Column(Integer, primary_key=True, autoincrement=True)
    bond_id = Column(Integer, ForeignKey("bonds.id"), nullable=False)
    date    = Column(Date, nullable=False)
    value   = Column(Float, nullable=False)

    # обратная связь
    bond = relationship("Bond", back_populates="prices")

# Хранить логи в БД
class EventLog(Base):
    __tablename__ = "event_logs"

    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    message = Column(String, nullable=False)

class Trade(Base):
    __tablename__ = "trades"

    id = Column(Integer, primary_key=True, index=True)
    bond_id = Column(Integer, ForeignKey("bonds.id"), nullable=False)
    date = Column(Date, nullable=True)

    buy_date = Column(Date, nullable=True)
    buy_price = Column(Float, nullable=True)
    buy_qty = Column(Integer, nullable=True)
    buy_nkd = Column(Float, nullable=True)
    buy_commission = Column(Float, nullable=True)
    sell_date = Column(Date, nullable=True)
    sell_price = Column(Float, nullable=True)
    sell_qty = Column(Integer, nullable=True)
    sell_nkd = Column(Float, nullable=True)
    sell_commission = Column(Float, nullable=True)

    total_amount = Column(Float, nullable=True)  
    bond = relationship("Bond", back_populates="trades")

    fx_rate = Column(Float, nullable=True)

class Coupon(Base):
    __tablename__ = "coupons"

    id = Column(Integer, primary_key=True)
    bond_id = Column(Integer, ForeignKey("bonds.id", ondelete="CASCADE"))
    date = Column(Date, nullable=False)
    value = Column(Float, nullable=True)
    currency = Column(String, nullable=True)

    bond = relationship("Bond", back_populates="coupons")

class PortfolioSummaryDB(Base):
    __tablename__ = "portfolio_summary"

    id = Column(Integer, primary_key=True, index=True)
    invested = Column(Float, default=0.0)
    trades_sum = Column(Float, default=0.0)
    coupon_profit = Column(Float, default=0.0)
    current_value = Column(Float, default=0.0)
    total_value = Column(Float, default=0.0)
    profit_percent = Column(Float, default=0.0)

class FxRate(Base):
    __tablename__ = "fx_rates"
    currency = Column(String(8), primary_key=True)   # например "USD", "EUR"
    rate = Column(Float, nullable=False)             # рублей за 1 unit валюты
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)