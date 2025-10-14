from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app import models

# Сумма сделок
async def calc_trades_sum(session: AsyncSession) -> float:
    result = await session.execute(
        select(func.coalesce(func.sum(models.Trade.total_amount), 0.0))
    )
    return result.scalar_one()

# Прибыль от купонов (с учётом даты покупки)
async def calc_coupon_profit(session: AsyncSession) -> float:
    from datetime import date
    today = date.today()

    result = await session.execute(
        select(func.coalesce(func.sum(models.Coupon.value * models.Trade.buy_qty), 0.0))
        .join(models.Trade, models.Trade.bond_id == models.Coupon.bond_id)
        .where(models.Coupon.date >= models.Trade.buy_date)
        .where(models.Coupon.date <= today)
    )
    return result.scalar_one()

# Текущая стоимость портфеля (по последней цене из Price)
async def calc_current_value(session: AsyncSession) -> float:
    result = await session.execute(
        select(func.coalesce(func.sum(models.Trade.buy_qty * models.Bond.last_price), 0.0))
        .join(models.Bond, models.Bond.id == models.Trade.bond_id)
    )
    return result.scalar_one()
