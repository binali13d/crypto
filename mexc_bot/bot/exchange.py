"""Exchange adapters: live MEXC USDT-M perpetual futures (via ccxt) and a paper simulator."""
from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass
from typing import Optional

import pandas as pd

log = logging.getLogger("bot.exchange")

TF_MS = {"1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000,
         "2h": 7_200_000, "4h": 14_400_000, "1d": 86_400_000}


@dataclass
class MarketInfo:
    symbol: str
    contract_size: float
    amount_step: float
    min_amount: float
    max_leverage: Optional[int]


@dataclass
class Position:
    symbol: str
    side: str  # long | short
    contracts: float
    entry: float
    leverage: Optional[float] = None
    unrealized_pnl: float = 0.0


def ohlcv_to_df(rows: list) -> pd.DataFrame:
    df = pd.DataFrame(rows, columns=["ts", "open", "high", "low", "close", "volume"])
    for c in ("open", "high", "low", "close", "volume"):
        df[c] = df[c].astype(float)
    df["ts"] = df["ts"].astype("int64")
    return df.drop_duplicates("ts").sort_values("ts").reset_index(drop=True)


def drop_unclosed(df: pd.DataFrame, tf: str, now_ms: int | None = None) -> pd.DataFrame:
    now_ms = now_ms or int(time.time() * 1000)
    return df[df["ts"] + TF_MS[tf] <= now_ms].reset_index(drop=True)


class BaseExchange:
    """Common market-data functions shared by live and paper modes."""

    def __init__(self, client):
        self.client = client
        self.markets: dict = {}

    # ---- market data -----------------------------------------------------
    def load_markets(self) -> None:
        self.markets = self.client.load_markets()

    def market(self, symbol: str) -> MarketInfo:
        if not self.markets:
            self.load_markets()
        m = self.markets[symbol]
        step = m.get("precision", {}).get("amount") or 1
        min_amt = (m.get("limits", {}).get("amount", {}) or {}).get("min") or step
        max_lev = (m.get("limits", {}).get("leverage", {}) or {}).get("max")
        info = m.get("info") or {}
        max_lev = max_lev or info.get("maxLeverage")
        return MarketInfo(symbol, float(m.get("contractSize") or 1), float(step), float(min_amt),
                          int(max_lev) if max_lev else None)

    def fetch_ohlcv(self, symbol: str, tf: str, limit: int = 300) -> pd.DataFrame:
        rows = self.client.fetch_ohlcv(symbol, tf, limit=limit)
        return ohlcv_to_df(rows)

    def last_price(self, symbol: str) -> float:
        t = self.client.fetch_ticker(symbol)
        return float(t.get("last") or t.get("close"))

    def last_prices(self, symbols: list[str]) -> dict[str, float]:
        out = {}
        for s in symbols:
            try:
                out[s] = self.last_price(s)
            except Exception as e:  # noqa: BLE001
                log.warning("price fetch failed %s: %s", s, e)
        return out

    def funding_rate(self, symbol: str) -> Optional[float]:
        try:
            fr = self.client.fetch_funding_rate(symbol)
            v = fr.get("fundingRate")
            return float(v) if v is not None else None
        except Exception as e:  # noqa: BLE001
            log.debug("funding fetch failed %s: %s", symbol, e)
            return None

    def top_symbols(self, n: int, min_quote_volume: float, exclude: list[str]) -> list[str]:
        if not self.markets:
            self.load_markets()
        swaps = [s for s, m in self.markets.items()
                 if m.get("swap") and m.get("linear") and m.get("quote") == "USDT" and m.get("active", True)
                 and s not in exclude]
        tickers = self.client.fetch_tickers(swaps)
        ranked = []
        for s, t in tickers.items():
            qv = t.get("quoteVolume")
            if qv is None and t.get("baseVolume") and t.get("last"):
                qv = t["baseVolume"] * t["last"]
            if qv and qv >= min_quote_volume and s in swaps:
                ranked.append((qv, s))
        ranked.sort(reverse=True)
        return [s for _, s in ranked[:n]]

    def resolve_symbol(self, text: str) -> Optional[str]:
        """'btc' / 'BTCUSDT' / 'BTC_USDT' -> 'BTC/USDT:USDT'."""
        if not self.markets:
            self.load_markets()
        t = text.upper().replace("_", "").replace("-", "").replace("/", "").replace(":USDT", "")
        if t.endswith("USDT"):
            t = t[:-4]
        sym = f"{t}/USDT:USDT"
        return sym if sym in self.markets else None


