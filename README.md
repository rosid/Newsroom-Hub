# GarudaTV Newsroom Hub

Aplikasi web newsroom untuk pengiriman berita reporter **Pusat** dan **Biro Daerah (Network)**,
dengan pemisahan tegas antara **Pool Tabulasi Pusat** dan **Pool Tabulasi Daerah**.

- Stack: **Next.js 15 (App Router) + TypeScript + Tailwind v4 + Prisma (SQLite) + iron-session + Zod**
- Peta: **Leaflet + OpenStreetMap** (geo-tagging reporter)
- Grafik laporan: **Recharts**
- Storage footage/gambar: **abstraksi driver** — `local` (disk server) atau `bunny` (BunnyCDN S3-compatible)

---

## 1. Peran & Aturan Akses Data (inti sistem)

| Role | Kirim berita | Tabulasi Daerah | Tabulasi Pusat | Validasi | Dorong ke Pusat | Siarkan | Master |
|---|---|---|---|---|---|---|---|
| Super Admin | ✅ | semua biro | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin Redaksi | ✅ | semua biro | ✅ | ✅ | ✅ | ✅ | ✅ |
| Redaktur | ✅ | ✖ | ✅ + dorongan | ✅ | ✅ | ✅ | – |
| Produser Pusat | ✅ | ✖ | ✅ + dorongan | ✅ | ✅ | ✅ | – |
| Reporter Pusat | ✅ | ✖ | ✅ | ✖ | ✖ | ✖ | – |
| Produser Daerah | ✅ | biro sendiri | ✅ (terverifikasi) | ✅ (biro sendiri) | ✅ | ✅ (kanal daerah) | – |
| Reporter Daerah | ✅ | biro sendiri | ✅ (terverifikasi) | ✖ | ✖ | ✖ | – |
| Kontributor | ✅ | biro sendiri | ✅ (terverifikasi) | ✖ | ✖ | ✖ | – |
| Magang | ✅ | ✖ (hanya kiriman sendiri) | ✅ (terverifikasi) | ✖ | ✖ | ✖ | – |
| Koordinator Liputan | ✅ | ✖ | ✅ + dorongan | ✅ (pool pusat) | ✅ | ✅ | – |
| Koordinator Daerah | ✅ | ✖ | ✅ + dorongan | ✅ (pool pusat) | ✅ (berita daerah) | ✅ | – |

Aturan kunci:
1. **Produser/Reporter Pusat tidak melihat pool daerah sama sekali** — hanya pool pusat + berita daerah yang **didorong ke pusat**.
2. Setiap biro hanya melihat **tabulasi daerahnya sendiri** + tabulasi pusat (yang sudah terverifikasi/disiarkan).
3. Berita daerah yang dinilai layak siaran nasional dapat **“Dorong ke Pool Tabulasi Pusat”** oleh produser biro redaktur/admin.
4. Magang hanya melihat kiriman miliknya sendiri.

Alur status: `DRAFT → PENDING → VERIFIED → PUBLISHED` (plus `REVISION` dan `REJECTED`).

---

## 2. Fitur

- **Dashboard** — halaman ringkasan (statistik hari ini, kiriman terbaru, alur kerja, pengumuman, cakupan akses),
  tersedia sebagai menu pertama di sidebar semua role.
- **Tabulasi Berita** — tab Pusat / Daerah / Menunggu Persetujuan / Siaran Nasional / Kiriman Saya,
  **statistik ringkas** (Berita Hari Ini, Menunggu Persetujuan, Telah Disiarkan, Breaking News),
  **filter tanggal** (Hari Ini / 7 Hari / 30 Hari / Bulan Ini / Kustom / Semua) + filter status, kategori,
  jenis, provinsi, biro, dan pencarian; **ekspor CSV**.
- **Dua opsi tampilan tabulasi** (tombol Daftar / Kartu, filter tetap terbawa saat berganti tampilan):
  - **Daftar** — tabel padat ala ruang redaksi dengan pagination nomor.
  - **Kartu** — grid **4 kolom** (thumbnail giz/status, judul, ringkasan, lokasi + geo-tag, penulis, biro, waktu)
    dengan **paginasi “muat 20 kartu lagi”** (load more) lewat endpoint `/api/news/list` yang memakai aturan
    visibilitas pool yang sama, plus penghitung “Menampilkan X dari Y kartu berita”.
- **Kirim Berita** — Judul, Naskah (rich text editor), Kategori, Tag, **Berita Biasa / Breaking News**,
  Lokasi, Provinsi/Kota, **Geo-tagging** (klik peta / lokasi perangkat), simpan draft atau kirim ke produser.
- **Unggah lampiran footage/gambar dengan progres & bisa banyak berkas sekaligus**:
  pilih/drag & drop **beberapa footage sekaligus** → berkas masuk antrean dan diunggah berurutan,
  masing-masing dengan **bilah progres + persentase + jumlah byte terkirim**, indikator **progres keseluruhan**
  (“Mengunggah 2 berkas… 45%”, total MB), status per berkas (**Menunggu / Mengunggah / Selesai / Gagal**),
  tombol **Batal** saat mengunggah, **Ulangi** untuk yang gagal, dan hapus dari daftar.
  Selama masih ada unggahan berjalan tombol **Simpan Draft / Kirim ke Produser dinonaktifkan**
  (termasuk kirim lewat Enter) supaya lampiran tidak pernah tertinggal.
  Validasi jenis & ukuran dilakukan di browser sebelum mengunggah (pesan langsung, tanpa menunggu server).
- **Format Broadcast pada naskah** — panel shortcode di editor naskah: klik penanda untuk menyisipkannya
  langsung di posisi kursor, masing-masing di barisnya sendiri (`[ANCHOR ON CAM]`, `[ROLL TAPE / FOOTAGE]`,
  `[VO REPORTER]`, `[SOUNDBITE / SOT]`, `[STANDUP LIVE]`). Penanda tampil sebagai **chip berwarna** di editor,
  halaman detail berita, dan halaman ubah naskah.
