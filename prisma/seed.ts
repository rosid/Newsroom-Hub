/**
 * Seed GarudaTV Newsroom Hub.
 * AMAN & NON-DESTRUKTIF: semua data dibuat dengan upsert (by email / code / name),
 * tidak ada DROP/TRUNCATE. Jalankan: npm run db:seed (atau otomatis saat npm run dev).
 */
import { PrismaClient, Role, NewsStatus, NewsKind, Pool, MediaType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const id = () => randomUUID();

const BUREAUS = [
  { code: 'MDN', name: 'Biro Medan', region: 'Sumatera Utara', city: 'Medan', lat: 3.5952, lng: 98.6722 },
  { code: 'PLM', name: 'Biro Palembang', region: 'Sumatera Selatan', city: 'Palembang', lat: -2.9761, lng: 104.7754 },
  { code: 'BTM', name: 'Biro Batam', region: 'Kepulauan Riau', city: 'Batam', lat: 1.0456, lng: 104.0305 },
  { code: 'BDG', name: 'Biro Bandung', region: 'Jawa Barat', city: 'Bandung', lat: -6.9175, lng: 107.6191 },
  { code: 'SMG', name: 'Biro Semarang', region: 'Jawa Tengah', city: 'Semarang', lat: -6.9667, lng: 110.4167 },
  { code: 'SBY', name: 'Biro Surabaya', region: 'Jawa Timur', city: 'Surabaya', lat: -7.2575, lng: 112.7521 },
  { code: 'YOG', name: 'Biro Yogyakarta', region: 'DI Yogyakarta', city: 'Yogyakarta', lat: -7.7956, lng: 110.3695 },
  { code: 'DPS', name: 'Biro Denpasar', region: 'Bali', city: 'Denpasar', lat: -8.6705, lng: 115.2126 },
  { code: 'BPN', name: 'Biro Balikpapan', region: 'Kalimantan Timur', city: 'Balikpapan', lat: -1.2379, lng: 116.8529 },
  { code: 'MKS', name: 'Biro Makassar', region: 'Sulawesi Selatan', city: 'Makassar', lat: -5.1477, lng: 119.4327 },
];

const CATEGORIES = [
  { name: 'Politik', color: '#dc2626', sortOrder: 1 },
  { name: 'Ekonomi', color: '#0d9488', sortOrder: 2 },
  { name: 'Hukum & Kriminal', color: '#7c3aed', sortOrder: 3 },
  { name: 'Pemerintahan', color: '#2563eb', sortOrder: 4 },
  { name: 'Cuaca & Bencana', color: '#ea580c', sortOrder: 5 },
  { name: 'Olahraga', color: '#16a34a', sortOrder: 6 },
  { name: 'Hiburan', color: '#db2777', sortOrder: 7 },
  { name: 'Teknologi', color: '#0891b2', sortOrder: 8 },
  { name: 'Kesehatan', color: '#65a30d', sortOrder: 9 },
  { name: 'Pendidikan', color: '#4f46e5', sortOrder: 10 },
  { name: 'Ekonomi Kreatif', color: '#c026d3', sortOrder: 11 },
  { name: 'Internasional', color: '#475569', sortOrder: 12 },
  { name: 'Human Interest', color: '#f59e0b', sortOrder: 13 },
  { name: 'Lalu Lintas', color: '#84cc16', sortOrder: 14 },
  { name: 'Umum', color: '#64748b', sortOrder: 99 },
];

const DEFAULT_SETTINGS: Record<string, unknown> = {
  org: {
    siteName: 'GarudaTV Newsroom Hub',
    tagline: 'Pusat Kendali Pemberitaan Nasional & Biro Daerah',
    companyName: 'PT Garuda Televisi Indonesia',
    address: 'Jl. Kebon Jeruk Raya No. 12, Jakarta Barat',
    phone: '(021) 5000 1234',
    email: 'newsroom@garuda.tv',
    logoUrl: '',
    logoWidth: 40,
    primaryColor: '#d61f2c',
    accentColor: '#1d4ed8',
    defaultTheme: 'dark' as 'dark' | 'light',
  },
  seo: {
    title: 'GarudaTV Newsroom Hub',
    description: 'Sistem pengiriman dan tabulasi berita GarudaTV — pusat & biro daerah.',
  },
  editorial: {
    requireVerification: true,
    breakingAutoNotify: true,
    pushToCenterRoles: ['PRODUSER_DAERAH', 'REDAKTUR', 'ADMIN', 'SUPER_ADMIN'],
  },
  // Konfigurasi storage dikelola dari Pengaturan → Storage & Integrasi.
  // Mode 'local' = folder uploads/; mode 's3' = penyedia S3-compatible (BunnyCDN dll).
  storage: {
    mode: (process.env.STORAGE_DRIVER || 'local').toLowerCase() === 'local' ? 'local' : 's3',
    provider: process.env.S3_PROVIDER || (process.env.BUNNY_STORAGE_ZONE ? 'bunny' : 'custom'),
    endpoint: process.env.S3_ENDPOINT || process.env.BUNNY_STORAGE_ENDPOINT || '',
    region: process.env.S3_REGION || process.env.BUNNY_STORAGE_REGION || 'us-east-1',
    bucket: process.env.S3_BUCKET || process.env.BUNNY_STORAGE_ZONE || '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.BUNNY_STORAGE_ZONE || '',
    publicBaseUrl: process.env.S3_PUBLIC_URL || process.env.BUNNY_CDN_URL || '',
    prefix: process.env.S3_PREFIX || process.env.BUNNY_STORAGE_PREFIX || 'newsroom',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  },
};

const DEMO_PASSWORD = 'Demo123!';

type DemoUser = {
  email: string;
  name: string;
  role: Role;
  bureauCode?: string;
  jobTitle: string;
  phone: string;
};

const USERS: DemoUser[] = [
  { email: 'superadmin@newsroom.demo', name: 'Rangga Wijaya', role: Role.SUPER_ADMIN, jobTitle: 'Super Admin Sistem', phone: '0811-1000-001' },
  { email: 'admin@newsroom.demo', name: 'Sari Puspita', role: Role.ADMIN, jobTitle: 'Manajer Redaksi', phone: '0811-1000-002' },
  { email: 'redaktur@newsroom.demo', name: 'Bimo Aryanto', role: Role.REDAKTUR, jobTitle: 'Redaktur Pelaksana', phone: '0811-1000-003' },
  { email: 'produser.pusat@newsroom.demo', name: 'Nadia Kusuma', role: Role.PRODUSER_PUSAT, jobTitle: 'Produser Pusat', phone: '0811-1000-004' },
  { email: 'reporter.pusat@newsroom.demo', name: 'Yoga Pratama', role: Role.REPORTER_PUSAT, jobTitle: 'Reporter Pusat', phone: '0811-1000-005' },
  { email: 'produser.medan@newsroom.demo', name: 'Ibu Lestari', role: Role.PRODUSER_DAERAH, bureauCode: 'MDN', jobTitle: 'Produser Biro Medan', phone: '0811-2000-001' },
  { email: 'reporter.medan@newsroom.demo', name: 'Fajar Simbolon', role: Role.REPORTER_DAERAH, bureauCode: 'MDN', jobTitle: 'Reporter Biro Medan', phone: '0811-2000-002' },
  { email: 'produser.surabaya@newsroom.demo', name: 'Pak Handoko', role: Role.PRODUSER_DAERAH, bureauCode: 'SBY', jobTitle: 'Produser Biro Surabaya', phone: '0811-3000-001' },
  { email: 'reporter.surabaya@newsroom.demo', name: 'Dewi Ayu', role: Role.REPORTER_DAERAH, bureauCode: 'SBY', jobTitle: 'Reporter Biro Surabaya', phone: '0811-3000-002' },
  { email: 'kontributor.bandung@newsroom.demo', name: 'Rian Hidayat', role: Role.KONTRIBUTOR, bureauCode: 'BDG', jobTitle: 'Kontributor Bandung', phone: '0811-4000-001' },
  { email: 'magang.makassar@newsroom.demo', name: 'Anisa Putri', role: Role.MAGANG, bureauCode: 'MKS', jobTitle: 'Peserta Magang Makassar', phone: '0811-5000-001' },
  { email: 'koordinator.liputan@newsroom.demo', name: 'Dimas Prayoga', role: Role.KOORDINATOR_LIPUTAN, jobTitle: 'Koordinator Liputan', phone: '0811-1000-006' },
  { email: 'koordinator.daerah@newsroom.demo', name: 'Ratna Melati', role: Role.KOORDINATOR_DAERAH, jobTitle: 'Koordinator Daerah (Network)', phone: '0811-1000-007' },
];

const html = (paras: string[]) => paras.map((t) => `<p>${t}</p>`).join('');

type DemoNews = {
  title: string;
  category: string;
  kind: NewsKind;
  status: NewsStatus;
  authorEmail: string;
  location: string;
  province: string;
  city: string;
  lat: number;
  lng: number;
  tags: string[];
  script: string;
  summary: string;
  isPushedToCenter?: boolean;
  isNational?: boolean;
  ageHours: number;
};

const NEWS: DemoNews[] = [
  {
    title: 'Presiden Resmikan Tol Trans Sumatera Ruas Medan–Tebing Tinggi',
    category: 'Pemerintahan',
    kind: NewsKind.REGULAR,
    status: NewsStatus.PUBLISHED,
    authorEmail: 'reporter.pusat@newsroom.demo',
    location: 'Medan, Sumatera Utara',
    province: 'Sumatera Utara',
    city: 'Medan',
    lat: 3.5952,
    lng: 98.6722,
    tags: ['tol', 'infrastruktur', 'trans sumatera'],
    summary: 'Peresmian ruas tol sepanjang 61 kilometer yang diprediksi memangkas waktu tempuh.',
    script: html([
      'JAKARTA — Presiden resmi meresmikan jalan tol Trans Sumatera ruas Medan–Tebing Tinggi, yang diprediksi memangkas waktu tempuh hingga satu jam.',
      'Dalam sambutannya, pemerintah menargetkan konektivitas antarwilayah di Sumatera terus meningkat pada 2027.',
    ]),
    isNational: true,
    ageHours: 5,
  },
  {
    title: 'Pasar Induk Bandung Alami Lonjakan Harga Cabai hingga 40 Persen',
    category: 'Ekonomi',
    kind: NewsKind.REGULAR,
    status: NewsStatus.VERIFIED,
    authorEmail: 'kontributor.bandung@newsroom.demo',
    location: 'Pasar Induk Caringin, Bandung',
    province: 'Jawa Barat',
    city: 'Bandung',
    lat: -6.9175,
    lng: 107.6191,
    tags: ['harga pangan', 'cabai', 'bandung'],
    summary: 'Pedagang menyebut lonjakan dipicu cuaca ekstrem di sentra produksi.',
    script: html([
      'BANDUNG — Harga cabai di Pasar Induk Caringin melonjak hingga 40 persen dalam sepekan terakhir.',
      'Pedagang mengaku lonjakan dipicu cuaca ekstrem di sejumlah sentra produksi di Jawa Barat.',
    ]),
    ageHours: 9,
  },
  {
    title: 'BREAKING: Gempa Magnitudo 5,8 Guncang Pesisir Barat Sumatera',
    category: 'Cuaca & Bencana',
    kind: NewsKind.BREAKING,
    status: NewsStatus.VERIFIED,
    authorEmail: 'reporter.medan@newsroom.demo',
    location: 'Pesisir Barat, Sumatera Utara',
    province: 'Sumatera Utara',
    city: 'Sibolga',
    lat: 1.7427,
    lng: 98.7792,
    tags: ['gempa', 'bmkg', 'breaking'],
    summary: 'BMKG mencatat gempa tidak berpotensi tsunami. Warga diminta tetap waspada.',
    script: html([
      'SIBOLGA — Gempa berkekuatan magnitudo 5,8 mengguncang pesisir barat Sumatera pada pagi ini.',
      'BMKG memastikan gempa tidak berpotensi tsunami, namun warga diminta menjauhi bangunan retak.',
    ]),
    isPushedToCenter: true,
    ageHours: 2,
  },
  {
    title: 'Banjir Rob Rendam Kawasan Pelabuhan Tanjung Perak',
    category: 'Cuaca & Bencana',
    kind: NewsKind.REGULAR,
    status: NewsStatus.PUBLISHED,
    authorEmail: 'reporter.surabaya@newsroom.demo',
    location: 'Pelabuhan Tanjung Perak, Surabaya',
    province: 'Jawa Timur',
    city: 'Surabaya',
    lat: -7.2043,
    lng: 112.7351,
    tags: ['rob', 'surabaya', 'pelabuhan'],
    summary: 'Aktivitas bongkar muat tetap berjalan meski akses jalan tergenang.',
    script: html([
      'SURABAYA — Banjir rob merendam sejumlah ruas jalan menuju Pelabuhan Tanjung Perak dengan ketinggian 40 sentimeter.',
      'Otoritas pelabuhan memastikan aktivitas bongkar muat tetap berjalan normal.',
    ]),
    isPushedToCenter: true,
    isNational: true,
    ageHours: 27,
  },
  {
    title: 'Festival Layang-Layang Bali Tarik 12 Ribu Wisatawan',
    category: 'Hiburan',
    kind: NewsKind.REGULAR,
    status: NewsStatus.VERIFIED,
    authorEmail: 'reporter.medan@newsroom.demo',
    location: 'Sanur, Denpasar',
    province: 'Bali',
    city: 'Denpasar',
    lat: -8.6905,
    lng: 115.2626,
    tags: ['wisata', 'bali', 'festival'],
    summary: 'Perhelatan tahunan ini jadi salah satu magnet kunjungan akhir pekan.',
    script: html([
      'DENPASAR — Festival layang-layang Bali di kawasan Sanur menarik sekitar 12 ribu wisatawan selama dua hari.',
      'Panitia menyebut tahun ini peserta dari luar negeri bertambah dua kali lipat.',
    ]),
    ageHours: 30,
  },
  {
    title: 'KPK Periksa Tiga Pejabat Daerah Terkait Dugaan Korupsi Dana Hibah',
    category: 'Hukum & Kriminal',
    kind: NewsKind.REGULAR,
    status: NewsStatus.PENDING,
    authorEmail: 'reporter.medan@newsroom.demo',
    location: 'Balikpapan, Kalimantan Timur',
    province: 'Kalimantan Timur',
    city: 'Balikpapan',
    lat: -1.2379,
    lng: 116.8529,
    tags: ['kpk', 'korupsi', 'dana hibah'],
    summary: 'Pemeriksaan berlangsung sekitar enam jam dengan membawa dokumen anggaran.',
    script: html([
      'BALIKPAPAN — KPK memeriksa tiga pejabat daerah terkait dugaan penyalahgunaan dana hibah tahun anggaran lalu.',
      'Penyidik menyita sejumlah dokumen perencanaan dan pencairan anggaran.',
    ]),
    ageHours: 3,
  },
  {
    title: 'Jembatan Penghubung Antar-Desa di Makassar Ambruk Diterjang Arus',
    category: 'Cuaca & Bencana',
    kind: NewsKind.BREAKING,
    status: NewsStatus.PENDING,
    authorEmail: 'magang.makassar@newsroom.demo',
    location: 'Kabupaten Gowa, Sulawesi Selatan',
    province: 'Sulawesi Selatan',
    city: 'Makassar',
    lat: -5.1477,
    lng: 119.4327,
    tags: ['jembatan', 'banjir', 'gowa'],
    summary: 'Akses warga terputus, BPBD menyiapkan jembatan darurat.',
    script: html([
      'GOWA — Jembatan gantung penghubung dua desa di Kabupaten Gowa ambruk diterjang arus sungai.',
      'BPBD menyiapkan jembatan darurat dan jalur alternatif bagi warga.',
    ]),
    ageHours: 1,
  },
  {
    title: 'Tingkat Hunjaman Kamar Hotel Yogyakarta Naik 18 Persen',
    category: 'Ekonomi',
    kind: NewsKind.REGULAR,
    status: NewsStatus.REVISION,
    authorEmail: 'reporter.medan@newsroom.demo',
    location: 'Yogyakarta',
    province: 'DI Yogyakarta',
    city: 'Yogyakarta',
    lat: -7.7956,
    lng: 110.3695,
    tags: ['hotel', 'pariwisata', 'yogyakarta'],
    summary: 'Kenaikan dipicu gelaran festival budaya dan libur panjang.',
    script: html([
      'YOGYAKARTA — Tingkat hunian kamar hotel di Yogyakarta naik 18 persen dibanding bulan lalu.',
      'Data ini perlu dilengkapi dengan keterangan resmi PHRI dan jumlah kunjungan wisatawan.',
    ]),
    ageHours: 20,
  },
  {
    title: 'Berita sedang disusun: Rencana Relokasi Pasar Cikarang', category: 'Ekonomi',
    kind: NewsKind.REGULAR,
    status: NewsStatus.DRAFT,
    authorEmail: 'kontributor.bandung@newsroom.demo',
    location: 'Cikarang, Jawa Barat',
    province: 'Jawa Barat',
    city: 'Cikarang',
    lat: -6.2892,
    lng: 107.1517,
    tags: ['pasar', 'relokasi'],
    summary: 'Kerangka naskah, menunggu konfirmasi narasumber.',
    script: html([
      'CIKARANG — Pemerintah daerah berencana merelokasi Pasar Cikarang ke lahan baru.',
      'Naskah masih dalam penyusunan, menunggu konfirmasi dari Dinas Perdagangan.',
    ]),
    ageHours: 6,
  },
  {
    title: 'Pelatih Timnas Sebut Skuad Siap Hadapi Kualifikasi',
    category: 'Olahraga',
    kind: NewsKind.REGULAR,
    status: NewsStatus.VERIFIED,
    authorEmail: 'reporter.pusat@newsroom.demo',
    location: 'Jakarta',
    province: 'DKI Jakarta',
    city: 'Jakarta',
    lat: -6.2088,
    lng: 106.8456,
    tags: ['timnas', 'sepak bola'],
    summary: 'Pemusatan latihan digelar dua pekan jelang laga kandang.',
    script: html([
      'JAKARTA — Pelatih timnas memastikan seluruh pemain dalam kondisi siap menjelang laga kualifikasi.',
      'Pemusatan latihan akan digelar selama dua pekan ke depan.',
    ]),
    ageHours: 40,
  },
  {
    title: 'Startup Lokal Kembangkan Aplikasi Deteksi Dini Banjir',
    category: 'Teknologi',
    kind: NewsKind.REGULAR,
    status: NewsStatus.PUBLISHED,
    authorEmail: 'reporter.pusat@newsroom.demo',
    location: 'Jakarta Selatan',
    province: 'DKI Jakarta',
    city: 'Jakarta',
    lat: -6.2615,
    lng: 106.8106,
    tags: ['teknologi', 'banjir', 'startup'],
    summary: 'Sensor IoT dipasang di 24 titik sungai dan dikirim ke dasbor BPBD.',
    script: html([
      'JAKARTA — Sebuah startup lokal mengembangkan aplikasi peringatan dini banjir berbasis sensor IoT.',
      'Sensor dipasang di 24 titik sungai dan datanya terhubung ke dasbor BPBD.',
    ]),
    ageHours: 52,
  },
  {
    title: 'Pemkot Semarang Uji Coba Bus Listrik untuk Rute Pusat Kota',
    category: 'Pemerintahan',
    kind: NewsKind.REGULAR,
    status: NewsStatus.PENDING,
    authorEmail: 'reporter.surabaya@newsroom.demo',
    location: 'Semarang, Jawa Tengah',
    province: 'Jawa Tengah',
    city: 'Semarang',
    lat: -6.9667,
    lng: 110.4167,
    tags: ['bus listrik', 'semarang', 'transportasi'],
    summary: 'Uji coba berlangsung tiga bulan dengan dua unit bus.',
    script: html([
      'SEMARANG — Pemkot Semarang memulai uji coba dua unit bus listrik untuk rute pusat kota.',
      'Uji coba akan berlangsung tiga bulan untuk mengukur efisiensi biaya operasional.',
    ]),
    ageHours: 4,
  },
];

async function main() {
  console.log('[seed] mulai…');
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // 1) Setting dasar (tidak menimpa nilai yang sudah ada)
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = await prisma.setting.findUnique({ where: { key } });
    if (!existing) {
      await prisma.setting.create({ data: { key, value: JSON.stringify(value) } });
      console.log(`[seed] setting '${key}' dibuat`);
    }
  }

  // 2) Kategori
  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { name: c.name },
      update: {},
      create: { id: id(), name: c.name, color: c.color, sortOrder: c.sortOrder },
    });
  }
  console.log(`[seed] ${CATEGORIES.length} kategori siap`);

  // 3) Biro daerah
  const bureauByCode: Record<string, string> = {};
  for (const b of BUREAUS) {
    const rec = await prisma.bureau.upsert({
      where: { code: b.code },
      update: {},
      create: {
        id: id(),
        code: b.code,
        name: b.name,
        region: b.region,
        city: b.city,
        address: `Jl. ${b.name.replace('Biro ', '')} No. 1, ${b.city}`,
        phone: '(021) 5000 1234',
      },
    });
    bureauByCode[b.code] = rec.id;
  }
  console.log(`[seed] ${BUREAUS.length} biro daerah siap`);

  // 4) Pengguna demo
  const userByEmail: Record<string, string> = {};
  for (const u of USERS) {
    const rec = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        id: id(),
        email: u.email,
        name: u.name,
        passwordHash: hash,
        role: u.role,
        bureauId: u.bureauCode ? bureauByCode[u.bureauCode] : null,
        jobTitle: u.jobTitle,
        phone: u.phone,
      },
    });
    userByEmail[u.email] = rec.id;
  }
  console.log(`[seed] ${USERS.length} pengguna demo siap (sandi: ${DEMO_PASSWORD})`);

  // 5) Berita contoh (hanya dibuat bila nomor berita belum ada)
  let created = 0;
  for (const n of NEWS) {
    const authorId = userByEmail[n.authorEmail];
    const author = USERS.find((u) => u.email === n.authorEmail)!;
    const bureauId = author.bureauCode ? bureauByCode[author.bureauCode] : null;
    const createdAt = new Date(Date.now() - n.ageHours * 3600 * 1000);
    const code = `NB-${createdAt.toISOString().slice(0, 10).replace(/-/g, '')}-${String(1000 + created).slice(1)}`;
    const exists = await prisma.news.findUnique({ where: { code } });
    if (exists) continue;
    await prisma.news.create({
      data: {
        id: id(),
        code,
        title: n.title,
        script: n.script,
        summary: n.summary,
        category: n.category,
        kind: n.kind,
        status: n.status,
        originPool: bureauId ? Pool.DAERAH : Pool.PUSAT,
        authorId,
        authorBureauId: bureauId,
        authorRole: author.role,
        location: n.location,
        province: n.province,
        city: n.city,
        latitude: n.lat,
        longitude: n.lng,
        tags: JSON.stringify(n.tags),
        isPushedToCenter: !!n.isPushedToCenter,
        pushedAt: n.isPushedToCenter ? createdAt : null,
        isNational: !!n.isNational,
        publishedAt: n.status === NewsStatus.PUBLISHED ? createdAt : null,
        submittedAt: n.status !== NewsStatus.DRAFT ? createdAt : null,
        reviewedAt:
          n.status === NewsStatus.VERIFIED || n.status === NewsStatus.REVISION ? createdAt : null,
        createdAt,
        updatedAt: createdAt,
        logs: {
          create: [
            {
              id: id(),
              toStatus: n.status,
              actorId: authorId,
              actorName: author.name,
              note: 'Data contoh (seed)',
              createdAt,
            },
          ],
        },
        media:
          n.status === NewsStatus.DRAFT
            ? undefined
            : {
                create: [
                  {
                    id: id(),
                    type: MediaType.FOOTAGE,
                    storageKey: `demo/${code}-raw.mp4`,
                    url: '',
                    filename: `${code}-raw.mp4`,
                    mimeType: 'video/mp4',
                    size: 18_400_000,
                    caption: 'Footage mentah lapangan (contoh)',
                    uploadedById: authorId,
                    createdAt,
                  },
                  {
                    id: id(),
                    type: MediaType.IMAGE,
                    storageKey: `demo/${code}-thumb.jpg`,
                    url: '',
                    filename: `${code}-thumb.jpg`,
                    mimeType: 'image/jpeg',
                    size: 1_240_000,
                    caption: 'Gambar pendukung (contoh)',
                    uploadedById: authorId,
                    createdAt,
                  },
                ],
              },
      },
    });
    created += 1;
  }
  console.log(`[seed] ${created} berita contoh dibuat`);
  console.log('[seed] selesai.');
}

main()
  .catch((e) => {
    console.error('[seed] gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
