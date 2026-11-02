"""Telegram notifications + command polling (stdlib only)."""
from __future__ import annotations

import json
import logging
import queue
import threading
import urllib.parse
import urllib.request

log = logging.getLogger("bot.telegram")


class Notifier:
    def __init__(self, token: str = "", chat_id: str = "", enabled: bool = True):
        self.token = token
        self.chat_id = str(chat_id) if chat_id else ""
        self.enabled = bool(enabled and token and chat_id)
        self.commands: "queue.Queue[str]" = queue.Queue()
        self._offset = 0
        self._stop = threading.Event()

    def _api(self, method: str, params: dict, timeout: float = 15):
        url = f"https://api.telegram.org/bot{self.token}/{method}"
        data = urllib.parse.urlencode(params).encode()
        with urllib.request.urlopen(url, data=data, timeout=timeout) as r:  # noqa: S310
            return json.loads(r.read().decode())

    def send(self, text: str) -> None:
        log.info("NOTIFY: %s", text.replace("\n", " | "))
        if not self.enabled:
            return
        try:
            for i in range(0, len(text), 3900):
                self._api("sendMessage", {"chat_id": self.chat_id, "text": text[i:i + 3900]})
        except Exception as e:  # noqa: BLE001
            log.warning("telegram send failed: %s", e)

    def start_polling(self) -> None:
        if not self.enabled:
            return
        threading.Thread(target=self._poll, name="telegram-poll", daemon=True).start()

    def stop(self) -> None:
        self._stop.set()

    def _poll(self) -> None:
        while not self._stop.is_set():
            try:
                res = self._api("getUpdates", {"offset": self._offset, "timeout": 25}, timeout=35)
                for upd in res.get("result", []):
                    self._offset = upd["update_id"] + 1
                    msg = upd.get("message") or upd.get("edited_message") or {}
                    chat = str((msg.get("chat") or {}).get("id", ""))
                    text = msg.get("text")
                    if not text:
                        continue
                    if chat != self.chat_id:  # only the owner can control the bot
                        log.warning("ignored command from unauthorized chat %s", chat)
                        continue
                    self.commands.put(text)
            except Exception as e:  # noqa: BLE001
                log.debug("telegram poll error: %s", e)
                self._stop.wait(5)
