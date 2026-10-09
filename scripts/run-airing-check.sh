#!/usr/bin/env bash
# Uji fitur TAYANG ONAIR & MEDSOS + laporan kanal tayang, memakai SALINAN DB di /tmp.
#
#   bash scripts/run-airing-check.sh [PORT]
set -u
cd "$(dirname "$0")/.." || exit 1
PORT="${1:-3964}"
TESTSRC=/tmp/newsroom-airing
TESTDB="$TESTSRC/newsroom.db"

rm -rf "$TESTSRC"
mkdir -p "$TESTSRC"
cp prisma/newsroom.db "$TESTDB" || { echo "gagal menyalin database"; exit 1; }
echo "DB uji: $TESTDB"
rm -rf .next/cache/fetch-cache
export DATABASE_URL="file:$TESTDB"
export MEDIA_UPLOAD_DIR="$TESTSRC/uploads"
npx tsx scripts/test-db-prepare.ts || exit 1

echo "=== Uji unit tayang (izin + agregasi laporan) ==="
npx tsx scripts/airing-unit.ts || exit 1

export BASE_URL="http://localhost:$PORT/newsroom-hub"
NODE_ENV=production COOKIE_SECURE=false PORT="$PORT" node server.js > /tmp/newsroom-airing-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT

for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/login")
  if [ "$code" = "200" ]; then echo "server siap setelah ${i}s"; break; fi
  sleep 1
done

grep -i "kolom\|skema" /tmp/newsroom-airing-server.log | head -4 || true
BASE_URL="$BASE_URL" node scripts/assert-test-storage.mjs || exit 1

node scripts/airing-check.mjs
STATUS=$?

echo "--- error pada log server ---"
grep -iE "error|unhandled|exception" /tmp/newsroom-airing-server.log | head -8 || true

exit $STATUS