- **Tayang Onair & Tayang Medsos** — penayangan berita dicatat **per kanal**: redaktur/produser menandai
  berita sudah **TAYANG ONAIR** (siaran TV, dengan opsi siaran nasional) dan/atau **TAYANG MEDSOS**
  (sosial media). Satu berita dapat tayang di kedua kanal, dan tiap kanal dapat ditarik terpisah.
- **Unduh materi & tautan berbagi tamu** — setiap footage/gambar dapat diunduh dengan nama berkas
  aslinya, dan dapat dibagikan ke pengguna **tamu tanpa akun** (mis. video editor) melalui tautan
  bertanda tangan dengan masa berlaku 1/7/30 hari (lihat bagian 5).
- **Peta Sebaran Berita** — titik geo-tagging dengan legenda status + filter (breaking, nasional, dorong pusat, status).
- **Ekspor CSV** pada **Tabulasi Berita** (sesuai filter aktif) dan **Laporan**
  (ringkasan, per status, per kategori, per biro, top reporter, tren harian). CSV berisi blok ringkasan +
  tabel data, dibuka langsung oleh Excel/Google Sheets — **hanya CSV**: format Excel (.xlsx) & PDF dihapus
  atas permintaan pemilik aplikasi untuk mengurangi beban VPS (lihat bagian 8).
- **Laporan** — tren kiriman harian, komposisi status, berita per kategori, produktivitas per biro,
  reporter terproduktif, ringkasan per biro, ekspor CSV per periode.
- **Chat klaster** (teks + emoticon) — percakapan pribadi sesuai klaster:
  (1) Reporter Daerah ↔ Produser Daerah **biro yang sama**, (2) Reporter Pusat ↔ Koordinator Liputan ↔ Produser Pusat,
  (3) Produser Daerah (semua biro) ↔ Koordinator Daerah. Badge belum dibaca di sidebar, pesan dapat
  **diedit maksimal 60 detik** setelah dikirim, **tidak dapat dihapus**, dan **tanpa unggah gambar/berkas**.
- **Pengumuman** — CRUD pengumuman + audiens (semua / pool / role / biro tertentu) + notifikasi lonceng.
- **Lupa kata sandi (reset via email)** — halaman publik `/lupa-password` → tautan
  sekali pakai dikirim ke email pengguna (berlaku 60 menit) → `/reset-password?token=…`.
  Pengiriman email diatur di **Pengaturan → Email & Notifikasi** (SMTP atau Resend/Brevo/SendGrid).
- **Akun Biro (Produser Daerah)** — Produser Daerah dapat **membuat & mengelola akun Reporter Daerah, Magang,
  dan Kontributor di biro-nya sendiri** dari halaman `Pengaturan → Akun Biro Saya` (tanpa perlu admin pusat).
- **Pengaturan** — Identitas & tampilan (nama, logo, lebar logo, warna tema + preset, tema bawaan),
  SEO, kebijakan editorial, **Biro Daerah**, **Kategori Berita**, **Pengguna & Hak Akses**,
  **Storage & Integrasi**, **Log Aktivitas (audit)**, serta **Akun & Profil** untuk semua role
  (profil + ganti sandi dengan indikator kekuatan).
- **Dark & Light Mode** + **lonceng notifikasi** di header.

---

## 3. Menjalankan

```bash
npm install
cp .env.example .env      # berisi DATABASE_URL="file:./newsroom.db", basePath, dan konfigurasi storage
npx prisma db push        # membuat prisma/newsroom.db
npm run db:seed           # data awal: kategori, 10 biro, 11 akun demo, 12 berita contoh
npm run dev               # http://localhost:3000/newsroom-hub  (basePath)
# produksi:
NEXT_PUBLIC_BASE_PATH=/newsroom-hub npm run build
NODE_ENV=production node server.js   # membaca process.env.PORT
```

> `NEXT_PUBLIC_BASE_PATH` **wajib** diisi `/newsroom-hub` (slug aplikasi) saat build, dan publikasi
> ke platform harus memakai `preserve_path_prefix: true` karena Next menangani prefix sendiri.

### Akun demo (sandi semua: `Demo123!`)

> ⚠️ **Kredensial demo — RAHASIA.** Daftar ini SENGAJA tidak ditampilkan lagi di halaman login
> (dulu panel "Akun demo" + sandi terisi otomatis di form login, sehingga siapa pun yang menemukan
> URL produksi bisa langsung masuk sebagai Super Admin). Berkas ini tidak disajikan ke publik
> (`/README.md` → 404), jadi inilah satu-satunya tempat daftar akun demo berada — **jangan**
> menyalinnya ke komponen UI, pesan bantuan, placeholder, atau tangkapan layar yang dibagikan.
>
> Sebelum dipakai untuk pemberitaan sungguhan, ganti sandi akun demo (khususnya
> `superadmin@` dan `admin@`) lewat **Akun & Profil → Ubah Sandi**, atau buat akun asli lalu
> nonaktifkan akun demo di **Pengaturan → Pengguna & Hak Akses**.

| Role | Email |
|---|---|
| Super Admin | superadmin@newsroom.demo |
| Admin Redaksi | admin@newsroom.demo |
| Redaktur | redaktur@newsroom.demo |
| Produser Pusat | produser.pusat@newsroom.demo |
| Reporter Pusat | reporter.pusat@newsroom.demo |
| Produser Biro Medan | produser.medan@newsroom.demo |
| Reporter Biro Medan | reporter.medan@newsroom.demo |
| Produser Biro Surabaya | produser.surabaya@newsroom.demo |
| Reporter Biro Surabaya | reporter.surabaya@newsroom.demo |
| Kontributor Bandung | kontributor.bandung@newsroom.demo |
| Magang Makassar | magang.makassar@newsroom.demo |

