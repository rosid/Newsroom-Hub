#!/usr/bin/env bash
# Jalankan seluruh uji otomatis pada SALINAN database di /tmp (tidak menyentuh
# database aplikasi — penting karena DB live bersifat read-only setelah publish):
#   1) scripts/smoke.mjs        — 66 pemeriksaan alur utama
#   2) scripts/cards-check.mjs  — 16 pemeriksaan tampilan kartu & load more
#
#   bash scripts/run-smoke.sh [PORT]
set -u
cd "$(dirname "$0")/.." || exit 1
PORT="${1:-3998}"
TESTSRC=/tmp/newsroom-smoke
TESTDB="$TESTSRC/newsroom.db"

mkdir -p "$TESTSRC"
cp prisma/newsroom.db "$TESTDB" || { echo "gagal menyalin database"; exit 1; }
echo "DB uji: $TESTDB"
# Bersihkan cache settings di disk agar proses uji tidak membaca nilai lama
rm -rf .next/cache/fetch-cache
# WAJIB: paksa storage lokal agar uji tidak menulis ke storage produksi pengguna
export DATABASE_URL="file:$TESTDB"
# Folder unggahan terpisah agar tidak mengotori uploads/ aplikasi
export MEDIA_UPLOAD_DIR="$TESTSRC/uploads"
npx tsx scripts/test-db-prepare.ts || exit 1

export BASE_URL="http://localhost:$PORT/newsroom-hub"
# data uji tambahan supaya paginasi "muat 20 kartu lagi" benar-benar teruji
npx tsx scripts/cards-fixture.ts seed 22 || exit 1

NODE_ENV=production COOKIE_SECURE=false PORT="$PORT" node server.js > /tmp/newsroom-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT

for i in $(seq 1 45); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/login")
  if [ "$code" = "200" ]; then echo "server siap setelah ${i}s"; break; fi
  sleep 1
done

# Penjaga: pastikan aplikasi melihat PENYIMPANAN LOKAL sebelum uji tulis dijalankan,
# agar uji tidak pernah menulis ke storage produksi pengguna.
BASE_URL="$BASE_URL" node scripts/assert-test-storage.mjs || exit 1

node scripts/smoke.mjs
SMOKE=$?

echo
node scripts/cards-check.mjs
CARDS=$?

echo "--- error pada log server ---"
grep -iE "error|unhandled|exception" /tmp/newsroom-server.log | head -8 || true

npx tsx scripts/cards-fixture.ts clean >/dev/null 2>&1 || true

echo
echo "smoke.mjs exit=$SMOKE ; cards-check.mjs exit=$CARDS"
[ "$SMOKE" = "0" ] && [ "$CARDS" = "0" ]
