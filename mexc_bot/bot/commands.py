"""Command parser: understands Arabic and English commands (Telegram or console)."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

HELP_TEXT = """الأوامر المتاحة (عربي أو إنجليزي):
• الحالة  /status — حالة البوت والصفقات
• الرصيد  /balance — الرصيد الحالي
• تحليل BTC  /analyze BTC — تحليل عملة وتقييمها
• لونج BTC  /long BTC — فتح صفقة شراء يدوية بنفس إدارة المخاطر
• شورت ETH  /short ETH — فتح صفقة بيع يدوية
• اغلاق BTC  /close BTC — إغلاق صفقة
• اغلاق الكل  /closeall — إغلاق جميع الصفقات
• ايقاف  /pause — إيقاف فتح صفقات جديدة (يستمر بإدارة المفتوحة)
• تشغيل  /resume — استئناف التداول
• لونج فقط | شورت فقط | الاتجاهين  /mode long|short|both
• الصفقات  /trades — آخر الصفقات المغلقة
• مساعدة  /help"""


@dataclass
class Command:
    name: str
    arg: Optional[str] = None


_AR_NORMALIZE = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ة": "ه", "ى": "ي"})

_PATTERNS: list[tuple[str, str]] = [
    (r"^(/?help|مساعده|مساعدة|الاوامر|اوامر)$", "help"),
    (r"^(/?status|الحاله|حاله|وضع|الوضع)$", "status"),
    (r"^(/?balance|الرصيد|رصيد)$", "balance"),
    (r"^(/?trades|الصفقات|صفقات|السجل)$", "trades"),
    (r"^(/?pause|/?stop|ايقاف|توقف|وقف)$", "pause"),
    (r"^(/?resume|/?start|تشغيل|استئناف|ابدا)$", "resume"),
    (r"^(/?closeall|close all|اغلاق الكل|اقفل الكل|سكر الكل)$", "closeall"),
    (r"^(لونج فقط|شراء فقط|long only)$", "mode:long"),
    (r"^(شورت فقط|بيع فقط|short only)$", "mode:short"),
    (r"^(الاتجاهين|لونج وشورت|both)$", "mode:both"),
]

_ARG_PATTERNS: list[tuple[str, str]] = [
    (r"^(/?long|لونج|شراء|اشتري)\s+(\S+)$", "long"),
    (r"^(/?short|شورت|بيع|بع)\s+(\S+)$", "short"),
    (r"^(/?close|اغلاق|اقفل|سكر)\s+(\S+)$", "close"),
    (r"^(/?analyze|/?analyse|تحليل|حلل)\s+(\S+)$", "analyze"),
    (r"^(/?mode|وضع)\s+(long|short|both)$", "mode"),
]


def parse(text: str) -> Optional[Command]:
    if not text:
        return None
    t = text.strip().translate(_AR_NORMALIZE)
    t = re.sub(r"@\w+", "", t)  # strip /cmd@BotName
    t = re.sub(r"\s+", " ", t).strip()
    low = t.lower()
    for pat, name in _PATTERNS:
        if re.match(pat, low):
            if name.startswith("mode:"):
                return Command("mode", name.split(":", 1)[1])
            return Command(name)
    for pat, name in _ARG_PATTERNS:
        m = re.match(pat, low)
        if m:
            return Command(name, m.group(2))
    return None