Akun tambahan dibuat oleh skrip fixture pengujian (`scripts/chat-fixture.ts`):
`koordinator.liputan@newsroom.demo`, `koordinator.daerah@newsroom.demo`, `produser.makassar@newsroom.demo`.

---

## 4. Storage footage & gambar (lokal atau S3-compatible)

Penyimpanan dapat diatur **dari aplikasi**: menu **Pengaturan → Storage & Integrasi**, tanpa mengubah kode.

- **Mode Lokal (server)** — berkas di folder `uploads/`, dilayani endpoint internal `/api/media/**`
  (mendukung HTTP Range sehingga video bisa di-seek). Cocok untuk pengembangan atau VPS berdisk besar.
- **Mode S3 Compatible (cloud/CDN)** — footage diunggah **LANGSUNG dari browser ke penyedia storage** memakai
  **pre-signed URL (SigV4)**, sehingga byte berkas tidak melewati server web; berkas disajikan lewat URL publik/CDN.
  Tersedia preset untuk **BunnyCDN Storage**, **Cloudflare R2**, **Amazon S3**, **DigitalOcean Spaces**, **Wasabi**,
  **Backblaze B2**, dan **S3-compatible lainnya (MinIO, Ceph, dsb.)**; endpoint/region juga bisa diisi manual.

Di halaman tersebut tersedia:

1. Pemilih mode (Lokal / S3 Compatible) + preset penyedia yang mengisi endpoint, region, dan path-style otomatis.
2. Kolom: endpoint, region, bucket (Bunny: *Storage Zone*), Access Key ID, Secret Access Key, URL publik/CDN,
   folder di dalam bucket (prefix), dan opsi **path-style addressing**.
3. Tombol **Jalankan Uji Koneksi** — menulis → membaca → menghapus satu objek uji memakai nilai form
   (sebelum disimpan), dengan pesan galat yang diterjemahkan (403 kredensial salah, 404 bucket, DNS, timeout).
4. **Status Storage Aktif** (mode, sumber konfigurasi, bucket/zone, access key ter-mask, secret tersimpan,
   **status unggahan langsung/pre-signed**), penggunaan media, dan tombol **Kembalikan ke Penyimpanan Lokal**.

### Unggahan langsung ke storage (pre-signed URL) — agar server web tidak terbebani

Bila mode **S3 Compatible** aktif dan kredensialnya lengkap, alur unggah lampiran menjadi:

1. Browser meminta URL bertanda tangan ke `POST /api/media/presign` (server hanya membuat tanda tangan SigV4,
   **berlaku 15 menit**, berisi bucket + key + prefix + `Content-Type` — tanpa menerima berkasnya).
2. Browser **PUT langsung ke storage** (progres per berkas tetap tampil karena memakai XHR
   `upload.onprogress`), jadi footage 300 MB tidak melewati server web sama sekali.
3. Browser melaporkan hasilnya ke `POST /api/media/confirm`. Server **memverifikasi objeknya lewat HEAD**
   (ukuran sebenarnya + keberadaannya), menolak key yang bukan buatan server, dan hanya setelah itu berkas
   dicatat sebagai lampiran berita.

Syarat agar jalur ini benar-benar terpakai (bila tidak terpenuhi, unggahan **otomatis mundur lewat server**
sehingga pengguna tidak pernah gagal mengunggah — hanya ada catatan kecil di daftar lampiran):

- **CORS pada storage zone/bucket**: izinkan metode `PUT` + header `Content-Type` dari origin aplikasi
  (mis. `https://rosid.vibecoder.co.id`). Tanpa CORS, browser memblokir preflight dan aplikasi memakai jalur server.
- **Endpoint storage memakai HTTPS** — CSP aplikasi (`connect-src 'self' https:`) hanya mengizinkan koneksi
  browser ke `https:`. Endpoint `http://` (mis. MinIO lokal) otomatis memakai jalur lewat server.
- **URL publik/CDN tetap disarankan** agar berkas dibaca langsung dari CDN, bukan diproksi server.

Catatan penting:

- **Secret Access Key disimpan terenkripsi (AES-256-GCM)**; kunci diturunkan dari `SESSION_SECRET` aplikasi
  (lihat `src/lib/secret.ts` + `src/lib/crypto.ts`). Bila `SESSION_SECRET` diganti, kredensial harus diisi ulang.
- Khusus **BunnyCDN**: Access Key ID = **nama Storage Zone**, Secret Access Key = **Access Key (password)** zone,
  dan endpoint mengikuti region zone (mis. `https://sg.storage.bunnycdn.com`). Path-style wajib aktif.
- URL publik/CDN harus **HTTPS** agar gambar & video dapat ditampilkan di browser (CSP aplikasi).
  Bila dikosongkan, berkas tetap dapat diunggah dan dilayani lewat server (`/api/media`, lebih lambat untuk footage besar).
- **Berkas lokal lama tetap dapat dibuka** setelah beralih ke S3 (endpoint `/api/media` memeriksa disk lebih dulu,
  lalu mengalihkan ke CDN/streaming S3).
- Batas unggah: gambar 25 MB, video/footage 300 MB, dokumen 50 MB per berkas, maksimal 40 lampiran per berita.
- Folder penyimpanan lokal dapat dipindah lewat env `MEDIA_UPLOAD_DIR` (default `./uploads`) — dipakai uji
  otomatis agar tidak menulis ke folder aplikasi.

Konfigurasi juga bisa diberikan lewat environment (untuk infra-as-code) — **Setting dari UI menang** bila sudah disimpan:

```env
# local (default) atau s3  (nilai lama "bunny" tetap diterima)
STORAGE_DRIVER=s3

# Contoh BunnyCDN Storage (S3 compatible)
S3_ENDPOINT=https://sg.storage.bunnycdn.com
S3_BUCKET=nama-storage-zone
S3_ACCESS_KEY_ID=nama-storage-zone
S3_SECRET_ACCESS_KEY=xxxxxxxx
S3_REGION=de
S3_PUBLIC_URL=https://nama-pull-zone.b-cdn.net
S3_PREFIX=newsroom
S3_FORCE_PATH_STYLE=true
```

