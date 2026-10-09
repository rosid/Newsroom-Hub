#!/usr/bin/env bash
# Uji: Produser Daerah dapat membuat/mengelola akun Reporter Daerah & Magang pada biro sendiri
# (beserta batasannya) memakai SALINAN DB di /tmp.
#
#   bash scripts/run-bureau-user-check.sh [PORT]
set -u
cd "$(dirname "$0")/.." || exit 1
PORT="${1:-3966}"
TESTSRC=/tmp/newsroom-bureau
TESTDB="$TESTSRC/newsroom.db"

rm -rf "$TESTSRC"
mkdir -p "$TESTSRC"
cp prisma/newsroom.db "$TESTDB" || { echo "gagal menyalin database"; exit 1; }
echo "DB uji: $TESTDB"
rm -rf .next/cache/fetch-cache
export DATABASE_URL="file:$TESTDB"
export MEDIA_UPLOAD_DIR="$TESTSRC/uploads"
npx tsx scripts/test-db-prepare.ts || exit 1

echo "=== Uji unit aturan izin akun biro ==="
npx tsx scripts/bureau-user-unit.ts || exit 1

echo "=== Uji unit penjaga perubahan akun (memakai data salinan DB) ==="
npx tsx scripts/account-guard-unit.ts || exit 1

export BASE_URL="http://localhost:$PORT/newsroom-hub"
NODE_ENV=production COOKIE_SECURE=false PORT="$PORT" node server.js > /tmp/newsroom-bureau-server.log 2>&1 &
SRV=$!
# PENTING (perbaikan audit Okt 2026): cache Setting di .next/cache/fetch-cache IKUT
# ter-publish. Uji ini memakai SALINAN DB (yang Setting-nya sengaja diubah), jadi bila
# cache dibiarkan, aplikasi LIVE sempat memakai Setting dari DB UJI (pernah terjadi:
# halaman lupa-password menganggap email "sudah dikonfigurasi"). Karena itu cache
# dibersihkan lagi saat keluar.
trap 'kill $SRV 2>/dev/null; rm -rf .next/cache/fetch-cache' EXIT

for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/login")
  if [ "$code" = "200" ]; then echo "server siap setelah ${i}s"; break; fi
  sleep 1
done

BASE_URL="$BASE_URL" node scripts/assert-test-storage.mjs || exit 1

node scripts/bureau-user-check.mjs
STATUS=$?

echo "--- error pada log server ---"
grep -iE "error|unhandled|exception" /tmp/newsroom-bureau-server.log | head -8 || true

exit $STATUS
