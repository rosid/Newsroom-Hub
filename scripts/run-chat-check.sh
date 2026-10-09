#!/usr/bin/env bash
# Uji fitur chat (klaster, teks/emoticon, edit 60 detik, tanpa hapus) pada SALINAN DB di /tmp.
#
#   bash scripts/run-chat-check.sh [PORT]
set -u
cd "$(dirname "$0")/.." || exit 1
PORT="${1:-3975}"
TESTSRC=/tmp/newsroom-chat
TESTDB="$TESTSRC/newsroom.db"

rm -rf "$TESTSRC"
mkdir -p "$TESTSRC"
cp prisma/newsroom.db "$TESTDB" || { echo "gagal menyalin database"; exit 1; }
echo "DB uji: $TESTDB"
rm -rf .next/cache/fetch-cache
export DATABASE_URL="file:$TESTDB"
export MEDIA_UPLOAD_DIR="$TESTSRC/uploads"
npx tsx scripts/test-db-prepare.ts || exit 1

echo "=== Uji unit aturan chat ==="
npx tsx scripts/chat-unit.ts || exit 1

echo "=== Fixture chat (tabel + akun koordinator + pesan lama) ==="
npx tsx scripts/chat-fixture.ts seed || exit 1

export BASE_URL="http://localhost:$PORT/newsroom-hub"
NODE_ENV=production COOKIE_SECURE=false PORT="$PORT" node server.js > /tmp/newsroom-chat-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT

for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/login")
  if [ "$code" = "200" ]; then echo "server siap setelah ${i}s"; break; fi
  sleep 1
done

grep -i "tabel chat" /tmp/newsroom-chat-server.log | head -2 || true
BASE_URL="$BASE_URL" node scripts/assert-test-storage.mjs || exit 1

node scripts/chat-check.mjs
STATUS=$?

echo "--- error pada log server ---"
grep -iE "error|unhandled|exception" /tmp/newsroom-chat-server.log | head -8 || true

exit $STATUS
