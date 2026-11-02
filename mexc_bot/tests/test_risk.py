from bot.config import RiskCfg
from bot.risk import choose_leverage, liquidation_distance, size_order


def test_aplus_uses_50x_when_stop_is_safe():
    lev, _ = choose_leverage("A+", 0.008, RiskCfg())
    assert lev == 50


def test_aplus_falls_back_to_20x_if_stop_too_wide_for_50x():
    lev, _ = choose_leverage("A+", 0.02, RiskCfg())
    assert lev == 20


def test_normal_grade_never_uses_50x():
    lev, _ = choose_leverage("A", 0.005, RiskCfg())
    assert lev == 20


def test_trade_rejected_if_stop_beyond_liquidation_safety():
    lev, note = choose_leverage("A", 0.05, RiskCfg())
    assert lev is None and note


def test_market_max_leverage_cap():
    lev, _ = choose_leverage("A+", 0.005, RiskCfg(), market_max_leverage=25)
    assert lev == 25


def test_stop_always_before_liquidation():
    cfg = RiskCfg()
    for stop in [0.001 * k for k in range(1, 60)]:
        lev, _ = choose_leverage("A+", stop, cfg)
        if lev:
            assert stop < liquidation_distance(lev, cfg.maintenance_margin_rate)


def test_margin_is_two_percent_of_equity():
    cfg = RiskCfg()
    plan = size_order(1000, 30000, 0.01, 20, 0.0001, 1, 1, cfg)
    assert abs(plan.margin - 20) < 0.5  # 2% of 1000
    assert abs(plan.notional - 400) < 10
    plan50 = size_order(1000, 30000, 0.01, 50, 0.0001, 1, 1, cfg)
    assert abs(plan50.margin - 20) < 0.5


def test_too_small_account_returns_none():
    assert size_order(1, 30000, 0.01, 20, 0.01, 1, 1, RiskCfg()) is None
