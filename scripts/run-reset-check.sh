#!/usr/bin/env bash
# Uji fitur LUPA KATA SANDI + PENGATURAN EMAIL pada SALINAN DB di /tmp.
# Menjalankan SMTP tiruan (scripts/smtp-mock.mjs) sebagai kotak surat pengujian.
#
#   bash scripts/run-reset-check.sh [PORT] [SMTP_PORT] [MAIL_HTTP_PORT]
set -u
cd "$(dirname "$0")/.." || exit 1
PORT="${1:-3967}"
SMTP_PORT="${2:-2527}"
MAIL_HTTP_PORT="${3:-2528}"
TESTSRC=/tmp/newsroom-reset
TESTDB="$TESTSRC/newsroom.db"

rm -rf "$TESTSRC"
mkdir -p "$TESTSRC"
cp prisma/newsroom.db "$TESTDB" || { echo "gagal menyalin database"; exit 1; }
echo "DB uji: $TESTDB"
rm -rf .next/cache/fetch-cache
export DATABASE_URL="file:$TESTDB"
export MEDIA_UPLOAD_DIR="$TESTSRC/uploads"
npx tsx scripts/test-db-prepare.ts || exit 1

echo "=== Uji unit token reset & pengaturan email ==="
npx tsx scripts/reset-unit.ts || exit 1

node scripts/smtp-mock.mjs "$SMTP_PORT" "$MAIL_HTTP_PORT" > /tmp/newsroom-smtp-mock.log 2>&1 &
MOCK=$!
NODE_ENV=production COOKIE_SECURE=false PORT="$PORT" node server.js > /tmp/newsroom-reset-server.log 2>&1 &
SRV=$!
trap 'kill $MOCK $SRV 2>/dev/null' EXIT

for i in $(seq 1 60); do
  app=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/newsroom-hub/login")
  box=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$MAIL_HTTP_PORT/__messages")
  if [ "$app" = "200" ] && [ "$box" = "200" ]; then echo "server siap setelah ${i}s"; break; fi
  sleep 1
done

# Penjaga: pastikan tabel PasswordReset dibuat oleh ensureSchema() saat boot
grep -i "skema siap" /tmp/newsroom-reset-server.log | head -2 || true

BASE_URL="http://localhost:$PORT/newsroom-hub" node scripts/assert-test-storage.mjs || exit 1

BASE_URL="http://localhost:$PORT/newsroom-hub" \
SMTP_PORT="$SMTP_PORT" \
MAIL_BOX="http://127.0.0.1:$MAIL_HTTP_PORT" \
  node scripts/password-reset-check.mjs
STATUS=$?

echo "--- error pada log server ---"
grep -iE "error|unhandled|exception|ENOENT" /tmp/newsroom-reset-server.log | grep -viE "PASSWORD_RESET_REQUEST_MAIL_FAILED|gagal kirim email" | head -8 || true

exit $STATUS