class LiveExchange(BaseExchange):
    """Real orders on MEXC USDT-M perpetual futures. Isolated margin, one-way mode."""

    def __init__(self, api_key: str, api_secret: str):
        import ccxt

        client = ccxt.mexc({
            "apiKey": api_key,
            "secret": api_secret,
            "enableRateLimit": True,
            "options": {"defaultType": "swap"},
        })
        super().__init__(client)

    def setup(self) -> None:
        self.load_markets()
        try:
            self.client.set_position_mode(False)  # one-way
            log.info("position mode set to one-way")
        except Exception as e:  # noqa: BLE001  (fails if positions/orders are open - harmless)
            log.info("could not set position mode (keeping account setting): %s", e)

    def equity(self) -> float:
        bal = self.client.fetch_balance({"type": "swap"})
        for row in (bal.get("info") or {}).get("data", []) or []:
            if isinstance(row, dict) and row.get("currency") == "USDT":
                v = row.get("equity") or row.get("availableBalance")
                if v is not None:
                    return float(v)
        return float((bal.get("total") or {}).get("USDT") or 0.0)

    def fetch_positions(self) -> list[Position]:
        out = []
        for p in self.client.fetch_positions():
            contracts = float(p.get("contracts") or 0)
            if contracts <= 0:
                continue
            out.append(Position(p["symbol"], p.get("side") or "long", contracts, float(p.get("entryPrice") or 0),
                                p.get("leverage"), float(p.get("unrealizedPnl") or 0)))
        return out

    def _set_leverage(self, symbol: str, side: str, leverage: int) -> None:
        try:
            self.client.set_leverage(leverage, symbol, {"openType": 1, "positionType": 1 if side == "long" else 2})
        except Exception as e:  # noqa: BLE001
            log.debug("set_leverage %s: %s", symbol, e)

    def open_position(self, symbol: str, side: str, contracts: float, leverage: int,
                      stop: float, take_profit: float) -> float:
        self._set_leverage(symbol, side, leverage)
        params = {
            "openType": 1,  # isolated
            "leverage": int(leverage),
            "stopLossPrice": float(self.client.price_to_precision(symbol, stop)),
            "takeProfitPrice": float(self.client.price_to_precision(symbol, take_profit)),
            "clientOrderId": f"bot{uuid.uuid4().hex[:20]}",
        }
        order_side = "buy" if side == "long" else "sell"
        self.client.create_order(symbol, "market", order_side, contracts, None, params)
        time.sleep(1.0)
        for p in self.fetch_positions():
            if p.symbol == symbol and p.side == side and p.entry > 0:
                return p.entry
        return self.last_price(symbol)

    def close_position(self, symbol: str, side: str, contracts: float, leverage: int) -> float:
        order_side = "sell" if side == "long" else "buy"
        params = {"reduceOnly": True, "openType": 1, "leverage": int(leverage or 20)}
        self.client.create_order(symbol, "market", order_side, contracts, None, params)
        return self.last_price(symbol)

    def cancel_all(self, symbol: str) -> None:
        for params in ({}, {"trigger": True}):
            try:
                self.client.cancel_all_orders(symbol, params)
            except Exception as e:  # noqa: BLE001
                log.debug("cancel_all %s %s: %s", symbol, params, e)


