import numpy as np

from backtest import synthetic
from bot import indicators as ind
from bot import strategy as st


def test_indicator_ranges():
    df = synthetic(1000)
    r = ind.rsi(df["close"])
    assert r.between(0, 100).all()
    assert (ind.atr(df).iloc[1:] > 0).all()
    _, d = ind.supertrend(df)
    assert set(np.unique(d)) <= {1.0, -1.0}
    adx, pdi, mdi = ind.adx(df)
    assert adx.iloc[50:].between(0, 100).all()


def test_rsi_monotonic_series():
    import pandas as pd
    up = pd.Series(np.arange(1, 100, dtype=float))
    assert ind.rsi(up).iloc[-1] > 99


def test_prepare_has_columns_and_levels_are_sane():
    from bot.config import ExitsCfg, StrategyCfg
    df = st.prepare(synthetic(600))
    for c in ("ema9", "ema200", "rsi", "atr", "macd_hist", "adx", "st_dir", "bb_width", "dc_high", "vol_sma"):
        assert c in df
    i = len(df) - 1
    e, s, t1, t2, a = st.build_levels(df, i, "long", StrategyCfg(), ExitsCfg())
    assert s < e < t1 < t2
    assert StrategyCfg().min_stop_atr * a - 1e-9 <= e - s <= StrategyCfg().max_stop_atr * a + 1e-9
    e, s, t1, t2, a = st.build_levels(df, i, "short", StrategyCfg(), ExitsCfg())
    assert t2 < t1 < e < s


def test_align_htf_has_no_lookahead():
    df = synthetic(400)
    from backtest import resample
    h = resample(df, "1h")
    ltf_close = int(df["ts"].iloc[10]) + 900_000
    cut = st.align_htf(h, ltf_close, 3_600_000)
    assert (cut["ts"] + 3_600_000 <= ltf_close).all()
