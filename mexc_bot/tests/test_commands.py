from bot.commands import parse


def c(t):
    x = parse(t)
    return (x.name, x.arg) if x else None


def test_arabic_and_english():
    assert c("الحالة") == ("status", None)
    assert c("/status") == ("status", None)
    assert c("لونج BTC") == ("long", "btc")
    assert c("شراء eth") == ("long", "eth")
    assert c("شورت SOL") == ("short", "sol")
    assert c("/short@MyBot SOL") == ("short", "sol")
    assert c("إغلاق الكل") == ("closeall", None)
    assert c("اغلاق BTC") == ("close", "btc")
    assert c("ايقاف") == ("pause", None)
    assert c("تشغيل") == ("resume", None)
    assert c("لونج فقط") == ("mode", "long")
    assert c("بيع فقط") == ("mode", "short")
    assert c("/mode both") == ("mode", "both")
    assert c("تحليل btc") == ("analyze", "btc")
    assert c("كلام عشوائي") is None
