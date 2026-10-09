#!/usr/bin/env bash
# Uji tampilan kartu tabulasi (grid 4 kolom + muat 20 kartu lagi) pada SALINAN
# database di /tmp — tidak menyentuh database aplikasi. Semua langkah dijalankan
# dalam satu proses karena /tmp tidak persisten antar perintah.
#
#   bash scripts/run-cards-check.sh [PORT]
set -u
cd "$(dirname "$0")/.." || exit 1
PORT="${1:-3995}"
TESTSRC=/tmp/newsroom-cards
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

npx tsx scripts/cards-fixture.ts seed 22 || exit 1

NODE_ENV=production COOKIE_SECURE=false PORT="$PORT" node server.js > /tmp/newsroom-cards-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT

for i in $(seq 1 45); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/newsroom-hub/login")
  if [ "$code" = "200" ]; then echo "server siap setelah ${i}s"; break; fi
  sleep 1
done

export BASE_URL="http://localhost:$PORT/newsroom-hub"
# Penjaga: pastikan aplikasi melihat PENYIMPANAN LOKAL sebelum uji tulis dijalankan.
node scripts/assert-test-storage.mjs || exit 1

node scripts/cards-check.mjs
STATUS=$?

echo "--- error pada log server ---"
grep -iE "error|unhandled|exception" /tmp/newsroom-cards-server.log | head -8 || true

npx tsx scripts/cards-fixture.ts clean || true
exit $STATUS
