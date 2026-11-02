"""Position sizing, leverage selection and liquidation protection."""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

from .config import RiskCfg


@dataclass
class OrderPlan:
    leverage: int
    contracts: float
    margin: float
    notional: float
    stop_pct: float
    liq_pct: float
    risk_usdt: float
    note: str = ""


def liquidation_distance(leverage: float, mmr: float) -> float:
    """Approximate fractional price move that liquidates an isolated position."""
    return max(0.0, 1.0 / leverage - mmr)


def choose_leverage(grade: str, stop_pct: float, cfg: RiskCfg, market_max_leverage: Optional[int] = None):
    """Pick 50x for A+ setups, otherwise 20x, and make sure the stop loss is
    comfortably *before* the liquidation price. Returns (leverage, note) or (None, reason)."""
    candidates = []
    if grade == "A+" and cfg.enable_high_leverage:
        candidates.append(int(cfg.high_confidence_leverage))
    candidates.append(int(cfg.normal_leverage))
    note = ""
    for lev in candidates:
        if market_max_leverage:
            lev = min(lev, int(market_max_leverage))
        safe = liquidation_distance(lev, cfg.maintenance_margin_rate) * cfg.liquidation_safety
        if stop_pct <= safe:
            return lev, note
        note = f"الوقف {stop_pct*100:.2f}% أبعد من حد الأمان للرافعة {lev}x ({safe*100:.2f}%)"
    return None, note or "الوقف بعيد جداً"


def size_order(equity: float, price: float, stop_pct: float, leverage: int, contract_size: float,
               amount_step: float, min_amount: float, cfg: RiskCfg) -> Optional[OrderPlan]:
    """Compute contracts so that the margin used is ``margin_per_trade_pct`` of equity
    (or, in ``risk`` mode, so that hitting the stop loses that percent)."""
    if equity <= 0 or price <= 0 or contract_size <= 0:
        return None
    pct = cfg.margin_per_trade_pct / 100.0
    if cfg.sizing_mode == "risk":
        notional = (equity * pct) / max(stop_pct, 1e-6)
        notional = min(notional, equity * leverage * 0.95)  # cannot exceed available margin
    else:
        notional = equity * pct * leverage
    raw = notional / (price * contract_size)
    step = amount_step if amount_step and amount_step > 0 else 1.0
    contracts = math.floor(raw / step + 1e-9) * step
    contracts = round(contracts, 10)
    if contracts <= 0 or (min_amount and contracts < min_amount):
        return None
    real_notional = contracts * contract_size * price
    margin = real_notional / leverage
    return OrderPlan(
        leverage=leverage,
        contracts=contracts,
        margin=margin,
        notional=real_notional,
        stop_pct=stop_pct,
        liq_pct=liquidation_distance(leverage, cfg.maintenance_margin_rate),
        risk_usdt=real_notional * (stop_pct + 2 * cfg.taker_fee),
    )


def liquidation_price(entry: float, side: str, leverage: int, mmr: float) -> float:
    d = liquidation_distance(leverage, mmr)
    return entry * (1 - d) if side == "long" else entry * (1 + d)
