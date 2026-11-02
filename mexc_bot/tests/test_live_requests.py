"""Checks the exact request bodies ccxt would send to MEXC (network calls intercepted)."""
import pytest

from bot.exchange import LiveExchange
from tests.fakes import FakeClient


def make(margin_mode):
    ex = LiveExchange("k", "s", margin_mode)
    c = ex.client
    m = FakeClient().load_markets()["BTC/USDT:USDT"]
    c.markets = {"BTC/USDT:USDT": {**m, "id": "BTC_USDT", "type": "swap", "spot": False, "contract": True,
                                   "base": "BTC", "settle": "USDT", "precision": {"amount": 1, "price": 0.1}}}
    c.markets_by_id = {"BTC_USDT": [c.markets["BTC/USDT:USDT"]]}
    c.symbols = list(c.markets)
    ex.markets = c.markets
    sent = {"orders": [], "lev": []}
    c.contractPrivatePostOrderCreate = lambda req: sent["orders"].append(req) or {"data": {"orderId": "1"}}
    c.contractPrivatePostPositionChangeLeverage = lambda req: sent["lev"].append(req) or {}
    c.fetch_positions = lambda *a, **k: [{"symbol": "BTC/USDT:USDT", "side": "long", "contracts": 13, "entryPrice": 30010}]
    c.fetch_ticker = lambda s: {"last": 30000}
    return ex, sent


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr("bot.exchange.time.sleep", lambda s: None)


def test_cross_margin_requests():
    ex, sent = make("cross")
    ex.open_position("BTC/USDT:USDT", "long", 13, 50, 29760.0, 30900.0)
    ex.close_position("BTC/USDT:USDT", "long", 6, 50)
    assert all(r["openType"] == 2 for r in sent["lev"]) and {r["leverage"] for r in sent["lev"]} == {50}
    assert {r["positionType"] for r in sent["lev"]} == {1, 2}
    op, cl = sent["orders"]
    assert op["openType"] == 2 and op["side"] == 1 and op["vol"] == 13
    assert op["stopLossPrice"] == 29760.0 and op["takeProfitPrice"] == 30900.0
    assert cl["openType"] == 2 and cl["side"] == 4  # close long


def test_isolated_still_supported():
    ex, sent = make("isolated")
    ex.open_position("BTC/USDT:USDT", "short", 5, 20, 31000.0, 29000.0)
    op = sent["orders"][0]
    assert op["openType"] == 1 and op["leverage"] == 20 and op["side"] == 3