## 5. Unduh materi & tautan berbagi untuk tamu

Setiap lampiran (footage/gambar/dokumen) pada halaman detail berita memiliki tombol:

- **Unduh** — mengunduh berkas dengan **nama berkas asli** (awalan UUID dibuang). Unduhan selalu
  dialirkan lewat server (`/api/media/<key>?download=1` + `Content-Disposition: attachment`), sehingga
  berlaku sama untuk berkas di penyimpanan lokal maupun di cloud (CDN tidak dipakai untuk unduhan).
- **Tautan tamu** — membuat tautan berbagi khusus berkas tersebut (berlaku 7 hari) lalu tersedia tombol
  **Salin tautan tamu**.

Selain itu di header bagian *Footage & Gambar* ada tombol **Bagikan ke Tamu** yang membuat satu tautan
untuk **semua lampiran berita** dengan pilihan masa berlaku **1 / 7 / 30 hari**, plus tombol
**Salin Tautan** dan **Buka Halaman Tamu**.

Tautan mengarah ke halaman publik `/share/<token>` (tanpa login): tamu melihat judul/ringkasan berita,
masa berlaku, pratinjau video/gambar, tombol **Lihat**, **Unduh**, dan **Salin tautan berkas**.

Cara kerja & batasannya:

- Token = `base64url(payload)` + **HMAC-SHA256** memakai secret aplikasi; payload memuat cakupan
  (`news` = semua lampiran satu berita, atau `media` = satu berkas) dan waktu kedaluwarsa. Tidak ada
  tabel baru di database.
- Token **terbatas cakupannya**: token berita hanya bisa mengakses berkas milik berita itu (berkas lain
  → HTTP 403), token berkas hanya berkas tersebut. Token yang dimanipulasi/kedaluwarsa ditolak
  (HTTP 401, halaman menampilkan “Tautan tidak berlaku lagi”).
- **Akses tamu selalu lewat server** (bukan pengalihan ke CDN), sehingga URL CDN permanen tidak
  terekspos ke tamu dan akses sepenuhnya dikendalikan masa berlaku token.
- Pengguna yang **sudah login** tetap dilayani langsung dari CDN (cepat).
- Pencabutan: satu-satunya cara mencabut tautan saat ini adalah **menunggu kedaluwarsa** (atau mengganti
  `SESSION_SECRET`, yang sekaligus menghapus kredensial storage tersimpan). Pencabutan per-tautan belum
  tersedia — jika dibutuhkan, ini dapat ditambahkan (daftar tautan dicabut + tombol “Batalkan tautan”).

## 6. Format Broadcast pada naskah

Editor naskah (form **Kirim Berita** dan halaman ubah naskah) memiliki panel **Format Broadcast** berisi
penanda rundown yang biasa dipakai reporter TV:

| Tombol | Teks yang disisipkan | Kapan dipakai |
|---|---|---|
| + ANCHOR ON CAM | `[ANCHOR ON CAM]` | Pembawa acara membaca naskah di kamera |
| + ROLL TAPE / FOOTAGE | `[ROLL TAPE / FOOTAGE]` | Gulirkan footage/gambar lampiran |
| + VO REPORTER | `[VO REPORTER]` | Suara reporter mengiringi gambar |
| + SOUNDBITE / SOT | `[SOUNDBITE / SOT]` | Kutipan narasumber |
| + STANDUP LIVE | `[STANDUP LIVE]` | Reporter berdiri di lokasi |

Cara pakai: letakkan kursor pada naskah → klik tombol penanda → shortcode masuk di posisi kursor sebagai
**baris tersendiri**, dan kursor otomatis pindah ke baris baru sehingga reporter bisa langsung melanjutkan
naskah.

Detail teknis yang penting:

- Penyisipan memakai **manipulasi DOM (Range)**, bukan `document.execCommand('insertParagraph')`. Pengujian
  membuktikan `execCommand` menghasilkan blok `<div>` dan penanda menempel pada teks sebelumnya saat editor
  masih berisi teks tanpa pembungkus blok.
- Paragraf kosong setelah penanda diberi `<br>` dan text node kosong sisa pemotongan dibuang. Tanpa ini
  Chromium mengetikkan naskah ke **dalam chip penanda** (pernah terjadi; kini ada pemeriksaan anti-regresi
  khusus untuk itu).
- Chip memakai kelas `bc-cue bc-cue-<jenis>` yang **diizinkan eksplisit** di `sanitize.ts`
  (`allowedClasses`) sehingga bertahan setelah naskah disimpan, sementara kelas asing lain tetap dibuang.
  Warna chip diatur di `globals.css` (satu warna per jenis penanda, terang & gelap).
- Penanda hanya untuk naskah berita; ditambahkan sebagai opsi `showCues` pada `RichTextEditor`.

## 7. Chat (teks + emoticon)

Chat adalah percakapan **pribadi** antar pengguna, dan relasinya bersifat **dua arah**
(bila A boleh menghubungi B, B juga boleh membalas A).

### Klaster utama

| Klaster | Anggota | Aturan |
|---|---|---|
| **1 · Biro Daerah** | Reporter Daerah ↔ Produser Daerah | **biro yang sama saja** (lintas biro ditolak, termasuk lewat API) |
| **2 · Pusat** | Reporter Pusat, Koordinator Liputan, Produser Pusat | saling chat |
| **3 · Koordinasi Daerah** | Produser Daerah (semua biro) ↔ Koordinator Daerah | lintas biro boleh |

### Penghubung / eskalasi

