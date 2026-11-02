import time

from backtest import synthetic
from bot.exchange import TF_MS


class FakeClient:
    """Minimal ccxt-like client backed by synthetic candles and a settable price."""

    def __init__(self, price=30000.0):
        self.price = {"BTC/USDT:USDT": price, "ETH/USDT:USDT": 2000.0}
        self.df = synthetic(1500)

    def load_markets(self):
        mk = lambda s, cs: {"symbol": s, "swap": True, "linear": True, "quote": "USDT", "active": True,
                            "contractSize": cs, "precision": {"amount": 1}, "limits": {"amount": {"min": 1},
                            "leverage": {"max": 125}}, "info": {}}
        return {"BTC/USDT:USDT": mk("BTC/USDT:USDT", 0.0001), "ETH/USDT:USDT": mk("ETH/USDT:USDT", 0.01)}

    def fetch_ohlcv(self, symbol, tf, limit=300, since=None):
        ms = TF_MS[tf]
        now = int(time.time() * 1000)
        last = now - now % ms
        df = self.df.tail(limit).reset_index(drop=True)
        scale = self.price[symbol] / df["close"].iloc[-1]
        rows = []
        for k, r in df.iterrows():
            ts = last - (len(df) - 1 - k) * ms
            rows.append([ts, r.open * scale, r.high * scale, r.low * scale, r.close * scale, r.volume])
        return rows

    def fetch_ticker(self, symbol):
        return {"last": self.price[symbol]}

    def fetch_funding_rate(self, symbol):
        return {"fundingRate": 0.0001}

    def fetch_tickers(self, symbols):
        return {s: {"quoteVolume": 1e9, "last": self.price[s]} for s in symbols}
