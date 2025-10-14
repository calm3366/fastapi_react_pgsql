# backend/app/crud.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models import Bond, Trade


async def get_bonds_with_weights(db: AsyncSession):
    # 1. Считаем общую стоимость портфеля
    total_value_result = await db.execute(
        select(func.sum(Trade.buy_qty * Bond.last_price))
        .join(Bond, Bond.id == Trade.bond_id)
    )
    total_value = total_value_result.scalar() or 0

    # 2. Считаем позиции по каждой бумаге
    portfolio_result = await db.execute(
        select(
            Trade.bond_id,
            func.sum(Trade.buy_qty).label("total_qty"),
            func.sum(Trade.buy_qty * Bond.last_price).label("bond_value"),
            Bond.secid,
            Bond.name,
            Bond.last_price
        )
        .join(Bond, Bond.id == Trade.bond_id)
        .group_by(Trade.bond_id, Bond.secid, Bond.name, Bond.last_price)
    )
    portfolio = portfolio_result.all()

    # 3. Формируем результат
    result = []
    for bond_id, total_qty, bond_value, secid, name, last_price in portfolio:
        weight = round((bond_value / total_value) * 100, 2) if total_value else 0.0
        result.append({
            "id": bond_id,
            "secid": secid,
            "name": name,
            "last_price": float(last_price or 0),
            "total_qty": int(total_qty or 0),
            "bond_value": float(bond_value or 0),
            "weight": weight,
        })

    return result
