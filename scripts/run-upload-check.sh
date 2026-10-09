#!/usr/bin/env bash
# Uji unggah lampiran: PROGRES + BANYAK footage sekaligus (jaringan di-throttle lewat CDP).
# Memakai SALINAN database di /tmp dengan storage dipaksa lokal (tidak menyentuh produksi).
#
#   bash scripts/run-upload-check.sh [PORT]
set -u
cd "$(dirname "$0")/.." || exit 1
PORT="${1:-3977}"
TESTSRC=/tmp/newsroom-upload
TESTDB="$TESTSRC/newsroom.db"

rm -rf "$TESTSRC"
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
NODE_ENV=production COOKIE_SECURE=false PORT="$PORT" node server.js > /tmp/newsroom-upload-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT

for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/login")
  if [ "$code" = "200" ]; then echo "server siap setelah ${i}s"; break; fi
  sleep 1
done

BASE_URL="$BASE_URL" node scripts/assert-test-storage.mjs || exit 1

node scripts/upload-check.mjs
STATUS=$?

echo "--- error pada log server ---"
grep -iE "error|unhandled|exception" /tmp/newsroom-upload-server.log | head -8 || true

exit $STATUS
