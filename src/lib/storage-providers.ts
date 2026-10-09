/**
 * Preset penyedia storage S3-compatible.
 * PENTING: file ini dipakai juga oleh komponen CLIENT (form pengaturan) — jangan
 * mengimpor prisma/next-server apa pun di sini (hanya konstanta).
 */
export type StorageProviderKey =
  | 'bunny'
  | 'r2'
  | 'aws'
  | 'spaces'
  | 'wasabi'
  | 'b2'
  | 'custom';

export type StorageProviderPreset = {
  key: StorageProviderKey;
  label: string;
  /** Endpoint S3 default (boleh dikosongkan bila memakai endpoint bawaan AWS). */
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  /** Label kolom bucket & access key sesuai istilah penyedia. */
  bucketLabel: string;
  accessKeyLabel: string;
  publicUrlLabel: string;
  /** Contoh/publicUrl placeholder. */
  publicUrlPlaceholder: string;
  notes: string[];
};

export const STORAGE_PROVIDERS: StorageProviderPreset[] = [
  {
    key: 'bunny',
    label: 'BunnyCDN Storage (S3 compatible)',
    endpoint: 'https://sg.storage.bunnycdn.com',
    region: 'de',
    forcePathStyle: true,
    bucketLabel: 'Nama Storage Zone',
    accessKeyLabel: 'Access Key ID (= nama Storage Zone)',
    publicUrlLabel: 'URL Pull Zone (CDN publik)',
    publicUrlPlaceholder: 'https://nama-pull-zone.b-cdn.net',
    notes: [
      'Ganti bagian “sg” pada endpoint sesuai region zone Anda (mis. ny, la, de, sg, …).',
      'Khusus Bunny: Access Key ID adalah NAMA STORAGE ZONE, dan Secret Access Key adalah Access Key (password) zone tersebut.',
      'URL Pull Zone wajib diisi agar footage/gambar bisa ditampilkan langsung dari CDN.',
      'Batas ukuran per berkas di Bunny Storage mengikuti paket zone Anda (footage 300 MB umumnya aman pada paket berbayar).',
    ],
  },
  {
    key: 'r2',
    label: 'Cloudflare R2',
    endpoint: 'https://<account-id>.r2.cloudflarestorage.com',
    region: 'auto',
    forcePathStyle: true,
    bucketLabel: 'Nama bucket',
    accessKeyLabel: 'Access Key ID',
    publicUrlLabel: 'URL publik bucket (r2.dev / domain kustom)',
    publicUrlPlaceholder: 'https://pub-xxxxxxxx.r2.dev',
    notes: [
      'Ganti <account-id> dengan Account ID Cloudflare Anda.',
      'Aktifkan Public Development URL pada bucket, atau pasang domain kustom, lalu tempel URL-nya di kolom CDN.',
    ],
  },
  {
    key: 'aws',
    label: 'Amazon S3',
    endpoint: '',
    region: 'ap-southeast-1',
    forcePathStyle: false,
    bucketLabel: 'Nama bucket',
    accessKeyLabel: 'Access Key ID',
    publicUrlLabel: 'URL/CDN publik bucket',
    publicUrlPlaceholder: 'https://nama-bucket.s3.ap-southeast-1.amazonaws.com',
    notes: [
      'Kosongkan endpoint untuk memakai endpoint bawaan AWS sesuai region.',
      'Bucket bersifat privat secara default — pakai CloudFront atau atur kebijakan baca publik agar berkas bisa ditampilkan.',
    ],
  },
  {
    key: 'spaces',
    label: 'DigitalOcean Spaces',
    endpoint: 'https://sgp1.digitaloceanspaces.com',
    region: 'sgp1',
    forcePathStyle: false,
    bucketLabel: 'Nama Space',
    accessKeyLabel: 'Access Key',
    publicUrlLabel: 'URL CDN / Space publik',
    publicUrlPlaceholder: 'https://nama-space.sgp1.cdn.digitaloceanspaces.com',
    notes: ['Sesuaikan region (sgp1, nyc3, fra1, …) dan endpoint mengikuti region tersebut.'],
  },
  {
    key: 'wasabi',
    label: 'Wasabi Hot Cloud Storage',
    endpoint: 'https://s3.ap-southeast-1.wasabisys.com',
    region: 'ap-southeast-1',
    forcePathStyle: true,
    bucketLabel: 'Nama bucket',
    accessKeyLabel: 'Access Key',
    publicUrlLabel: 'URL publik bucket',
    publicUrlPlaceholder: 'https://nama-bucket.s3.ap-southeast-1.wasabisys.com',
    notes: ['Region menentukan endpoint (mis. ap-southeast-1, eu-central-1, us-east-1).'],
  },
  {
    key: 'b2',
    label: 'Backblaze B2 (S3 compatible)',
    endpoint: 'https://s3.us-west-004.backblazeb2.com',
    region: 'us-west-004',
    forcePathStyle: true,
    bucketLabel: 'Nama bucket',
    accessKeyLabel: 'Key ID',
    publicUrlLabel: 'URL publik (B2 / Cloudflare)',
    publicUrlPlaceholder: 'https://f000.backblazeb2.com/file/nama-bucket',
    notes: ['Buat Application Key khusus S3 dengan izin baca-tulis pada bucket yang dipakai.'],
  },
  {
    key: 'custom',
    label: 'S3 Compatible lainnya (MinIO, Ceph, dsb.)',
    endpoint: 'https://storage.example.com',
    region: 'us-east-1',
    forcePathStyle: true,
    bucketLabel: 'Nama bucket',
    accessKeyLabel: 'Access Key ID',
    publicUrlLabel: 'URL publik / CDN',
    publicUrlPlaceholder: 'https://cdn.example.com',
    notes: [
      'Aktifkan “path-style” bila server storage Anda tidak mendukung virtual-host style (paling umum untuk MinIO).',
      'URL publik harus dapat diakses langsung oleh browser reporter.',
    ],
  },
];

export const providerPreset = (key: string): StorageProviderPreset =>
  STORAGE_PROVIDERS.find((p) => p.key === key) ?? STORAGE_PROVIDERS[STORAGE_PROVIDERS.length - 1];

export const providerLabel = (key: string): string =>
  key === 'local' ? 'Penyimpanan lokal (folder uploads/)' : providerPreset(key).label;