class PaperExchange(BaseExchange):
    """Simulated account using real public MEXC prices. No API key needed."""

    def __init__(self, start_balance: float, fee: float = 0.0002, slippage_pct: float = 0.03, client=None,
                 account_file: str | None = None):
        if client is None:
            import ccxt

            client = ccxt.mexc({"enableRateLimit": True, "options": {"defaultType": "swap"}})
        super().__init__(client)
        self.balance = float(start_balance)
        self.fee = fee
        self.slip = slippage_pct / 100.0
        self.positions: dict[str, dict] = {}
        self.realized = 0.0
        self.account_file = account_file
        self._load()

    def _load(self) -> None:
        import json
        import os

        if self.account_file and os.path.exists(self.account_file):
            try:
                d = json.load(open(self.account_file, encoding="utf-8"))
                self.balance, self.positions, self.realized = d["balance"], d["positions"], d.get("realized", 0.0)
                log.info("[paper] account restored: balance %.2f, %d positions", self.balance, len(self.positions))
            except Exception as e:  # noqa: BLE001
                log.warning("[paper] could not load account: %s", e)

    def _save(self) -> None:
        import json
        import os

        if not self.account_file:
            return
        os.makedirs(os.path.dirname(self.account_file) or ".", exist_ok=True)
        tmp = self.account_file + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"balance": self.balance, "positions": self.positions, "realized": self.realized}, f)
        os.replace(tmp, self.account_file)

    def setup(self) -> None:
        self.load_markets()

    def _cs(self, symbol):
        return self.market(symbol).contract_size

    def equity(self) -> float:
        eq = self.balance
        if self.positions:
            prices = self.last_prices(list(self.positions))
            for s, p in self.positions.items():
                px = prices.get(s, p["entry"])
                eq += self._pnl(p, px)
        return eq

    def _pnl(self, p, price):
        sign = 1 if p["side"] == "long" else -1
        return sign * (price - p["entry"]) * p["contracts"] * p["cs"]

    def _check_triggers(self):
        if not self.positions:
            return
        prices = self.last_prices(list(self.positions))
        for s, p in list(self.positions.items()):
            px = prices.get(s)
            if px is None:
                continue
            hit_sl = px <= p["sl"] if p["side"] == "long" else px >= p["sl"]
            hit_tp = px >= p["tp"] if p["side"] == "long" else px <= p["tp"]
            if hit_sl or hit_tp:
                log.info("[paper] exchange-side %s hit on %s @ %.6g", "SL" if hit_sl else "TP", s, px)
                self._close(s, p["contracts"], px)

    def fetch_positions(self) -> list[Position]:
        self._check_triggers()
        return [Position(s, p["side"], p["contracts"], p["entry"], p["lev"]) for s, p in self.positions.items()]

    def open_position(self, symbol, side, contracts, leverage, stop, take_profit) -> float:
        px = self.last_price(symbol)
        px = px * (1 + self.slip) if side == "long" else px * (1 - self.slip)
        cs = self._cs(symbol)
        self.balance -= px * contracts * cs * self.fee
        self.positions[symbol] = {"side": side, "contracts": contracts, "entry": px, "lev": leverage,
                                  "sl": stop, "tp": take_profit, "cs": cs}
        self._save()
        return px

    def _close(self, symbol, contracts, px) -> float:
        p = self.positions.get(symbol)
        if not p:
            return px
        contracts = min(contracts, p["contracts"])
        part = dict(p, contracts=contracts)
        pnl = self._pnl(part, px) - px * contracts * p["cs"] * self.fee
        self.balance += pnl
        self.realized += pnl
        p["contracts"] = round(p["contracts"] - contracts, 10)
        if p["contracts"] <= 0:
            del self.positions[symbol]
        self._save()
        return px

    def close_position(self, symbol, side, contracts, leverage) -> float:
        px = self.last_price(symbol)
        px = px * (1 - self.slip) if side == "long" else px * (1 + self.slip)
        return self._close(symbol, contracts, px)

    def cancel_all(self, symbol: str) -> None:
        pass
