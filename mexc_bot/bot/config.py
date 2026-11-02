"""Configuration loading (YAML + environment variables)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field, fields, is_dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass
class SymbolsCfg:
    auto: bool = True
    top_n: int = 15
    min_quote_volume_24h: float = 50_000_000
    list: list = field(default_factory=lambda: ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"])
    exclude: list = field(default_factory=lambda: [])


@dataclass
class TimeframesCfg:
    signal: str = "15m"
    trend: str = "1h"
    macro: str = "4h"


@dataclass
class RiskCfg:
    margin_per_trade_pct: float = 2.0
    sizing_mode: str = "margin"  # margin | risk
    margin_mode: str = "cross"  # cross (متبادل) | isolated (معزول)
    normal_leverage: int = 20
    high_confidence_leverage: int = 50
    enable_high_leverage: bool = True
    maintenance_margin_rate: float = 0.005
    liquidation_safety: float = 0.7
    max_open_positions: int = 3
    max_daily_loss_pct: float = 6.0
    max_consecutive_losses: int = 3
    pause_after_losses_minutes: int = 120
    symbol_cooldown_minutes: int = 45
    max_hold_hours: float = 36
    taker_fee: float = 0.0002


@dataclass
class StrategyCfg:
    direction: str = "both"  # both | long | short
    min_score: float = 65
    high_conf_score: float = 85
    adx_min: float = 22
    breakout_volume_ratio: float = 1.5
    volume_confirm_ratio: float = 1.3
    max_extension_atr: float = 2.5
    swing_lookback: int = 10
    min_stop_atr: float = 1.0
    max_stop_atr: float = 2.5
    funding_crowded: float = 0.0005
    candles: int = 300


@dataclass
class ExitsCfg:
    tp1_r: float = 1.5
    tp1_close_pct: float = 50
    tp2_r: float = 3.0
    breakeven_buffer_pct: float = 0.1
    trail_atr: float = 2.0


@dataclass
class LoopCfg:
    manage_seconds: float = 10
    scan_delay_seconds: float = 5


@dataclass
class PaperCfg:
    start_balance: float = 1000
    slippage_pct: float = 0.03


@dataclass
class TelegramCfg:
    enabled: bool = True
    token: str = ""
    chat_id: str = ""


@dataclass
class LoggingCfg:
    level: str = "INFO"
    dir: str = "logs"


@dataclass
class Config:
    mode: str = "paper"
    symbols: SymbolsCfg = field(default_factory=SymbolsCfg)
    timeframes: TimeframesCfg = field(default_factory=TimeframesCfg)
    risk: RiskCfg = field(default_factory=RiskCfg)
    strategy: StrategyCfg = field(default_factory=StrategyCfg)
    exits: ExitsCfg = field(default_factory=ExitsCfg)
    loop: LoopCfg = field(default_factory=LoopCfg)
    paper: PaperCfg = field(default_factory=PaperCfg)
    telegram: TelegramCfg = field(default_factory=TelegramCfg)
    logging: LoggingCfg = field(default_factory=LoggingCfg)
    data_dir: str = "data"
    api_key: str = ""
    api_secret: str = ""


def _fill(dc_type, data: dict | None):
    obj = dc_type()
    if not data:
        return obj
    for f in fields(dc_type):
        if f.name not in data:
            continue
        current = getattr(obj, f.name)
        value = data[f.name]
        if is_dataclass(current):
            value = _fill(type(current), value)
        setattr(obj, f.name, value)
    return obj


def load_config(path: str | Path = "config.yaml", env_file: str | Path | None = ".env") -> Config:
    if env_file:
        try:
            from dotenv import load_dotenv

            load_dotenv(env_file)
        except ImportError:  # pragma: no cover
            pass

    raw: dict[str, Any] = {}
    p = Path(path)
    if p.exists():
        raw = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    cfg = _fill(Config, raw)

    cfg.mode = os.getenv("BOT_MODE", cfg.mode).strip().lower()
    cfg.api_key = os.getenv("MEXC_API_KEY", cfg.api_key)
    cfg.api_secret = os.getenv("MEXC_API_SECRET", cfg.api_secret)
    cfg.telegram.token = os.getenv("TELEGRAM_BOT_TOKEN", cfg.telegram.token)
    cfg.telegram.chat_id = os.getenv("TELEGRAM_CHAT_ID", cfg.telegram.chat_id)
    validate(cfg)
    return cfg


def validate(cfg: Config) -> None:
    if cfg.mode not in ("paper", "live"):
        raise ValueError("mode must be 'paper' or 'live'")
    if cfg.mode == "live" and (not cfg.api_key or not cfg.api_secret):
        raise ValueError("Live mode requires MEXC_API_KEY and MEXC_API_SECRET in .env")
    if cfg.strategy.direction not in ("both", "long", "short"):
        raise ValueError("strategy.direction must be both|long|short")
    if cfg.risk.margin_mode not in ("cross", "isolated"):
        raise ValueError("risk.margin_mode must be cross|isolated")
    if cfg.risk.sizing_mode not in ("margin", "risk"):
        raise ValueError("risk.sizing_mode must be margin|risk")
    if not 0 < cfg.risk.margin_per_trade_pct <= 100:
        raise ValueError("risk.margin_per_trade_pct must be in (0, 100]")
    if cfg.risk.normal_leverage < 1 or cfg.risk.high_confidence_leverage < 1:
        raise ValueError("leverage must be >= 1")
    if cfg.exits.tp2_r <= cfg.exits.tp1_r:
        raise ValueError("exits.tp2_r must be greater than exits.tp1_r")
