# backend/app/models.py
from sqlalchemy import Column, String, Date, Float, Integer, ForeignKey, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Bond(Base):
    __tablename__ = "bonds"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    secid         = Column(String, unique=True, index=True, nullable=True)
    isin = Column(String, nullable=True)
    name          = Column(String, nullable=True)
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
