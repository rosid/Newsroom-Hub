#!/usr/bin/env bash
# Uji UNGGAHAN LANGSUNG KE STORAGE (pre-signed URL) pada SALINAN database di /tmp.
#
# Dua mock S3 (HTTPS, seperti penyedia sungguhan) dijalankan sekaligus:
#   - port $S3_OK  dengan CORS aktif  → unggahan langsung harus berhasil (tanpa lewat server)
#   - port $S3_BAD tanpa CORS         → unggahan langsung diblokir browser, aplikasi harus
#                                       mundur ke jalur lewat server dan tetap berhasil
#
# HTTPS dipakai karena CSP aplikasi hanya mengizinkan koneksi browser ke https:
# (persis seperti BunnyCDN/S3 sungguhan). Sertifikat uji dibuat sekali di sini dan
# dipercaya HANYA oleh proses uji (NODE_EXTRA_CA_CERTS) serta browser uji
# (ignoreHTTPSErrors) — bukan oleh sistem.
#
#   bash scripts/run-presign-check.sh [APP_PORT] [S3_OK_PORT] [S3_BAD_PORT]
set -u
cd "$(dirname "$0")/.." || exit 1
APP_PORT="${1:-3992}"
S3_OK="${2:-9100}"
S3_BAD="${3:-9101}"
TESTSRC=/tmp/newsroom-presign
TESTDB="$TESTSRC/newsroom.db"
S3ROOT_OK="$TESTSRC/s3-ok"
S3ROOT_BAD="$TESTSRC/s3-bad"
CERT="$TESTSRC/tls/cert.pem"
KEY="$TESTSRC/tls/key.pem"

rm -rf "$TESTSRC"
mkdir -p "$TESTSRC/tls"
cp prisma/newsroom.db "$TESTDB" || { echo "gagal menyalin database"; exit 1; }
echo "DB uji: $TESTDB"
rm -rf .next/cache/fetch-cache

# Sertifikat uji untuk mock S3 (SAN IP 127.0.0.1, sekaligus berperan sebagai CA).
openssl req -x509 -newkey rsa:2048 -nodes -days 2 \
  -keyout "$KEY" -out "$CERT" \
  -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1" -addext "basicConstraints=critical,CA:TRUE" \
  >/dev/null 2>&1 || { echo "gagal membuat sertifikat uji (openssl)"; exit 1; }
echo "Sertifikat uji: $CERT"

# WAJIB: mulai dari penyimpanan lokal agar salinan DB tidak membawa kredensial
# storage PRODUKSI pengguna (uji ini mengarahkannya ke mock S3 lokal).
export DATABASE_URL="file:$TESTDB"
export MEDIA_UPLOAD_DIR="$TESTSRC/uploads"
npx tsx scripts/test-db-prepare.ts || exit 1

TLS_CERT="$CERT" TLS_KEY="$KEY" CORS=on node scripts/s3-mock.mjs "$S3_OK" "$S3ROOT_OK" > /tmp/newsroom-s3-ok.log 2>&1 &
MOCK_OK=$!
TLS_CERT="$CERT" TLS_KEY="$KEY" CORS=off node scripts/s3-mock.mjs "$S3_BAD" "$S3ROOT_BAD" > /tmp/newsroom-s3-bad.log 2>&1 &
MOCK_BAD=$!
# NODE_EXTRA_CA_CERTS: proses aplikasi (SDK S3) memercayai sertifikat mock uji ini.
DATABASE_URL="file:$TESTDB" MEDIA_UPLOAD_DIR="$TESTSRC/uploads" NODE_EXTRA_CA_CERTS="$CERT" \
  NODE_ENV=production COOKIE_SECURE=false PORT="$APP_PORT" node server.js > /tmp/newsroom-presign-server.log 2>&1 &
SRV=$!
trap 'kill $MOCK_OK $MOCK_BAD $SRV 2>/dev/null' EXIT

for i in $(seq 1 60); do
  ok_app=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$APP_PORT/newsroom-hub/login")
  ok1=$(curl -sk -o /dev/null -w "%{http_code}" "https://127.0.0.1:$S3_OK/__stats")
  ok2=$(curl -sk -o /dev/null -w "%{http_code}" "https://127.0.0.1:$S3_BAD/__stats")
  if [ "$ok_app" = "200" ] && [ "$ok1" = "200" ] && [ "$ok2" = "200" ]; then echo "server siap setelah ${i}s"; break; fi
  sleep 1
done

# Penjaga: pastikan aplikasi benar-benar dalam mode lokal sebelum uji berjalan.
BASE_URL="http://localhost:$APP_PORT/newsroom-hub" node scripts/assert-test-storage.mjs || exit 1

BASE_URL="http://localhost:$APP_PORT/newsroom-hub" S3_OK="$S3_OK" S3_BAD="$S3_BAD" node scripts/presign-check.mjs
STATUS=$?

echo "--- error pada log server aplikasi ---"
grep -iE "error|unhandled|exception" /tmp/newsroom-presign-server.log | head -8 || true
echo "--- objek di mock S3 (CORS aktif) ---"
find "$S3ROOT_OK" -type f | sed "s|$S3ROOT_OK|s3-ok:|" | head -10
echo "--- objek di mock S3 (tanpa CORS) ---"
find "$S3ROOT_BAD" -type f | sed "s|$S3ROOT_BAD|s3-bad:|" | head -10

exit $STATUS
