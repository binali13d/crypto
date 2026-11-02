"""Entry point:  python -m bot  [--config config.yaml]"""
from __future__ import annotations

import argparse
import logging
import signal
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from .config import load_config
from .exchange import LiveExchange, PaperExchange
from .notifier import Notifier
from .trader import Trader


def setup_logging(level: str, log_dir: str) -> None:
    Path(log_dir).mkdir(parents=True, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    fh = RotatingFileHandler(Path(log_dir) / "bot.log", maxBytes=5_000_000, backupCount=5, encoding="utf-8")
    fh.setFormatter(fmt)
    root.handlers[:] = [sh, fh]
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("ccxt").setLevel(logging.WARNING)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="MEXC futures trading bot")
    ap.add_argument("--config", default="config.yaml")
    ap.add_argument("--env", default=".env")
    args = ap.parse_args(argv)

    cfg = load_config(args.config, args.env)
    setup_logging(cfg.logging.level, cfg.logging.dir)
    log = logging.getLogger("bot")

    if cfg.mode == "live":
        log.warning("LIVE MODE - real money is at risk")
        ex = LiveExchange(cfg.api_key, cfg.api_secret, cfg.risk.margin_mode)
    else:
        log.info("PAPER MODE - simulated balance %.2f USDT", cfg.paper.start_balance)
        ex = PaperExchange(cfg.paper.start_balance, cfg.risk.taker_fee, cfg.paper.slippage_pct,
                           account_file=str(Path(cfg.data_dir) / "paper_account.json"))

    notifier = Notifier(cfg.telegram.token, cfg.telegram.chat_id, cfg.telegram.enabled)
    trader = Trader(cfg, ex, notifier)

    def _graceful(signum, _frame):
        log.info("signal %s received, shutting down (open positions keep their exchange SL/TP)", signum)
        trader.stop()

    signal.signal(signal.SIGTERM, _graceful)
    signal.signal(signal.SIGINT, _graceful)
    trader.run_forever()
    notifier.send("⏹️ تم إيقاف البوت. الصفقات المفتوحة محمية بوقف الخسارة في المنصة.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
