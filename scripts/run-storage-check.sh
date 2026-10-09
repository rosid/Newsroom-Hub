#!/usr/bin/env bash
# Uji integrasi Storage S3-compatible secara end-to-end di SALINAN database (/tmp):
#   - mock server S3 (tanpa dependensi eksternal)
#   - server aplikasi produksi
#   - Playwright: konfigurasi dari UI → uji koneksi → unggah ke S3 → hapus → kembali lokal
#
#   bash scripts/run-storage-check.sh [APP_PORT] [S3_PORT]
set -u
cd "$(dirname "$0")/.." || exit 1
APP_PORT="${1:-3991}"
S3_PORT="${2:-9100}"
TESTSRC=/tmp/newsroom-storage
TESTDB="$TESTSRC/newsroom.db"
S3ROOT="$TESTSRC/s3"

rm -rf "$TESTSRC"
mkdir -p "$TESTSRC"
cp prisma/newsroom.db "$TESTDB" || { echo "gagal menyalin database"; exit 1; }
echo "DB uji: $TESTDB"
# Bersihkan cache settings di disk agar proses uji tidak membaca nilai lama
rm -rf .next/cache/fetch-cache
# WAJIB: reset storage ke lokal lebih dulu agar salinan DB tidak membawa kredensial
# storage PRODUKSI pengguna (uji ini nanti mengarahkannya ke mock S3 lokal).
export DATABASE_URL="file:$TESTDB"
# Folder unggahan terpisah agar tidak mengotori uploads/ aplikasi
export MEDIA_UPLOAD_DIR="$TESTSRC/uploads"
npx tsx scripts/test-db-prepare.ts || exit 1

node scripts/s3-mock.mjs "$S3_PORT" "$S3ROOT" > /tmp/newsroom-s3mock.log 2>&1 &
MOCK=$!
DATABASE_URL="file:$TESTDB" MEDIA_UPLOAD_DIR="$TESTSRC/uploads" NODE_ENV=production COOKIE_SECURE=false PORT="$APP_PORT" node server.js > /tmp/newsroom-storage-server.log 2>&1 &
SRV=$!
# PENTING (perbaikan audit Okt 2026): cache Setting di .next/cache/fetch-cache IKUT
# ter-publish. Uji ini memakai SALINAN DB (yang Setting-nya sengaja diubah), jadi bila
# cache dibiarkan, aplikasi LIVE sempat memakai Setting dari DB UJI (pernah terjadi:
# halaman lupa-password menganggap email "sudah dikonfigurasi"). Karena itu cache
# dibersihkan lagi saat keluar.
trap 'kill $MOCK $SRV 2>/dev/null; rm -rf .next/cache/fetch-cache' EXIT

for i in $(seq 1 60); do
  ok_app=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$APP_PORT/newsroom-hub/login")
  ok_s3=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$S3_PORT/__stats")
  if [ "$ok_app" = "200" ] && [ "$ok_s3" = "200" ]; then echo "server siap setelah ${i}s"; break; fi
  sleep 1
done

# Penjaga: sebelum uji ini beralih ke mock S3, pastikan titik awalnya lokal.
BASE_URL="http://localhost:$APP_PORT/newsroom-hub" node scripts/assert-test-storage.mjs || exit 1

BASE_URL="http://localhost:$APP_PORT/newsroom-hub" S3_PORT="$S3_PORT" node scripts/storage-check.mjs
STATUS=$?

echo "--- error pada log server aplikasi ---"
grep -iE "error|unhandled|exception" /tmp/newsroom-storage-server.log | head -8 || true
echo "--- ringkasan objek di mock S3 ---"
find "$S3ROOT" -type f | sed "s|$S3ROOT|s3:|" | head -10

exit $STATUS
