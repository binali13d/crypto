"""Technical indicators (pure pandas/numpy, Wilder smoothing where standard)."""
from __future__ import annotations

import numpy as np
import pandas as pd


def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n, min_periods=n).mean()


def rma(s: pd.Series, n: int) -> pd.Series:
    """Wilder's moving average."""
    return s.ewm(alpha=1.0 / n, adjust=False).mean()


def rsi(close: pd.Series, n: int = 14) -> pd.Series:
    delta = close.diff()
    gain = rma(delta.clip(lower=0), n)
    loss = rma(-delta.clip(upper=0), n)
    out = pd.Series(np.where(loss == 0, np.where(gain == 0, 50.0, 100.0), 100 - 100 / (1 + gain / loss.replace(0, np.nan))),
                    index=close.index)
    return out.fillna(50.0)


def true_range(df: pd.DataFrame) -> pd.Series:
    prev_close = df["close"].shift()
    return pd.concat(
        [df["high"] - df["low"], (df["high"] - prev_close).abs(), (df["low"] - prev_close).abs()], axis=1
    ).max(axis=1)


def atr(df: pd.DataFrame, n: int = 14) -> pd.Series:
    return rma(true_range(df), n)


def macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    line = ema(close, fast) - ema(close, slow)
    sig = ema(line, signal)
    return line, sig, line - sig


def adx(df: pd.DataFrame, n: int = 14):
    up = df["high"].diff()
    down = -df["low"].diff()
    plus_dm = pd.Series(np.where((up > down) & (up > 0), up, 0.0), index=df.index)
    minus_dm = pd.Series(np.where((down > up) & (down > 0), down, 0.0), index=df.index)
    tr = rma(true_range(df), n).replace(0, np.nan)
    pdi = 100 * rma(plus_dm, n) / tr
    mdi = 100 * rma(minus_dm, n) / tr
    dx = 100 * (pdi - mdi).abs() / (pdi + mdi).replace(0, np.nan)
    return rma(dx.fillna(0), n), pdi.fillna(0), mdi.fillna(0)


def supertrend(df: pd.DataFrame, n: int = 10, mult: float = 3.0):
    """Returns (line, direction) where direction is +1 (up) / -1 (down)."""
    h, l, c = df["high"].to_numpy(), df["low"].to_numpy(), df["close"].to_numpy()
    a = atr(df, n).to_numpy()
    hl2 = (h + l) / 2
    upper = hl2 + mult * a
    lower = hl2 - mult * a
    fu, fl = upper.copy(), lower.copy()
    direction = np.ones(len(c))
    for i in range(1, len(c)):
        fu[i] = upper[i] if (upper[i] < fu[i - 1] or c[i - 1] > fu[i - 1]) else fu[i - 1]
        fl[i] = lower[i] if (lower[i] > fl[i - 1] or c[i - 1] < fl[i - 1]) else fl[i - 1]
        if direction[i - 1] == -1 and c[i] > fu[i - 1]:
            direction[i] = 1
        elif direction[i - 1] == 1 and c[i] < fl[i - 1]:
            direction[i] = -1
        else:
            direction[i] = direction[i - 1]
    line = np.where(direction == 1, fl, fu)
    return pd.Series(line, index=df.index), pd.Series(direction, index=df.index)


def bollinger(close: pd.Series, n: int = 20, k: float = 2.0):
    mid = sma(close, n)
    std = close.rolling(n, min_periods=n).std(ddof=0)
    upper, lower = mid + k * std, mid - k * std
    width = (upper - lower) / mid
    return mid, upper, lower, width


def donchian(df: pd.DataFrame, n: int = 20):
    return df["high"].rolling(n, min_periods=n).max(), df["low"].rolling(n, min_periods=n).min()
