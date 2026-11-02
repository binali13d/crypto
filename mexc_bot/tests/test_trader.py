import time

import pytest

from bot.config import Config
from bot.exchange import PaperExchange
from bot.trader import Trader
from tests.fakes import FakeClient


@pytest.fixture
def trader(tmp_path):
    cfg = Config()
    cfg.data_dir = str(tmp_path)
    cfg.symbols.auto = False
    cfg.symbols.list = ["BTC/USDT:USDT", "ETH/USDT:USDT"]
    client = FakeClient()
    ex = PaperExchange(1000, 0.0002, 0.0, client=client)
    t = Trader(cfg, ex)
    t.startup()
    return t, client


def test_manual_long_partial_tp_breakeven_and_close(trader):
    t, client = trader
    reply = t.handle_command("لونج BTC")
    assert reply == ""
    pos = t.state["positions"]["BTC/USDT:USDT"]
    assert pos["side"] == "long" and pos["leverage"] == 20
    assert abs(pos["margin"] - 20) < 1  # 2% of 1000
    # price reaches TP1 -> half closed, stop moved to break-even
    client.price["BTC/USDT:USDT"] = pos["tp1"] * 1.0001
    t.manage_positions()
    pos = t.state["positions"]["BTC/USDT:USDT"]
    assert pos["tp1_done"] and pos["stop"] >= pos["entry"]
    assert pos["contracts"] < pos["initial_contracts"]
    # price falls back -> closed at break-even with overall profit
    client.price["BTC/USDT:USDT"] = pos["entry"]
    t.manage_positions()
    assert "BTC/USDT:USDT" not in t.state["positions"]
    assert t.state["stats"]["trades"] == 1 and t.state["stats"]["wins"] == 1
    assert t.ex.equity() > 1000


def test_short_stop_loss_counts_loss(trader):
    t, client = trader
    t.handle_command("شورت ETH")
    pos = t.state["positions"]["ETH/USDT:USDT"]
    client.price["ETH/USDT:USDT"] = pos["stop"] * 1.001
    t.manage_positions()
    assert t.state["stats"]["losses"] == 1
    loss = 1000 - t.ex.equity()
    assert 0 < loss <= 20.5  # never more than the 2% margin (+fees)


def test_pause_resume_and_mode(trader):
    t, _ = trader
    t.handle_command("ايقاف")
    assert t.can_open()[0] is False
    t.handle_command("تشغيل")
    assert t.can_open()[0] is True
    t.handle_command("شورت فقط")
    assert t.state["direction"] == "short"


def test_daily_loss_halts_new_trades(trader):
    t, _ = trader
    t.state["day_start_equity"] = 1000
    t._check_daily_loss(930)
    assert t.state["daily_halt"] and t.can_open()[0] is False


def test_max_positions(trader):
    t, _ = trader
    t.cfg.risk.max_open_positions = 1
    t.handle_command("لونج BTC")
    assert "الأقصى" in t.handle_command("لونج ETH")


def test_reconcile_detects_exchange_side_close(trader):
    t, client = trader
    t.handle_command("لونج BTC")
    pos = t.state["positions"]["BTC/USDT:USDT"]
    pos["opened_at"] = time.time() - 120
    client.price["BTC/USDT:USDT"] = pos["stop"] * 0.99  # paper exchange SL triggers
    t.reconcile()
    assert "BTC/USDT:USDT" not in t.state["positions"]
    assert t.state["stats"]["trades"] == 1


def test_cycle_runs_and_state_persists(trader, tmp_path):
    t, _ = trader
    t.cycle()
    assert (tmp_path / "state.json").exists()
    assert "📊" in t.handle_command("تحليل BTC")
    assert "الحالة" in t.status_text()


def test_switching_paper_to_live_does_not_reuse_paper_state(tmp_path):
    import json
    from bot.trader import Trader as T
    (tmp_path / "state.json").write_text(json.dumps({"mode": "paper", "positions": {"X": {}}, "stats": {"trades": 9}}))
    cfg = Config(); cfg.data_dir = str(tmp_path); cfg.mode = "live"
    t = T(cfg, PaperExchange(100, client=FakeClient()))
    assert t.state["positions"] == {} and t.state["stats"]["trades"] == 0
    assert (tmp_path / "state.paper.bak.json").exists()
