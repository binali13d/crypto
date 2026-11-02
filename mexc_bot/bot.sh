#!/usr/bin/env bash
# =====================================================================
#  أداة تثبيت وتشغيل بوت MEXC — لسيرفر Ubuntu (VPS)
#  الاستخدام:
#    ./bot.sh install   تثبيت كل شيء وإدخال المفاتيح وتشغيل البوت
#    ./bot.sh logs      مشاهدة ما يفعله البوت الآن (Ctrl+C للخروج)
#    ./bot.sh status    هل البوت يعمل؟
#    ./bot.sh stop      إيقاف البوت
#    ./bot.sh start     تشغيل البوت
#    ./bot.sh restart   إعادة تشغيل البوت
#    ./bot.sh live      التحويل للتداول الحقيقي (بعد نجاح التجربة)
#    ./bot.sh paper     الرجوع للتداول التجريبي
#    ./bot.sh keys      تغيير المفاتيح
#    ./bot.sh update    تحديث البوت لآخر نسخة
#    ./bot.sh trades    عرض الصفقات المغلقة
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")"

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }

compose() {
  if $SUDO docker compose version >/dev/null 2>&1; then $SUDO docker compose "$@"
  else $SUDO docker-compose "$@"; fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then green "✔ Docker مثبت مسبقاً"; return; fi
  yellow "… جاري تثبيت Docker (قد يأخذ دقيقتين)"
  $SUDO apt-get update -y
  if ! $SUDO apt-get install -y docker.io docker-compose-v2; then
    $SUDO apt-get install -y docker.io docker-compose
  fi
  $SUDO systemctl enable --now docker
  green "✔ تم تثبيت Docker"
}

set_env() {  # set_env KEY VALUE
  local k="$1" v="$2"
  touch .env
  if grep -q "^${k}=" .env; then
    python3 - "$k" "$v" <<'PY'
import sys, re
k, v = sys.argv[1], sys.argv[2]
s = open(".env", encoding="utf-8").read()
s = re.sub(rf"^{re.escape(k)}=.*$", lambda m: f"{k}={v}", s, flags=re.M)
open(".env", "w", encoding="utf-8").write(s)
PY
  else
    echo "${k}=${v}" >> .env
  fi
  chmod 600 .env
}

ask_keys() {
  echo
  green "=== مفاتيح MEXC (من: الحساب ← إدارة API) ==="
  read -r -p "الصق API Key (Access Key): " k
  read -r -s -p "الصق Secret Key (لن يظهر أثناء اللصق): " s; echo
  set_env MEXC_API_KEY "$k"
  set_env MEXC_API_SECRET "$s"
  echo
  green "=== تيليجرام (اختياري — اضغط Enter للتخطي) ==="
  read -r -p "توكن البوت من @BotFather: " t
  read -r -p "رقمك (chat id) من @userinfobot: " c
  set_env TELEGRAM_BOT_TOKEN "$t"
  set_env TELEGRAM_CHAT_ID "$c"
}

set_paper_balance() {
  read -r -p "كم الرصيد الوهمي للتجربة بالدولار؟ [100]: " b
  b="${b:-100}"
  sed -i -E "s/^(  start_balance:).*/\1 ${b}/" config.yaml
}

case "${1:-help}" in
  install)
    install_docker
    [ -f .env ] || cp .env.example .env
    ask_keys
    set_env BOT_MODE paper
    set_paper_balance
    mkdir -p data logs
    compose up -d --build
    echo
    green "✅ البوت يعمل الآن بالوضع التجريبي (أموال وهمية)."
    echo "شاهد ما يفعله:   ./bot.sh logs"
    echo "بعد أسبوعين من التجربة إذا أعجبتك النتائج:   ./bot.sh live"
    ;;
  logs)    compose logs -f --tail 100 ;;
  status)  compose ps ;;
  stop)    compose stop; green "⏹ تم إيقاف البوت" ;;
  start)   compose up -d; green "▶ البوت يعمل" ;;
  restart) compose up -d --build --force-recreate; green "🔄 تمت إعادة التشغيل" ;;
  keys)    ask_keys; compose up -d --force-recreate; green "✔ تم تحديث المفاتيح" ;;
  live)
    red "⚠️  سيتم التداول بأموال حقيقية من حساب العقود في MEXC."
    red "    الخسارة ممكنة، ولا يوجد ربح مضمون."
    read -r -p "اكتب كلمة  نعم  للتأكيد: " ok
    if [ "$ok" != "نعم" ] && [ "$ok" != "yes" ]; then echo "تم الإلغاء."; exit 0; fi
    grep -q "^MEXC_API_KEY=." .env || { red "لا توجد مفاتيح MEXC. شغّل: ./bot.sh keys"; exit 1; }
    set_env BOT_MODE live
    compose up -d --force-recreate
    green "🚀 البوت يعمل الآن بالتداول الحقيقي. راقبه:  ./bot.sh logs"
    ;;
  paper)
    set_env BOT_MODE paper
    compose up -d --force-recreate
    green "🧪 رجع البوت للوضع التجريبي"
    ;;
  update)
    git pull --ff-only
    compose up -d --build --force-recreate
    green "✔ تم التحديث"
    ;;
  trades)
    if [ -f data/trades.csv ]; then column -s, -t < data/trades.csv | tail -30; else echo "لا توجد صفقات مغلقة بعد."; fi
    ;;
  *)
    sed -n '3,17p' "$0"
    ;;
esac