| Relasi | Keterangan |
|---|---|
| **Redaktur** ← Produser Pusat, Produser Daerah, Koordinator Liputan, Koordinator Daerah | Redaktur dapat dichat oleh keempat role tersebut |
| **Admin & Super Admin** ← Produser Pusat, Produser Daerah, Koordinator Liputan, Koordinator Daerah | idem, untuk eskalasi operasional |
| **Koordinator Liputan** ↔ Kontributor & Magang | pendampingan kontributor/magang |
| **Produser Daerah** ↔ **Magang** | hanya **biro yang sama** (magang tanpa biro tidak punya lawan chat di sini) |

Relasi di luar daftar di atas **ditolak** — termasuk pasangan yang tampak "wajar" seperti
Admin ↔ Redaktur atau Reporter Pusat ↔ Redaktur, karena tidak diminta.

### Batasan yang ditegakkan di server (bukan hanya tampilan)

- **Hanya teks & emoticon** — tidak ada unggah gambar/berkas; tag HTML dan data-URL gambar dibuang
  (`sanitizeChatText`) dan pesan dirender sebagai teks (bukan HTML), sehingga markup tidak bisa disisipkan.
  Panjang maksimal 2.000 karakter; tersedia pemilih emoticon di composer.
- **Edit maksimal 60 detik** setelah dikirim dan **hanya oleh pengirimnya** — server menolak (HTTP 403)
  bila lewat batas atau bukan pengirim; UI menampilkan sisa waktu lalu menyembunyikan tombol Edit, dan
  menandai "(diedit HH:MM)" pada pesan yang sudah diubah.
- **Tidak dapat dihapus** — tidak ada tombol hapus di UI dan **tidak ada endpoint DELETE** (dijawab HTTP 405).
- Pesan ditandai dibaca saat percakapan dibuka/di-polling; jumlah belum dibaca tampil sebagai badge pada
  menu **Chat**.

Dua role baru ditambahkan dan memiliki **hak akses berita setara Produser Pusat**:

- **Koordinator Liputan** — klaster pusat, pendamping Kontributor/Magang.
- **Koordinator Daerah** — klaster koordinasi daerah (juga boleh mendorong berita daerah ke Pool Pusat).

> Catatan: karena keduanya "setara Produser Pusat", cakupan tabulasi beritanya adalah pool pusat + berita
> yang didorong ke pusat (tanpa tab Tabulasi Daerah). Bila Koordinator Daerah perlu melihat tabulasi
> seluruh biro untuk mengoordinasikan network, itu perubahan kecil — sampaikan saja.

Tabel `Conversation` & `Message` dibuat otomatis saat aplikasi boot (`ensureChatSchema()` di `server.js`
membaca `prisma/chat-ddl.sql`) karena database produksi tidak dapat dimigrasi dari luar.

## 8. Ekspor CSV (hanya CSV)

Tersedia di dua tempat, satu format: **CSV** (`format=csv`).

| Halaman | Endpoint | Isi |
|---|---|---|
| Tabulasi Berita | `/api/export/news?format=csv&tab=…&range=…` | Blok ringkasan (jumlah berita, breaking, siaran nasional) + keterangan periode/cakupan + tabel berita sesuai filter aktif (22 kolom) |
| Laporan | `/api/export/report?format=csv&range=…&kanal=…` | Blok Ringkasan Laporan + rekap Kanal Tayang, Tayang per Kategori, Status, Kategori, Per Biro (dengan % tayang), Reporter (top 10), Tren Harian, dan daftar Berita Tayang — tiap blok dipisah baris kosong |

**CATATAN KEPUTUSAN — jangan dikembalikan tanpa diminta:** ekspor **Excel (.xlsx)** dan **PDF** DIHAPUS
atas permintaan pemilik aplikasi (mengurangi beban VPS). Alasannya: keduanya menarik `exceljs`/`pdfkit`,
merakit berkas besar di memori proses, dan menjadi burst CPU/RAM pada tiap permintaan — sementara hasilnya
sama-sama bisa dibuka dari CSV. Yang ikut dibersihkan: dependensi `exceljs`, `pdfkit`, `@types/pdfkit`, dan
`serverExternalPackages` di `next.config.js`. Permintaan `?format=xlsx` atau `?format=pdf` (mis. dari
bookmark lama) **tetap dilayani sebagai CSV**, bukan galat — perilaku ini diuji di `smoke:export` dan di live.

Detail implementasi:

- Penyusun baris & blok ada di `src/lib/export/data.ts` (satu tempat untuk daftar kolom), pembuat berkas di
  `src/lib/export/builders.ts` (`buildCsv` — string biasa, tanpa dependensi).
- CSV memakai pemisah `;` + kutip ganda (kebiasaan Excel/Indonesia) dan diawali BOM agar karakter
  non-ASCII tampil benar saat dibuka di Excel.
- **Semua tombol ekspor memakai `<a href>` biasa**, sehingga basePath WAJIB ditambahkan lewat `p()`
  (lihat `components/ui/ExportButtons.tsx`). Inilah penyebab bug “No webpage was found”: tautan lama
  menulis `/api/export/news` tanpa basePath sehingga diarahkan ke root domain (404) ketika aplikasi
  dipasang di subpath.
- Batas 5.000 baris per ekspor; ekspor tanpa sesi → 401, dan setiap ekspor tercatat di audit log
  (`EXPORT_NEWS_CSV`, `EXPORT_REPORT_CSV`).

## 9. Penayangan: Tayang Onair & Tayang Medsos

Kolom **Tindakan** pada halaman detail berita menampilkan tombol tayang (menggantikan “Siarkan Berita”):

| Tombol | Arti | Efek |
|---|---|---|
| **Tayang Onair** | Berita disiarkan di televisi | mencatat waktu tayang + opsi **Siaran nasional**; status → `Disiarkan` |
| **Tayang Medsos** | Berita tayang di sosial media | mencatat waktu tayang; status → `Disiarkan` |
| **Tarik ONAIR / Tarik MEDSOS** | salah satu kanal ditarik | kanal lain tetap tayang; status tetap `Disiarkan` |
| **Tarik Semua Tayang** | tarik kedua kanal | status kembali `Terverifikasi` |

