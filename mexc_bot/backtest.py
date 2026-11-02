"""Backtester - tests the exact same strategy + risk rules on historical candles.

Examples:
    python backtest.py --symbol BTC/USDT:USDT --days 90        # download from MEXC
    python backtest.py --csv my_btc_15m.csv                     # ts,open,high,low,close,volume
    python backtest.py --synthetic                              # offline demo data
"""
from __future__ import annotations

import argparse
import time
from dataclasses import dataclass

import numpy as np
import pandas as pd

from bot import strategy as st
from bot.config import load_config
from bot.exchange import TF_MS, ohlcv_to_df
from bot.risk import choose_leverage, liquidation_distance


@dataclass
class BTTrade:
    side: str
    grade: str
    leverage: int
    entry: float
    exit: float
    pnl: float
    reason: str
    bars: int


def resample(df: pd.DataFrame, tf: str) -> pd.DataFrame:
    ms = TF_MS[tf]
    g = df.assign(bucket=df["ts"] - df["ts"] % ms).groupby("bucket")
    out = pd.DataFrame({
        "ts": g["ts"].first().index.astype("int64"),
        "open": g["open"].first().values, "high": g["high"].max().values,
        "low": g["low"].min().values, "close": g["close"].last().values, "volume": g["volume"].sum().values,
    })
    return out.reset_index(drop=True)


