"""The 24/7 trading engine."""
from __future__ import annotations

import csv
import json
import logging
import time
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from . import strategy as st
from .commands import HELP_TEXT, Command, parse
from .config import Config
from .exchange import TF_MS, drop_unclosed
from .notifier import Notifier
from .risk import choose_leverage, liquidation_price, size_order

log = logging.getLogger("bot.trader")

SIDE_AR = {"long": "لونج 🟢", "short": "شورت 🔴"}


def _now_ms() -> int:
    return int(time.time() * 1000)


def _fmt(x: float) -> str:
    return f"{x:.6g}"


class Trader:
    def __init__(self, cfg: Config, exchange, notifier: Notifier | None = None, clock=time.time, sleep=time.sleep):
        self.cfg = cfg
        self.ex = exchange
        self.notifier = notifier or Notifier(enabled=False)
        self.clock = clock
        self.sleep = sleep
        self.data_dir = Path(cfg.data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.state_file = self.data_dir / "state.json"
        self.trades_file = self.data_dir / "trades.csv"
        self.symbols: list[str] = []
        self._symbols_refreshed = 0.0
        self._last_scan_bar = 0
        self._running = True
        self._error_streak = 0
        self.state = {
            "positions": {},  # symbol -> managed position dict
            "paused": False,
            "direction": cfg.strategy.direction,
            "day": "",
            "day_start_equity": 0.0,
            "daily_halt": False,
            "loss_streak": 0,
            "pause_until": 0.0,
            "cooldown": {},  # symbol -> ts until which no new entry
            "stats": {"trades": 0, "wins": 0, "losses": 0, "pnl": 0.0},
            "recent": [],
        }
        self._load_state()

    # ------------------------------------------------------------------ state
    def _load_state(self) -> None:
        if self.state_file.exists():
            try:
                saved = json.loads(self.state_file.read_text(encoding="utf-8"))
                self.state.update(saved)
                log.info("state restored: %d managed positions", len(self.state["positions"]))
            except Exception as e:  # noqa: BLE001
                log.error("could not read state file: %s", e)

    def save_state(self) -> None:
        tmp = self.state_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.state, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.state_file)

    def _record_trade(self, row: dict) -> None:
        new = not self.trades_file.exists()
        with self.trades_file.open("a", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(row.keys()))
            if new:
                w.writeheader()
            w.writerow(row)
        self.state["recent"] = (self.state.get("recent", []) + [row])[-20:]

    # ---------------------------------------------------------------- startup
    def startup(self) -> None:
        self.ex.setup()
        self.refresh_symbols(force=True)
        eq = self.ex.equity()
        self._roll_day(eq)
        self.reconcile()
        self.notifier.start_polling()
        mode = "تجريبي (Paper)" if self.cfg.mode == "paper" else "حقيقي (LIVE) ⚠️"
        self.notifier.send(
            f"🤖 بدأ البوت — الوضع: {mode}\n"
            f"الرصيد: {eq:.2f} USDT\n"
            f"الهامش لكل صفقة: {self.cfg.risk.margin_per_trade_pct}% "
            f"({'متبادل' if self.cfg.risk.margin_mode == 'cross' else 'معزول'}) | الرافعة: {self.cfg.risk.normal_leverage}x "
            f"(A+: {self.cfg.risk.high_confidence_leverage}x)\n"
            f"الاتجاه: {self.state['direction']} | العملات: {len(self.symbols)}\n"
            f"اكتب: مساعدة"
        )

    def refresh_symbols(self, force: bool = False) -> None:
        if not force and self.clock() - self._symbols_refreshed < 3600:
            return
        sc = self.cfg.symbols
        syms: list[str] = []
        if sc.auto:
            try:
                syms = self.ex.top_symbols(sc.top_n, sc.min_quote_volume_24h, sc.exclude)
            except Exception as e:  # noqa: BLE001
                log.warning("auto symbol selection failed: %s", e)
        if not syms:
            syms = [s for s in sc.list if s not in sc.exclude and s in (self.ex.markets or {s: 1})]
        self.symbols = syms
        self._symbols_refreshed = self.clock()
        log.info("watching %d symbols: %s", len(syms), ", ".join(syms))

    # ------------------------------------------------------------- main loop
    def run_forever(self) -> None:
        backoff = 5
        while self._running:
            try:
                self.startup()
                break
            except Exception as e:  # noqa: BLE001
                log.exception("startup failed: %s (retry in %ss)", e, backoff)
                self.sleep(backoff)
                backoff = min(backoff * 2, 300)

        while self._running:
            started = self.clock()
            try:
                self.cycle()
                self._error_streak = 0
            except KeyboardInterrupt:
                raise
            except Exception as e:  # noqa: BLE001
                self._error_streak += 1
                wait = min(5 * 2 ** min(self._error_streak, 6), 300)
                log.exception("cycle error #%d: %s", self._error_streak, e)
                if self._error_streak in (3, 10) or self._error_streak % 50 == 0:
                    self.notifier.send(f"⚠️ خطأ متكرر ({self._error_streak}): {e}\nالبوت يعيد المحاولة تلقائياً.")
                self._wait(wait)
                continue
            self._wait(max(1.0, self.cfg.loop.manage_seconds - (self.clock() - started)))

    def _wait(self, seconds: float) -> None:
        end = self.clock() + seconds
        while self._running and self.clock() < end:
            self.process_commands()
            self.sleep(min(1.0, max(0.0, end - self.clock())))

    def stop(self) -> None:
        self._running = False
        self.notifier.stop()
        self.save_state()

    def cycle(self) -> None:
        self.process_commands()
        self.refresh_symbols()
        self.reconcile()
        self.manage_positions()
        eq = self.ex.equity()
        self._roll_day(eq)
        self._check_daily_loss(eq)
        if self._scan_due():
            self.scan_and_trade(eq)
        self.save_state()

    # ----------------------------------------------------------- guards
    def _roll_day(self, equity: float) -> None:
        day = datetime.fromtimestamp(self.clock(), tz=timezone.utc).strftime("%Y-%m-%d")
        if self.state["day"] != day:
            if self.state["day"]:
                self.notifier.send(self._daily_report(equity))
            self.state["day"] = day
            self.state["day_start_equity"] = equity
            self.state["daily_halt"] = False

    def _check_daily_loss(self, equity: float) -> None:
        start = self.state["day_start_equity"] or equity
        if start <= 0 or self.state["daily_halt"]:
            return
        dd = (start - equity) / start * 100
        if dd >= self.cfg.risk.max_daily_loss_pct:
            self.state["daily_halt"] = True
            self.notifier.send(f"🛑 وصلت خسارة اليوم {dd:.2f}% — توقف فتح صفقات جديدة حتى بداية اليوم القادم (UTC).")

    def can_open(self) -> tuple[bool, str]:
        if self.state["paused"]:
            return False, "البوت موقوف مؤقتاً (ايقاف)"
        if self.state["daily_halt"]:
            return False, "تم الوصول لحد الخسارة اليومي"
        if self.clock() < self.state.get("pause_until", 0):
            mins = (self.state["pause_until"] - self.clock()) / 60
            return False, f"استراحة بعد خسائر متتالية ({mins:.0f} دقيقة متبقية)"
        if len(self.state["positions"]) >= self.cfg.risk.max_open_positions:
            return False, "الحد الأقصى للصفقات المفتوحة"
        return True, ""

    def _scan_due(self) -> bool:
        tf_ms = TF_MS[self.cfg.timeframes.signal]
        now = int(self.clock() * 1000)
        bar_open = now - now % tf_ms
        if bar_open > self._last_scan_bar and now - bar_open >= self.cfg.loop.scan_delay_seconds * 1000:
            self._last_scan_bar = bar_open
            return True
        return False

    # ----------------------------------------------------------- analysis
    def analyze(self, symbol: str, direction: str | None = None) -> st.Analysis:
        tfc, sc = self.cfg.timeframes, self.cfg.strategy
        now = int(self.clock() * 1000)
        ltf = st.prepare(drop_unclosed(self.ex.fetch_ohlcv(symbol, tfc.signal, sc.candles), tfc.signal, now))
        htf = st.prepare(drop_unclosed(self.ex.fetch_ohlcv(symbol, tfc.trend, sc.candles), tfc.trend, now))
        mac = st.prepare(drop_unclosed(self.ex.fetch_ohlcv(symbol, tfc.macro, sc.candles), tfc.macro, now))
        funding = self.ex.funding_rate(symbol)
        return st.evaluate(symbol, ltf, htf, mac, funding, sc, self.cfg.exits,
                           direction=direction or self.state["direction"])

    def scan_and_trade(self, equity: float) -> None:
        ok, why = self.can_open()
        if not ok:
            log.info("scan skipped: %s", why)
            return
        now = self.clock()
        signals = []
        for sym in self.symbols:
            if sym in self.state["positions"] or self.state["cooldown"].get(sym, 0) > now:
                continue
            try:
                a = self.analyze(sym)
            except Exception as e:  # noqa: BLE001
                log.warning("analyze %s failed: %s", sym, e)
                continue
            log.info("%-18s long=%5.1f short=%5.1f %s", sym, a.long_score, a.short_score,
                     f"-> {a.signal.side} {a.signal.grade}" if a.signal else "")
            if a.signal:
                signals.append(a.signal)
        signals.sort(key=lambda s: (s.grade == "A+", s.score), reverse=True)
        for sig in signals:
            ok, why = self.can_open()
            if not ok:
                break
            self.open_trade(sig, equity)

    # ----------------------------------------------------------- execution
    def open_trade(self, sig: st.Signal, equity: float) -> Optional[dict]:
        mkt = self.ex.market(sig.symbol)
        lev, note = choose_leverage(sig.grade, sig.stop_pct, self.cfg.risk, mkt.max_leverage)
        if lev is None:
            log.info("skip %s: %s", sig.symbol, note)
            return None
        price = self.ex.last_price(sig.symbol)
        # re-anchor the levels to the live price, keeping the structural stop distance
        risk_frac = sig.stop_pct
        if (sig.side == "long" and price <= sig.stop) or (sig.side == "short" and price >= sig.stop):
            log.info("skip %s: price already beyond stop", sig.symbol)
            return None
        plan = size_order(equity, price, risk_frac, lev, mkt.contract_size, mkt.amount_step, mkt.min_amount, self.cfg.risk)
        if plan is None:
            log.info("skip %s: size below exchange minimum (equity %.2f)", sig.symbol, equity)
            return None
        s = 1 if sig.side == "long" else -1
        stop = price * (1 - s * risk_frac)
        tp1 = price * (1 + s * risk_frac * self.cfg.exits.tp1_r)
        tp2 = price * (1 + s * risk_frac * self.cfg.exits.tp2_r)
        fill = self.ex.open_position(sig.symbol, sig.side, plan.contracts, lev, stop, tp2)
        # recompute from actual fill
        stop = fill * (1 - s * risk_frac)
        tp1 = fill * (1 + s * risk_frac * self.cfg.exits.tp1_r)
        tp2 = fill * (1 + s * risk_frac * self.cfg.exits.tp2_r)
        pos = {
            "symbol": sig.symbol, "side": sig.side, "entry": fill, "contracts": plan.contracts,
            "initial_contracts": plan.contracts, "leverage": lev, "stop": stop, "initial_stop": stop,
            "tp1": tp1, "tp2": tp2, "tp1_done": False, "best": fill, "atr": sig.atr,
            "grade": sig.grade, "score": sig.score, "opened_at": self.clock(), "margin": plan.margin,
            "contract_size": mkt.contract_size, "realized": 0.0,
        }
        self.state["positions"][sig.symbol] = pos
        self.save_state()
        liq = liquidation_price(fill, sig.side, lev, self.cfg.risk.maintenance_margin_rate,
                                self.cfg.risk.margin_mode, equity, plan.notional)
        mm_ar = "متبادل" if self.cfg.risk.margin_mode == "cross" else "معزول"
        self.notifier.send(
            f"🚀 صفقة جديدة {SIDE_AR[sig.side]} {sig.symbol}\n"
            f"التقييم: {sig.score:.0f}/100 ({sig.grade}) | المحفز: {sig.trigger}\n"
            f"الدخول: {_fmt(fill)} | الرافعة: {lev}x | الهامش ({mm_ar}): {plan.margin:.2f} USDT\n"
            f"وقف الخسارة: {_fmt(stop)} ({risk_frac*100:.2f}%) | التصفية≈ {_fmt(liq)}\n"
            f"الهدف 1: {_fmt(tp1)} | الهدف 2: {_fmt(tp2)}\n"
            f"الخسارة القصوى≈ {plan.risk_usdt:.2f} USDT\n"
            f"الأسباب: " + "، ".join(sig.reasons[:6])
        )
        return pos

    def close_trade(self, symbol: str, reason: str, fraction: float = 1.0) -> None:
        pos = self.state["positions"].get(symbol)
        if not pos:
            return
        qty = pos["contracts"] if fraction >= 1 else self._round_qty(symbol, pos["contracts"] * fraction)
        if qty <= 0:
            return
        exit_px = self.ex.close_position(symbol, pos["side"], qty, pos["leverage"])
        s = 1 if pos["side"] == "long" else -1
        fee = self.cfg.risk.taker_fee * (pos["entry"] + exit_px) * qty * pos["contract_size"]
        pnl = s * (exit_px - pos["entry"]) * qty * pos["contract_size"] - fee
        pos["realized"] += pnl
        pos["contracts"] = round(pos["contracts"] - qty, 10)
        if pos["contracts"] <= 1e-12 or fraction >= 1:
            self._finalize(symbol, pos, exit_px, reason)
        else:
            self.notifier.send(f"💰 جني ربح جزئي {symbol} ({reason}) @ {_fmt(exit_px)} | ربح: {pnl:+.2f} USDT\n"
                               f"تم نقل الوقف إلى نقطة الدخول.")
        self.save_state()

    def _round_qty(self, symbol: str, qty: float) -> float:
        m = self.ex.market(symbol)
        step = m.amount_step or 1
        q = int(qty / step + 1e-9) * step
        return round(q, 10) if q >= (m.min_amount or step) else 0.0

    def _finalize(self, symbol: str, pos: dict, exit_px: float, reason: str) -> None:
        try:
            self.ex.cancel_all(symbol)
        except Exception as e:  # noqa: BLE001
            log.debug("cancel_all failed: %s", e)
        pnl = pos["realized"]
        stats = self.state["stats"]
        stats["trades"] += 1
        stats["pnl"] += pnl
        if pnl >= 0:
            stats["wins"] += 1
            self.state["loss_streak"] = 0
        else:
            stats["losses"] += 1
            self.state["loss_streak"] += 1
            if self.state["loss_streak"] >= self.cfg.risk.max_consecutive_losses:
                self.state["pause_until"] = self.clock() + self.cfg.risk.pause_after_losses_minutes * 60
                self.state["loss_streak"] = 0
                self.notifier.send(f"⏸️ {self.cfg.risk.max_consecutive_losses} خسائر متتالية — استراحة "
                                   f"{self.cfg.risk.pause_after_losses_minutes} دقيقة لحماية الحساب.")
        self.state["cooldown"][symbol] = self.clock() + self.cfg.risk.symbol_cooldown_minutes * 60
        self.state["positions"].pop(symbol, None)
        roi = pnl / pos["margin"] * 100 if pos.get("margin") else 0
        self._record_trade({
            "closed_at": datetime.fromtimestamp(self.clock(), tz=timezone.utc).isoformat(timespec="seconds"),
            "symbol": symbol, "side": pos["side"], "grade": pos["grade"], "score": round(pos["score"], 1),
            "leverage": pos["leverage"], "entry": pos["entry"], "exit": exit_px, "pnl": round(pnl, 4),
            "roi_pct": round(roi, 2), "reason": reason,
        })
        icon = "✅" if pnl >= 0 else "❌"
        self.notifier.send(f"{icon} إغلاق {SIDE_AR[pos['side']]} {symbol} ({reason})\n"
                           f"الخروج: {_fmt(exit_px)} | الربح/الخسارة: {pnl:+.2f} USDT ({roi:+.1f}% من الهامش)")

    # ----------------------------------------------------------- management
    def reconcile(self) -> None:
        """Sync managed positions with what is really open on the exchange."""
        live = {p.symbol: p for p in self.ex.fetch_positions()}
        for sym, pos in list(self.state["positions"].items()):
            if sym not in live:
                if self.clock() - pos["opened_at"] < 30:
                    continue  # exchange may not report a brand-new position yet
                # closed on the exchange (attached SL/TP, liquidation or manual close)
                exit_px = self.ex.last_price(sym)
                s = 1 if pos["side"] == "long" else -1
                pos["realized"] += s * (exit_px - pos["entry"]) * pos["contracts"] * pos["contract_size"]
                pos["contracts"] = 0
                self._finalize(sym, pos, exit_px, "أُغلقت في المنصة")
            else:
                pos["contracts"] = live[sym].contracts
        for sym, p in live.items():
            if sym not in self.state["positions"]:
                self._adopt(p)

    def _adopt(self, p) -> None:
        """A position exists on the exchange that the bot does not know (e.g. after a crash
        or opened manually) - take over its management with a protective ATR stop."""
        try:
            df = st.prepare(self.ex.fetch_ohlcv(p.symbol, self.cfg.timeframes.signal, 100))
            a = float(df["atr"].iloc[-1])
        except Exception:  # noqa: BLE001
            a = p.entry * 0.01
        s = 1 if p.side == "long" else -1
        lev = int(p.leverage or self.cfg.risk.normal_leverage)
        risk = min(2.0 * a, p.entry * (1 / lev - self.cfg.risk.maintenance_margin_rate) * self.cfg.risk.liquidation_safety)
        mkt = self.ex.market(p.symbol)
        self.state["positions"][p.symbol] = {
            "symbol": p.symbol, "side": p.side, "entry": p.entry, "contracts": p.contracts,
            "initial_contracts": p.contracts, "leverage": lev, "stop": p.entry - s * risk, "initial_stop": p.entry - s * risk,
            "tp1": p.entry + s * risk * self.cfg.exits.tp1_r, "tp2": p.entry + s * risk * self.cfg.exits.tp2_r,
            "tp1_done": False, "best": p.entry, "atr": a, "grade": "adopted", "score": 0,
            "opened_at": self.clock(), "margin": p.entry * p.contracts * mkt.contract_size / lev,
            "contract_size": mkt.contract_size, "realized": 0.0,
        }
        self.notifier.send(f"🔄 تم تبنّي صفقة موجودة {p.symbol} {SIDE_AR[p.side]} وإدارتها بوقف حماية.")

    def manage_positions(self) -> None:
        if not self.state["positions"]:
            return
        prices = self.ex.last_prices(list(self.state["positions"]))
        ex = self.cfg.exits
        for sym, pos in list(self.state["positions"].items()):
            px = prices.get(sym)
            if px is None:
                continue
            s = 1 if pos["side"] == "long" else -1
            pos["best"] = max(pos["best"], px) if s == 1 else min(pos["best"], px)

            if (px - pos["stop"]) * s <= 0:
                self.close_trade(sym, "وقف متحرك/تعادل" if pos["tp1_done"] else "وقف الخسارة")
                continue
            if (px - pos["tp2"]) * s >= 0:
                self.close_trade(sym, "الهدف النهائي 🎯")
                continue
            if not pos["tp1_done"] and (px - pos["tp1"]) * s >= 0:
                pos["tp1_done"] = True
                pos["stop"] = pos["entry"] * (1 + s * ex.breakeven_buffer_pct / 100)
                self.close_trade(sym, "الهدف الأول", ex.tp1_close_pct / 100)
                if sym not in self.state["positions"]:
                    continue
            if pos["tp1_done"]:
                trail = pos["best"] - s * ex.trail_atr * pos["atr"]
                if (trail - pos["stop"]) * s > 0:
                    pos["stop"] = trail
            if self.clock() - pos["opened_at"] > self.cfg.risk.max_hold_hours * 3600:
                self.close_trade(sym, "انتهاء مدة الصفقة")

    # ----------------------------------------------------------- commands
    def process_commands(self) -> None:
        while not self.notifier.commands.empty():
            text = self.notifier.commands.get_nowait()
            try:
                reply = self.handle_command(text)
            except Exception as e:  # noqa: BLE001
                log.exception("command failed")
                reply = f"⚠️ فشل تنفيذ الأمر: {e}"
            if reply:
                self.notifier.send(reply)

    def handle_command(self, text: str) -> str:
        cmd: Command | None = parse(text)
        if cmd is None:
            return "لم أفهم الأمر. اكتب: مساعدة"
        n = cmd.name
        if n == "help":
            return HELP_TEXT
        if n == "status":
            return self.status_text()
        if n == "balance":
            eq = self.ex.equity()
            start = self.state["day_start_equity"] or eq
            return f"💼 الرصيد: {eq:.2f} USDT | اليوم: {eq - start:+.2f} USDT"
        if n == "trades":
            rows = self.state.get("recent", [])[-10:]
            if not rows:
                return "لا توجد صفقات مغلقة بعد."
            return "\n".join(f"{r['symbol']} {r['side']} {r['pnl']:+.2f} ({r['reason']})" for r in rows)
        if n == "pause":
            self.state["paused"] = True
            return "⏸️ تم إيقاف فتح صفقات جديدة. الصفقات المفتوحة تبقى تحت الإدارة."
        if n == "resume":
            self.state["paused"] = False
            self.state["pause_until"] = 0
            return "▶️ تم استئناف التداول."
        if n == "mode":
            self.state["direction"] = cmd.arg
            return {"long": "✅ الوضع: لونج فقط", "short": "✅ الوضع: شورت فقط", "both": "✅ الوضع: لونج وشورت"}[cmd.arg]
        if n == "closeall":
            syms = list(self.state["positions"])
            for sym in syms:
                self.close_trade(sym, "أمر يدوي")
            return f"تم إغلاق {len(syms)} صفقة." if syms else "لا توجد صفقات مفتوحة."

        symbol = self.ex.resolve_symbol(cmd.arg or "")
        if not symbol:
            return f"لم أجد العملة {cmd.arg} في عقود MEXC."
        if n == "close":
            if symbol not in self.state["positions"]:
                return f"لا توجد صفقة مفتوحة على {symbol}."
            self.close_trade(symbol, "أمر يدوي")
            return ""
        if n == "analyze":
            a = self.analyze(symbol, direction="both")
            lines = [f"📊 تحليل {symbol}", f"لونج: {a.long_score:.0f}/100", *[f"  + {w}" for w in a.long_reasons],
                     f"شورت: {a.short_score:.0f}/100", *[f"  + {w}" for w in a.short_reasons]]
            if a.signal:
                g = a.signal
                lines.append(f"➡️ إشارة: {g.side} ({g.grade}) دخول {_fmt(g.entry)} وقف {_fmt(g.stop)} هدف {_fmt(g.tp2)}")
            else:
                lines.append("➡️ لا توجد إشارة دخول الآن" + (f" ({'، '.join(a.blocked)})" if a.blocked else ""))
            return "\n".join(lines)
        if n in ("long", "short"):
            if symbol in self.state["positions"]:
                return f"يوجد صفقة مفتوحة على {symbol} بالفعل."
            if len(self.state["positions"]) >= self.cfg.risk.max_open_positions:
                return "وصلت للحد الأقصى للصفقات المفتوحة."
            sig = self._manual_signal(symbol, n)
            pos = self.open_trade(sig, self.ex.equity())
            return "" if pos else "لم يتم فتح الصفقة (الوقف بعيد جداً عن حد التصفية أو الحجم أقل من الحد الأدنى)."
        return "أمر غير معروف."

    def _manual_signal(self, symbol: str, side: str) -> st.Signal:
        df = st.prepare(drop_unclosed(self.ex.fetch_ohlcv(symbol, self.cfg.timeframes.signal, 200),
                                      self.cfg.timeframes.signal, int(self.clock() * 1000)))
        entry, stop, tp1, tp2, a = st.build_levels(df, len(df) - 1, side, self.cfg.strategy, self.cfg.exits)
        return st.Signal(symbol, side, 0, "manual", entry, stop, tp1, tp2, a, "manual", ["أمر يدوي"])

    def status_text(self) -> str:
        eq = self.ex.equity()
        stt = self.state["stats"]
        wr = stt["wins"] / stt["trades"] * 100 if stt["trades"] else 0
        ok, why = self.can_open()
        lines = [
            f"🤖 الحالة: {'يعمل ✅' if ok else 'لا يفتح صفقات: ' + why}",
            f"الوضع: {self.cfg.mode} | الاتجاه: {self.state['direction']}",
            f"الرصيد: {eq:.2f} USDT",
            f"الصفقات: {stt['trades']} | نسبة النجاح: {wr:.0f}% | الربح الكلي: {stt['pnl']:+.2f}",
            f"الصفقات المفتوحة ({len(self.state['positions'])}):",
        ]
        if self.state["positions"]:
            prices = self.ex.last_prices(list(self.state["positions"]))
            for sym, p in self.state["positions"].items():
                px = prices.get(sym, p["entry"])
                s = 1 if p["side"] == "long" else -1
                upnl = s * (px - p["entry"]) * p["contracts"] * p["contract_size"]
                lines.append(f"• {sym} {SIDE_AR[p['side']]} {p['leverage']}x دخول {_fmt(p['entry'])} الآن {_fmt(px)} "
                             f"وقف {_fmt(p['stop'])} | {upnl:+.2f} USDT")
        return "\n".join(lines)

    def _daily_report(self, equity: float) -> str:
        start = self.state["day_start_equity"] or equity
        chg = equity - start
        pct = chg / start * 100 if start else 0
        return f"📅 تقرير اليوم {self.state['day']}: {chg:+.2f} USDT ({pct:+.2f}%) | الرصيد {equity:.2f}"