Aturan yang ditegakkan di server:

- Hanya berita **terverifikasi atau sudah tayang** yang dapat ditandai tayang — **berlaku untuk semua role,
  termasuk Admin**, agar alur editorial (validasi produser) tidak bisa dilangkahi.
- Wewenang sama dengan penyiaran: Redaktur/Produser Pusat/Koordinator untuk pool pusat & berita yang didorong
  ke pusat, Produser Daerah untuk berita biro-nya. Admin/Super Admin bebas.
- Menandai kanal kedua **tetap boleh** setelah berita tayang di kanal pertama (mis. disiarkan lalu diunggah
  ke Instagram). Menarik kanal terakhir otomatis mengembalikan status ke `Terverifikasi`.
- Setiap penayangan/penarikan tercatat di **riwayat berita**, **audit log** (`NEWS_AIR_ONAIR`,
  `NEWS_AIR_MEDSOS`, `NEWS_RETRACT_AIR_*`), dan memicu notifikasi ke penulis berita.

Tampilan: chip **Onair**/**Medsos** pada tabel & kartu tabulasi, badge + waktu tayang per kanal di halaman detail.

### Laporan kanal tayang
Halaman **Laporan** menambahkan:
- KPI **Tayang Onair**, **Tayang Medsos**, dan **Tayang Onair & Medsos**;
- grafik **Komposisi Kanal Tayang** (Onair saja / Medsos saja / keduanya / belum tayang) dan
  **Tayang Onair & Medsos per Kategori**;
- garis **Tayang Onair** & **Tayang Medsos** pada grafik tren harian;
- tabel **Rekap Tayang per Kategori**, kolom **Onair** & **Medsos** pada *Rekap per Biro*, dan tabel
  **Berita Tayang** (dengan filter *Semua kanal / Tayang Onair / Tayang Medsos*; waktu mengikuti waktu tayang).

Ekspor CSV laporan ikut memuat blok **Kanal Tayang**, **Tayang per Kategori**, dan **Berita Tayang**;
ekspor tabulasi menambah kolom **Tayang Onair/Medos + waktunya**.

> Catatan data lama: berita yang berstatus `Disiarkan` sebelum fitur ini ada **tidak otomatis** ditandai
> kanal (kolom baru default kosong). Berita seperti itu dapat ditandai lewat tombol Tayang Onair/Medsos
> bila memang tayang — angka laporan kanal hanya menghitung penandaan yang benar-benar dilakukan.

## 10. Lupa kata sandi & pengaturan email

### Alur reset
1. Pengguna membuka **`/lupa-password`** (tautan “Lupa kata sandi?” tersedia di halaman masuk) dan memasukkan email terdaftar.
2. Sistem membuat **token sekali pakai** (32 byte acak, disimpan hanya sebagai **hash SHA-256**), masa berlaku **60 menit**,
   lalu mengirim tautan `https://…/reset-password?token=…` ke email pengguna.
3. Pengguna membuat kata sandi baru (indikator kekuatan + checklist aturan yang sama dengan validator server).
4. Kata sandi diperbarui, pengguna menerima **email pemberitahuan** + notifikasi lonceng, token ditandai terpakai,
   dan diarahkan ke halaman masuk (halaman masuk menampilkan pesan “kata sandi berhasil diperbarui”).

Pengamanan yang ditegakkan di server:

- Token **tidak pernah disimpan apa adanya**; hanya hash-nya, sehingga kebocoran isi database tidak cukup untuk memakainya.
- **Satu tautan aktif per pengguna** — meminta tautan baru otomatis membatalkan tautan sebelumnya.
- Permintaan dibatasi **3× per jam per email + IP**; token kedaluwarsa/terpakai/palsu ditolak dengan pesan yang membedakan penyebabnya.
- Respons permintaan **selalu sama** (“bila email terdaftar, tautan dikirim”) agar tidak membocorkan email mana yang terdaftar.
- Semua kejadian tercatat di audit log (`PASSWORD_RESET_REQUEST`, `…_MAIL_FAILED`, `…_TOKEN_EXPIRED/USED/INVALID`, `…_SUCCESS`).
- **Bila email gagal terkirim, akun tidak terkunci**: tautan ditampilkan langsung di layar (aplikasi internal) dan
  **admin mendapat notifikasi** berisi alasan kegagalan. Ini keputusan sadar — jauh lebih berguna daripada
  membiarkan reporter terkunci di lapangan.

> Batasan yang perlu diketahui: reset kata sandi **tidak mencabut sesi yang sudah aktif** (cookie `iron-session`
> bersifat stateless). Bila perangkat lama tercuri, minta admin menonaktifkan akun sementara.

### Pengaturan email (SMTP atau HTTP API)
Halaman **Pengaturan → Email & Notifikasi** (admin/super admin) mendukung:

| Mode | Kolom yang diisi | Catatan |
|---|---|---|
| **SMTP** | host, port, username, password (App Password), From, Reply-To, opsi SSL | Untuk mail server internal/VPS |
| **HTTP API** | API key + endpoint kustom (opsional) | Resend / Brevo / SendGrid — lewat **HTTPS 443** |

- Terdapat tombol **Kirim Email Uji** (memakai pengaturan yang sudah tersimpan) dengan pesan galat yang
  diterjemahkan: `EAUTH` (kredensial), `ETIMEDOUT` (port diblokir), `ENOTFOUND` (host salah), TLS/SSL, dan `HTTP_4xx/5xx`.
- Kredensial (password SMTP / API key) disimpan **terenkripsi AES-256-GCM** dan tidak pernah dikirim balik ke browser.
- ⚠️ **Pelajaran penting dari aplikasi lain di server yang sama**: port SMTP **465 & 587 diblokir** (koneksi timeout),
  sementara HTTPS/443 berhasil. Karena itu mode **HTTP API (Resend/Brevo/SendGrid)** adalah pilihan yang disarankan
  untuk produksi; mode SMTP tetap tersedia bila Anda memakai port lain yang diizinkan.

## 11. Manajemen akun lingkup biro (Produser Daerah)

Produser Daerah tidak lagi bergantung pada admin pusat untuk menambah anggota biro
(Reporter Daerah, Magang, dan Kontributor).
Halaman **Pengaturan → Akun Biro Saya** (`/dashboard/pengaturan/pengguna-biro`) menyediakan:

- daftar akun biro sendiri (nama, email, role, jumlah berita, terakhir masuk, status aktif, penanda “wajib ganti sandi”),
- form **Buat Akun Baru** (nama, email, role, jabatan, telepon, sandi awal + indikator kekuatan),
- **Ubah** akun (nama/role/jabatan/telepon, reset sandi, aktif/nonaktif) melalui modal,
- tombol **Aktifkan/Nonaktifkan** (bukan hapus — riwayat pemberitaan tetap utuh).

Batas yang ditegakkan **di server** (bukan hanya disembunyikan di UI — dibuktikan dengan mengirim form
yang sudah dimanipulasi):

| Aturan | Perilaku |
|---|---|
| Role yang dapat dibuat | Produser Daerah: **Reporter Daerah, Magang, dan Kontributor** saja. Role lain ditolak dengan pesan jelas. |
| Biro akun baru | **Selalu biro Produser Daerah** (field biro diabaikan — tidak bisa dipalsukan lewat form). |
| Akun yang dapat diubah | Hanya anggota **biro yang sama** ber-role Reporter Daerah/Magang/Kontributor; akun biro lain → ditolak. |
| Dirinya sendiri | Tidak dapat mengubah/menonaktifkan akun sendiri lewat halaman ini. |
| Admin/Super Admin | Tetap dapat mengelola **seluruh biro** dan seluruh role daerah (pemilih biro tersedia). |
| Reporter/Magang/Kontributor | Tidak dapat membuka halaman ini sama sekali (“Akses ditolak”). |

Pelengkap: `assignableRoles()` kini **tidak pernah** mengembalikan daftar role luas untuk aktor di luar
Admin/Super Admin (pengaman agar halaman pengelolaan global tidak menjadi jalur eskalasi wewenang).

## 12. Keamanan

- Session cookie `iron-session` (httpOnly, sameSite=lax, secure otomatis di produksi).
  Secret diambil dari `SESSION_SECRET`; bila kosong dibuat sekali dan disimpan di `.session-secret`.
- **Kredensial demo TIDAK ditampilkan di halaman login** (dulu ada panel akun demo + sandi terisi
  otomatis, sehingga siapa pun yang menemukan URL produksi bisa masuk sebagai Super Admin).
  Daftar akun demo hanya ada di `README.md` ini — jangan menyalinnya ke komponen UI, pesan bantuan,
  placeholder, atau tangkapan layar. Dijaga oleh uji regresi: `smoke:server` (grup `keamanan-login`)
  dan `live-check`.
- Rate limit login 5 percobaan / 10 menit per email+IP.
- **Posisi dependensi keamanan**: `next` ^15.5.27 (advisori cache poisoning SSG/ISR diperbaiki di 15.5.27),
  `sanitize-html` ^2.18.0 (bypass XSS diperbaiki di 2.17.7+). `npm audit` = **0 kerentanan**.
- **`serverActions.allowedOrigins` hanya memuat domain aplikasi ini** (`rosid.vibecoder.co.id`,
  `newsroom.garuda.tv`). JANGAN menambahkan domain aplikasi lain (mis. `magang.garuda.tv`) — Newsroom Hub
  dan GarudaTV Magang Center adalah platform terpisah dengan infrastruktur sendiri, sehingga tidak boleh
  saling bergantung. Origin pengembangan (localhost) hanya aktif di mode non-produksi.
- Sanitasi HTML naskah/pengumuman dengan **allow-list `sanitize-html`** (bukan regex).
- Security headers + CSP di `next.config.js`; berkas non-gambar dari `/api/media` dikirim dengan
  `Content-Disposition` + CSP `sandbox`.
- Semua route dashboard & API diverifikasi peran di server (bukan hanya sembunyikan menu).
- Audit log untuk aksi penting (login, kirim, validasi, dorong ke pusat, siarkan, perubahan master).

---

## 13. Uji coba

```bash
npm run smoke:server   # server produksi + 78 pemeriksaan alur utama (termasuk 5 pemeriksaan keamanan login + 7 pemeriksaan ikon lihat-sandi) + 16 tampilan kartu
npm run smoke:storage  # 33 pemeriksaan integrasi storage S3 (memakai mock S3 lokal, tanpa dependensi tambahan)
npm run smoke:presign  # 26 pemeriksaan unggahan langsung pre-signed URL (2 mock S3 HTTPS: CORS aktif & tanpa CORS)
npm run smoke:share    # 18 pemeriksaan unit token + 34 pemeriksaan unduh & berbagi tamu
npm run smoke:upload   # 18 pemeriksaan unggah: progres + banyak footage sekaligus
npm run smoke:chat     # 75 pemeriksaan unit aturan (matriks 11 role) + 56 pemeriksaan integrasi chat
npm run smoke:cues     # 18 pemeriksaan unit sanitasi (termasuk pengerasan CSS/XSS-1) + 27 pemeriksaan panel Format Broadcast
npm run smoke:export   # 46 pemeriksaan unit penyusun data (termasuk penetralan formula CSV/SAN-1) + 29 pemeriksaan ekspor CSV (+ pembuktian PDF/Excel sudah hilang)
npm run smoke:reset    # 37 pemeriksaan unit token/email + 43 pemeriksaan alur lupa kata sandi (termasuk A-1: tautan reset tidak pernah tampil di halaman publik)
npm run smoke:bureau-users # 45 unit izin + 8 unit penjaga akun (data DB) + 51 integrasi akun biro & pengguna
npm run smoke:airing   # 35 pemeriksaan unit tayang + 49 integrasi Tayang Onair/Medsos & laporan kanal
npm run reset:unit     # hanya uji unit token reset & pengaturan email (butuh DB salinan /tmp)
npm run export:unit    # hanya uji unit penyusun data ekspor (tanpa browser)
npm run cues:unit      # hanya uji unit sanitasi chip penanda (tanpa browser)
npm run chat:unit      # hanya uji unit aturan klaster & batas edit (tanpa browser)
npm run share:unit     # hanya uji unit token berbagi (tanpa browser)
npm run smoke:cards    # khusus tampilan kartu (grid 4 kolom + muat 20 kartu lagi)
npm run smoke:live     # 93 pemeriksaan terhadap aplikasi yang sudah dipublikasikan
npm run db:clean-test  # bersihkan artefak data uji (bila menjalankan uji pada DB aplikasi)
```

`smoke:server` **tidak menyentuh database aplikasi**: script menyalin DB ke `/tmp` (di-*override* lewat
`DATABASE_URL`) lalu menambahkan 22 berita uji agar paginasi “muat 20 kartu lagi” benar-benar teruji.
Smoke mencakup: login tiap peran, statistik & filter tabulasi, kirim berita + unggah media + geo-tag,
validasi produser, penyiaran redaktur, pemisahan pool pusat/daerah, peta, laporan, pengumuman,
master pengaturan, tema, proteksi akses, serta tampilan kartu (4 kolom, load more, filter tetap terjaga).

`npm run smoke:storage` menjalankan **mock server S3-compatible** (`scripts/s3-mock.mjs`, path-style, dukungan
HTTP Range + endpoint statistik) lalu memverifikasi: konfigurasi dari UI → uji koneksi (tulis/baca/hapus objek) →
unggahan aplikasi benar-benar masuk ke storage S3 (bucket, prefix, content-type) → URL publik dipakai di halaman detail →
objek terhapus saat berita dihapus → berkas lokal lama tetap dapat dibuka → kembali ke mode lokal → validasi form.
Mock ini tidak memvalidasi tanda tangan SigV4 (yang diuji adalah alur objek & konfigurasi), jadi tetap disarankan
menjalankan **Uji Koneksi** di halaman pengaturan dengan kredensial penyedia Anda yang sebenarnya.

`npm run smoke:upload` men-throttle jaringan lewat CDP (unggah ±512 KB/s) supaya progres dan keadaan
“sedang mengunggah” benar-benar dapat diamati: 3 berkas (2 footage + 1 gambar) dipilih sekaligus,
bilah progres bergerak bertahap sampai 100% (ratusan pembaruan), tombol kirim nonaktif selama unggahan
(dan kirim paksa lewat Enter dicegah), lalu ketiga lampiran terverifikasi tersimpan & dapat diunduh.

`npm run smoke:export` memverifikasi CSV diunduh dengan basePath benar lalu **diurai kembali** (parser CSV
milik skrip uji): blok ringkasan, header 22 kolom, dan panjang tiap baris data diperiksa — jadi berkas
benar-benar dapat dibaca, bukan hanya “HTTP 200”. Uji ini juga membuktikan format lama
(`?format=xlsx` / `?format=pdf`) tetap dilayani sebagai CSV, dan **tidak ada lagi tombol Excel/PDF** di
halaman tabulasi & laporan.

`npm run smoke:reset` menjalankan **SMTP tiruan** (`scripts/smtp-mock.mjs`, tanpa dependensi tambahan) sebagai
kotak surat pengujian: pengaturan email disimpan lewat UI → **email uji & email reset benar-benar terkirim** dan
tertangkap → tautan reset diambil **dari email itu** → kata sandi diganti → masuk dengan sandi baru berhasil
sedangkan sandi lama ditolak. Termasuk uji: token sekali pakai, token palsu, dan jalur gagal kirim
(tautan ditampilkan di layar + admin dinotifikasi). Mock mendekode **quoted-printable/base64** karena tanpa itu
tautan di dalam email akan terpotong dan uji menjadi keliru.

> **Penting (isolasi uji)**: salinan DB di `/tmp` bisa membawa **kredensial storage produksi**
> milik pengguna. Karena itu setiap runner menjalankan `scripts/test-db-local-storage.ts` (memaksa
> Setting storage ke mode lokal) lalu `scripts/assert-test-storage.mjs` yang **membatalkan uji** bila
> penyimpanan yang dilihat aplikasi bukan lokal. Jangan menghapus kedua pengaman ini.

> `prisma/schema.prisma` mengambil koneksi dari `env("DATABASE_URL")` sehingga bisa diarahkan ke database
> lain saat pengujian. `server.js` memuat berkas `.env` secara eksplisit (custom server tidak melakukannya
> otomatis) dan menyediakan fallback `file:./newsroom.db` bila variabel tersebut kosong.

---

## 14. Deploy di VPS

1. `npm ci && npx prisma db push && npm run db:seed`
2. Isi `.env` produksi: `NEXT_PUBLIC_BASE_PATH` (bila dipasang di subfolder), `SESSION_SECRET`,
   `STORAGE_DRIVER=bunny` + kredensial BunnyCDN.
3. `NEXT_PUBLIC_BASE_PATH=... npm run build`
4. Jalankan dengan process manager: `NODE_ENV=production PORT=3000 node server.js` (reverse proxy Nginx/Caddy).
5. Untuk skala lebih besar: ubah `provider` di `prisma/schema.prisma` menjadi `postgresql` dan set `url` ke
   connection string Postgres — seluruh model & tipe sudah kompatibel.