def synthetic(n: int = 8000, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    regime = np.repeat(rng.choice([-1, 0, 1], size=n // 400 + 1), 400)[:n]
    rets = rng.normal(regime * 0.0004, 0.004, n)
    close = 30000 * np.exp(np.cumsum(rets))
    open_ = np.concatenate([[close[0]], close[:-1]])
    spread = np.abs(rng.normal(0, 0.003, n)) * close
    high = np.maximum(open_, close) + spread
    low = np.minimum(open_, close) - spread
    vol = rng.lognormal(10, 0.5, n) * (1 + 3 * np.abs(rets) / 0.004)
    ts = (int(time.time() * 1000) // TF_MS["15m"] - n) * TF_MS["15m"] + np.arange(n) * TF_MS["15m"]
    return pd.DataFrame({"ts": ts, "open": open_, "high": high, "low": low, "close": close, "volume": vol})


def fetch(symbol: str, tf: str, days: int) -> pd.DataFrame:
    import ccxt

    ex = ccxt.mexc({"enableRateLimit": True, "options": {"defaultType": "swap"}})
    since = int(time.time() * 1000) - days * 86_400_000
    rows = []
    while since < time.time() * 1000 - TF_MS[tf]:
        batch = ex.fetch_ohlcv(symbol, tf, since=since, limit=1000)
        if not batch:
            break
        rows += batch
        since = batch[-1][0] + TF_MS[tf]
    return ohlcv_to_df(rows)


def run(df: pd.DataFrame, cfg, start_equity: float = 1000.0, symbol: str = "BT"):
    tfc, sc, ex, rk = cfg.timeframes, cfg.strategy, cfg.exits, cfg.risk
    ltf = st.prepare(df)
    htf = st.prepare(resample(df, tfc.trend))
    mac = st.prepare(resample(df, tfc.macro))
    tf_ms, h_ms, m_ms = TF_MS[tfc.signal], TF_MS[tfc.trend], TF_MS[tfc.macro]
    h_ts, m_ts = htf["ts"].to_numpy(), mac["ts"].to_numpy()

    equity, peak, max_dd = start_equity, start_equity, 0.0
    trades: list[BTTrade] = []
    pos = None
    cooldown_until = -1
    H, L, C = ltf["high"].to_numpy(), ltf["low"].to_numpy(), ltf["close"].to_numpy()
    fee = rk.taker_fee

    def close(qty_frac, px, reason, i):
        nonlocal equity
        qty = pos["qty"] * qty_frac
        pnl = pos["s"] * (px - pos["entry"]) * qty - fee * (px + pos["entry"]) * qty
        # isolated margin: a loss can never exceed the margin of that portion
        pnl = max(pnl, -pos["margin"] * qty_frac)
        equity += pnl
        pos["qty"] -= qty
        pos["margin"] -= pos["margin"] * qty_frac
        pos["pnl"] += pnl
        if pos["qty"] <= 1e-12 or qty_frac >= 1:
            trades.append(BTTrade(pos["side"], pos["grade"], pos["lev"], pos["entry"], px, pos["pnl"], reason, i - pos["i"]))
            return True
        return False

    for i in range(250, len(ltf)):
        if pos is not None:
            s = pos["s"]
            liq = pos["entry"] * (1 - s * liquidation_distance(pos["lev"], rk.maintenance_margin_rate))
            adverse = L[i] if s == 1 else H[i]
            favorable = H[i] if s == 1 else L[i]
            done = False
            if (adverse - pos["stop"]) * s <= 0:  # conservative: stop is checked first
                px = pos["stop"]
                if (adverse - liq) * s <= 0 and (pos["stop"] - liq) * s <= 0:
                    px = liq
                done = close(1, px, "stop" if not pos["tp1"] else "trail/BE", i)
            elif (favorable - pos["tp2"]) * s >= 0:
                done = close(1, pos["tp2"], "tp2", i)
            else:
                if not pos["tp1"] and (favorable - pos["tp1p"]) * s >= 0:
                    close(ex.tp1_close_pct / 100, pos["tp1p"], "tp1", i)
                    pos["tp1"] = True
                    pos["stop"] = pos["entry"] * (1 + s * ex.breakeven_buffer_pct / 100)
                pos["best"] = max(pos["best"], H[i]) if s == 1 else min(pos["best"], L[i])
                if pos["tp1"]:
                    trail = pos["best"] - s * ex.trail_atr * pos["atr"]
                    if (trail - pos["stop"]) * s > 0:
                        pos["stop"] = trail
                if (i - pos["i"]) * tf_ms > rk.max_hold_hours * 3_600_000:
                    done = close(1, C[i], "time", i)
            if done:
                pos = None
                cooldown_until = i + int(rk.symbol_cooldown_minutes * 60_000 / tf_ms)
            peak = max(peak, equity)
            max_dd = max(max_dd, (peak - equity) / peak)
            continue
        if i < cooldown_until:
            continue

        close_ts = int(ltf["ts"].iat[i]) + tf_ms
        hn = int(np.searchsorted(h_ts + h_ms, close_ts, side="right"))
        mn = int(np.searchsorted(m_ts + m_ms, close_ts, side="right"))
        if hn < 60 or mn < 60:
            continue
        a = st.evaluate(symbol, ltf, htf.iloc[hn - 60:hn], mac.iloc[mn - 60:mn], None, sc, ex, i=i)
        sig = a.signal
        if sig is None:
            continue
        lev, _ = choose_leverage(sig.grade, sig.stop_pct, rk)
        if lev is None:
            continue
        pct = rk.margin_per_trade_pct / 100
        notional = equity * pct * lev if rk.sizing_mode == "margin" else min(equity * pct / sig.stop_pct, equity * lev * 0.95)
        qty = notional / sig.entry
        equity -= 0  # fees are charged on close for both legs
        pos = {"side": sig.side, "s": 1 if sig.side == "long" else -1, "entry": sig.entry, "stop": sig.stop,
               "tp1p": sig.tp1, "tp2": sig.tp2, "tp1": False, "qty": qty, "lev": lev, "grade": sig.grade,
               "atr": sig.atr, "best": sig.entry, "i": i, "margin": notional / lev, "pnl": 0.0}
    return equity, max_dd, trades


def report(start: float, equity: float, max_dd: float, trades: list[BTTrade]) -> str:
    if not trades:
        return "No trades."
    pnl = np.array([t.pnl for t in trades])
    wins, losses = pnl[pnl > 0], pnl[pnl <= 0]
    pf = wins.sum() / abs(losses.sum()) if losses.sum() else float("inf")
    lines = [
        f"Trades: {len(trades)} | Win rate: {len(wins)/len(trades)*100:.1f}% | Profit factor: {pf:.2f}",
        f"Start: {start:.2f} -> End: {equity:.2f} USDT ({(equity/start-1)*100:+.1f}%) | Max drawdown: {max_dd*100:.1f}%",
        f"Avg win: {wins.mean() if len(wins) else 0:.2f} | Avg loss: {losses.mean() if len(losses) else 0:.2f}",
    ]
    for g in sorted({t.grade for t in trades}):
        gp = np.array([t.pnl for t in trades if t.grade == g])
        lines.append(f"  grade {g:3s}: {len(gp)} trades, win {np.mean(gp > 0)*100:.0f}%, pnl {gp.sum():+.2f}")
    for side in ("long", "short"):
        sp = np.array([t.pnl for t in trades if t.side == side])
        if len(sp):
            lines.append(f"  {side:5s}: {len(sp)} trades, win {np.mean(sp > 0)*100:.0f}%, pnl {sp.sum():+.2f}")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.yaml")
    ap.add_argument("--symbol", default="BTC/USDT:USDT")
    ap.add_argument("--days", type=int, default=90)
    ap.add_argument("--csv")
    ap.add_argument("--synthetic", action="store_true")
    ap.add_argument("--equity", type=float, default=1000.0)
    args = ap.parse_args()
    cfg = load_config(args.config, env_file=None)
    if args.synthetic:
        df = synthetic()
    elif args.csv:
        df = ohlcv_to_df(pd.read_csv(args.csv)[["ts", "open", "high", "low", "close", "volume"]].values.tolist())
    else:
        df = fetch(args.symbol, cfg.timeframes.signal, args.days)
    print(f"Backtesting {len(df)} candles ({cfg.timeframes.signal})...")
    equity, dd, trades = run(df, cfg, args.equity, args.symbol)
    print(report(args.equity, equity, dd, trades))


if __name__ == "__main__":
    main()
