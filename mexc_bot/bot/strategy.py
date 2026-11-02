"""Multi-timeframe confluence strategy.

The strategy combines several well-established professional techniques and only
trades when they agree:

1. Top-down analysis      - 4h macro trend (EMA50/EMA200) and 1h trend (EMA21/55,
                            Supertrend, ADX/DMI) must point the same way.
2. Trend-following entry  - on the 15m chart: EMA ribbon 9/21/55, Supertrend,
                            MACD momentum, RSI in the "power zone" (not overbought).
3. Entry trigger (required)
                          - pullback to EMA21 then resumption candle, OR
                          - Donchian(20) breakout with volume expansion.
4. Volatility             - Bollinger squeeze release adds conviction.
5. Positioning            - funding rate: avoid crowded side, reward contrarian.
6. No chasing             - skip if price is stretched too far from EMA21 (in ATR).
7. Structure-based stops  - stop below/above the recent swing, bounded by ATR.

Each factor adds points to a 0-100 score. A trade is taken when the score reaches
``min_score``; it is graded "A+" (high-confidence) only when the score reaches
``high_conf_score`` AND every timeframe, volume and funding agree.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

from . import indicators as ind
from .config import ExitsCfg, StrategyCfg

LONG, SHORT = "long", "short"


@dataclass
class Signal:
    symbol: str
    side: str
    score: float
    grade: str  # "A+" | "A" | "manual"
    entry: float
    stop: float
    tp1: float
    tp2: float
    atr: float
    trigger: str
    reasons: list = field(default_factory=list)

    @property
    def stop_pct(self) -> float:
        return abs(self.entry - self.stop) / self.entry


@dataclass
class Analysis:
    symbol: str
    long_score: float
    short_score: float
    long_reasons: list
    short_reasons: list
    signal: Optional[Signal]
    blocked: list = field(default_factory=list)


def prepare(df: pd.DataFrame) -> pd.DataFrame:
    """Add indicator columns to an OHLCV frame (columns: ts, open, high, low, close, volume)."""
    out = df.copy()
    c = out["close"]
    for n in (9, 21, 50, 55, 200):
        out[f"ema{n}"] = ind.ema(c, n)
    out["rsi"] = ind.rsi(c, 14)
    out["atr"] = ind.atr(out, 14)
    _, _, out["macd_hist"] = ind.macd(c)
    out["adx"], out["pdi"], out["mdi"] = ind.adx(out, 14)
    _, out["st_dir"] = ind.supertrend(out, 10, 3.0)
    _, _, _, out["bb_width"] = ind.bollinger(c, 20, 2.0)
    dc_hi, dc_lo = ind.donchian(out, 20)
    out["dc_high"] = dc_hi.shift(1)  # previous 20 bars, excludes current bar
    out["dc_low"] = dc_lo.shift(1)
    out["vol_sma"] = ind.sma(out["volume"], 20)
    return out


def _htf_score(row: pd.Series | None, macro: pd.Series | None, s: int, cfg: StrategyCfg, why: list) -> tuple[float, dict]:
    score = 0.0
    flags = {"macro": False, "trend": False}
    if macro is not None:
        above200 = bool((macro["close"] - macro["ema200"]) * s > 0)
        stack = bool((macro["ema50"] - macro["ema200"]) * s > 0)
        if above200 and stack:
            score += 15
            flags["macro"] = True
            why.append("اتجاه 4 ساعات متوافق (EMA50/200)")
        elif above200:
            score += 7
            why.append("السعر على الجهة الصحيحة من EMA200 (4س)")
        elif not stack and not above200:
            score -= 10
            why.append("ضد الاتجاه العام 4س (-)")
    if row is not None:
        t_ok = bool((row["close"] - row["ema55"]) * s > 0 and (row["ema21"] - row["ema55"]) * s > 0)
        st_ok = bool(row["st_dir"] == s)
        dmi_ok = bool(row["adx"] >= cfg.adx_min and (row["pdi"] - row["mdi"]) * s > 0)
        if t_ok:
            score += 12
            why.append("اتجاه الساعة متوافق (EMA21/55)")
        if st_ok:
            score += 8
            why.append("Supertrend الساعة متوافق")
        if dmi_ok:
            score += 10
            why.append(f"ترند قوي ADX={row['adx']:.0f}")
        flags["trend"] = t_ok and st_ok and dmi_ok
    return score, flags


def _side_score(df: pd.DataFrame, i: int, side: str, htf: pd.Series | None, macro: pd.Series | None,
                funding: float | None, cfg: StrategyCfg):
    s = 1 if side == LONG else -1
    why: list[str] = []
    r = df.iloc[i]
    prev = df.iloc[i - 1]
    a = float(r["atr"])
    score, flags = _htf_score(htf, macro, s, cfg, why)

    # --- signal timeframe -------------------------------------------------
    if (r["ema9"] - r["ema21"]) * s > 0 and (r["ema21"] - r["ema55"]) * s > 0:
        score += 10
        why.append("ترتيب المتوسطات 9/21/55 متوافق")
    if r["st_dir"] == s:
        score += 5
        why.append("Supertrend 15د متوافق")
    if r["macd_hist"] * s > 0 and (r["macd_hist"] - prev["macd_hist"]) * s > 0:
        score += 10
        why.append("زخم MACD متزايد")
    rsi_v = float(r["rsi"])
    rsi_dir = rsi_v if s == 1 else 100 - rsi_v  # mirror for shorts
    rsi_ok = 50 <= rsi_dir <= 70
    if rsi_ok:
        score += 10
        why.append(f"RSI في منطقة القوة ({rsi_v:.0f})")
    elif rsi_dir > 78:
        score -= 15
        why.append(f"RSI متشبع ({rsi_v:.0f}) (-)")

    vol_ratio = float(r["volume"] / r["vol_sma"]) if r["vol_sma"] and r["vol_sma"] > 0 else 0.0
    vol_ok = vol_ratio >= cfg.volume_confirm_ratio
    if vol_ok:
        score += 10
        why.append(f"حجم تداول مرتفع x{vol_ratio:.1f}")

    # --- entry trigger (required) -----------------------------------------
    look = df.iloc[max(0, i - 2): i + 1]
    if s == 1:
        touched = (look["low"] <= look["ema21"] + 0.25 * look["atr"]).any()
        resume = r["close"] > r["ema9"] and r["close"] > r["open"]
        breakout = r["close"] > r["dc_high"]
    else:
        touched = (look["high"] >= look["ema21"] - 0.25 * look["atr"]).any()
        resume = r["close"] < r["ema9"] and r["close"] < r["open"]
        breakout = r["close"] < r["dc_low"]
    breakout = bool(breakout) and vol_ratio >= cfg.breakout_volume_ratio
    pullback = bool(touched and resume)
    trigger = ""
    if breakout:
        score += 10
        trigger = "breakout"
        why.append("اختراق قناة دونشيان مع حجم")
    elif pullback:
        score += 8
        trigger = "pullback"
        why.append("ارتداد من EMA21 مع شمعة تأكيد")

    # --- volatility squeeze release --------------------------------------
    w = df["bb_width"].iloc[max(0, i - 120): i + 1].dropna()
    if len(w) > 30:
        recent_min = w.iloc[-6:-1].min()
        if recent_min <= w.quantile(0.2) and w.iloc[-1] > recent_min * 1.1:
            score += 5
            why.append("انفجار بعد انضغاط بولنجر")

    # --- funding / positioning -------------------------------------------
    crowded = False
    if funding is not None:
        if funding * s > cfg.funding_crowded:
            score -= 10
            crowded = True
            why.append(f"التمويل مزدحم {funding*100:.3f}% (-)")
        elif funding * s < 0:
            score += 3
            why.append("التمويل لصالح الصفقة")

    ext = (r["close"] - r["ema21"]) * s / a if a > 0 else 0
    blocked = []
    if not trigger:
        blocked.append("لا يوجد محفز دخول")
    if ext > cfg.max_extension_atr:
        blocked.append(f"السعر بعيد عن EMA21 ({ext:.1f} ATR)")
    if not np.isfinite(a) or a <= 0:
        blocked.append("ATR غير صالح")

    score = float(max(0.0, min(100.0, score)))
    aplus = (
        score >= cfg.high_conf_score
        and flags["macro"]
        and flags["trend"]
        and vol_ok
        and rsi_ok
        and not crowded
        and bool(trigger)
    )
    return score, why, trigger, aplus, blocked


def build_levels(df: pd.DataFrame, i: int, side: str, cfg: StrategyCfg, exits: ExitsCfg, entry: float | None = None):
    r = df.iloc[i]
    a = float(r["atr"])
    entry = float(entry if entry is not None else r["close"])
    window = df.iloc[max(0, i - cfg.swing_lookback + 1): i + 1]
    if side == LONG:
        swing = float(window["low"].min()) - 0.3 * a
        stop = max(swing, entry - cfg.max_stop_atr * a)
        stop = min(stop, entry - cfg.min_stop_atr * a)
        risk = entry - stop
        tp1, tp2 = entry + exits.tp1_r * risk, entry + exits.tp2_r * risk
    else:
        swing = float(window["high"].max()) + 0.3 * a
        stop = min(swing, entry + cfg.max_stop_atr * a)
        stop = max(stop, entry + cfg.min_stop_atr * a)
        risk = stop - entry
        tp1, tp2 = entry - exits.tp1_r * risk, entry - exits.tp2_r * risk
    return entry, stop, tp1, tp2, a


def evaluate(symbol: str, ltf: pd.DataFrame, htf: pd.DataFrame | None, macro: pd.DataFrame | None,
             funding: float | None, cfg: StrategyCfg, exits: ExitsCfg, i: int | None = None,
             direction: str | None = None) -> Analysis:
    """Evaluate prepared frames at ltf index ``i`` (default: last closed bar).

    ``htf``/``macro`` must already be cut so that their last row is the last bar
    that was *closed* at the time of ltf bar ``i`` (see :func:`align_htf`).
    """
    if i is None:
        i = len(ltf) - 1
    direction = direction or cfg.direction
    htf_row = htf.iloc[-1] if htf is not None and len(htf) else None
    macro_row = macro.iloc[-1] if macro is not None and len(macro) else None
    if i < 60:
        return Analysis(symbol, 0, 0, [], [], None, ["بيانات غير كافية"])

    ls, lw, ltrig, lap, lblk = _side_score(ltf, i, LONG, htf_row, macro_row, funding, cfg)
    ss, sw, strig, sap, sblk = _side_score(ltf, i, SHORT, htf_row, macro_row, funding, cfg)

    candidates = []
    if direction in ("both", LONG) and ls >= cfg.min_score and not lblk:
        candidates.append((ls, LONG, ltrig, lap, lw))
    if direction in ("both", SHORT) and ss >= cfg.min_score and not sblk:
        candidates.append((ss, SHORT, strig, sap, sw))

    signal = None
    if candidates:
        candidates.sort(key=lambda x: x[0], reverse=True)
        sc, side, trig, aplus, why = candidates[0]
        # if both sides qualify the market is ambiguous -> require a clear winner
        if len(candidates) == 1 or candidates[0][0] - candidates[1][0] >= 15:
            entry, stop, tp1, tp2, a = build_levels(ltf, i, side, cfg, exits)
            signal = Signal(symbol, side, sc, "A+" if aplus else "A", entry, stop, tp1, tp2, a, trig, why)
    return Analysis(symbol, ls, ss, lw, sw, signal, lblk if ls >= ss else sblk)


def align_htf(htf: pd.DataFrame, ltf_close_ts: int, htf_ms: int) -> pd.DataFrame:
    """Return htf rows whose bar had fully closed at ``ltf_close_ts`` (ms)."""
    closed = htf["ts"].to_numpy() + htf_ms <= ltf_close_ts
    return htf.loc[closed]
