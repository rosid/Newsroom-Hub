import { requireRole } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { canUseDirectUpload, getStorageStatus } from '@/lib/storage';
import { getSetting } from '@/lib/settings';
import type { StoredStorageSettings } from '@/lib/storage';
import SettingsNav from '@/components/layout/SettingsNav';
import StorageSettingsForm, { type StorageFormValues } from '@/components/forms/StorageSettingsForm';
import Icon from '@/components/ui/Icon';
import { formatBytes } from '@/lib/utils';
import { providerLabel } from '@/lib/storage-providers';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Storage & Integrasi' };

const ENV_ROWS = [
  { key: 'STORAGE_DRIVER', desc: 'local atau s3 (nilai lama “bunny” diperlakukan sebagai s3)' },
  { key: 'S3_ENDPOINT', desc: 'Endpoint S3, mis. https://sg.storage.bunnycdn.com' },
  { key: 'S3_BUCKET', desc: 'Nama bucket (BunnyCDN: nama Storage Zone)' },
  { key: 'S3_ACCESS_KEY_ID', desc: 'Access Key ID (BunnyCDN: nama Storage Zone)' },
  { key: 'S3_SECRET_ACCESS_KEY', desc: 'Secret Access Key (BunnyCDN: Access Key zone)' },
  { key: 'S3_REGION', desc: 'Region S3 (default: us-east-1)' },
  { key: 'S3_PUBLIC_URL', desc: 'URL publik/CDN untuk tautan berkas' },
  { key: 'S3_PREFIX', desc: 'Folder di dalam bucket (default: newsroom)' },
  { key: 'S3_FORCE_PATH_STYLE', desc: 'true/false — path-style addressing' },
];

export default async function IntegrasiPage() {
  const user = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const [status, stored, agg, byType] = await Promise.all([
    getStorageStatus(),
    getSetting<StoredStorageSettings>('storage', {}),
    prisma.mediaAsset.aggregate({ _count: { _all: true }, _sum: { size: true } }),
    prisma.mediaAsset.groupBy({ by: ['type'], _count: { _all: true }, _sum: { size: true } }),
  ]);
  const direct = await canUseDirectUpload();

  const initial: StorageFormValues = {
    mode: status.mode,
    provider: status.mode === 's3' ? status.provider : 'bunny',
    endpoint: stored.endpoint ?? status.endpoint,
    region: stored.region ?? status.region,
    bucket: status.bucket,
    accessKeyId: stored.accessKeyId ?? '',
    hasSecret: status.hasSecret,
    publicBaseUrl: status.publicBaseUrl,
    prefix: status.prefix,
    forcePathStyle: status.forcePathStyle,
  };

  const s3Assets = await prisma.mediaAsset.count({
    where: { url: { startsWith: 'http' } },
  });
  const localAssets = await prisma.mediaAsset.count({ where: { url: { startsWith: 'local:' } } });

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight">Storage &amp; Integrasi</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Penyimpanan footage &amp; gambar dapat diatur di sini: <strong>lokal (server)</strong> atau
          <strong> S3-compatible</strong> — BunnyCDN, Cloudflare R2, Amazon S3, DigitalOcean Spaces, Wasabi,
          Backblaze B2, MinIO, dsb. Kredensial disimpan terenkripsi di database.
        </p>
      </header>

      <SettingsNav user={user} active="integrasi" />

      {/* Status aktif */}
      <section className="panel shadow-soft p-4" data-storage-status data-storage-mode={status.mode}>
        <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
          <Icon name="cloud" size={15} className="text-muted" /> Status Storage Aktif
        </h2>
        <dl className="grid grid-cols-1 gap-2 text-[12.5px] sm:grid-cols-2">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Mode</dt>
            <dd className="font-semibold">{status.mode === 'local' ? 'Lokal (server)' : providerLabel(status.provider)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Sumber konfigurasi</dt>
            <dd>
              {status.source === 'database'
                ? 'Pengaturan aplikasi (form di bawah)'
                : status.source === 'env'
                  ? 'Variabel environment (.env)'
                  : 'Bawaan'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Kesiapan</dt>
            <dd>
              <span className={status.configured ? 'badge badge-ok' : 'badge badge-danger'}>
                {status.configured ? 'Siap dipakai' : 'Belum lengkap'}
              </span>
            </dd>
          </div>
          {status.mode === 's3' ? (
            <>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Endpoint</dt>
                <dd className="mono text-right">{status.endpoint || `s3.${status.region}.amazonaws.com (bawaan AWS)`}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Bucket / zone</dt>
                <dd className="mono">{status.bucket || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Access Key ID</dt>
                <dd className="mono">{status.accessKeyIdMasked || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Secret Access Key</dt>
                <dd>{status.hasSecret ? <span className="badge badge-ok">tersimpan (terenkripsi)</span> : <span className="badge badge-danger">belum ada</span>}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">URL publik / CDN</dt>
                <dd className="mono text-right">{status.publicBaseUrl || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Path-style</dt>
                <dd>{status.forcePathStyle ? 'Aktif' : 'Nonaktif'}</dd>
              </div>
            </>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Folder di bucket</dt>
            <dd className="mono">{status.prefix || '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Unggahan langsung (pre-signed URL)</dt>
            <dd>
              <span className="badge badge-ok" data-direct-upload={direct.ok ? 'on' : 'off'}>
                {direct.ok ? 'Aktif — berkas tidak lewat server web' : 'Nonaktif — berkas lewat server web'}
              </span>
            </dd>
          </div>
        </dl>
        <p className="mt-3 rounded-lg border border-line bg-panel2 px-3 py-2 text-[12px] text-muted">{status.note}</p>
        <p className="mt-2 rounded-lg border border-line bg-panel2 px-3 py-2 text-[12px] text-muted" data-direct-upload-note>
          {direct.ok
            ? 'Unggahan langsung aktif: server web hanya membuat URL bertanda tangan (SigV4, berlaku 15 menit) lalu browser mengunggah berkasnya langsung ke storage, sehingga footage besar (mis. 300 MB) tidak membebani server web. Server tetap memverifikasi objeknya lewat HEAD (size & tipe) sebelum berkas dicatat sebagai lampiran.'
            : `${direct.reason} Unggahan lewat server tetap berfungsi; ini hanya soal beban server web, bukan kegagalan.`}
          {direct.ok
            ? ' Syarat agar jalur ini terpakai: (1) storage zone/bucket mengizinkan CORS — metode PUT + header Content-Type dari origin aplikasi ini, dan (2) endpoint storage memakai HTTPS (CSP aplikasi hanya mengizinkan koneksi browser ke https:). Bila salah satu tidak terpenuhi, pengguna tetap bisa mengunggah — otomatis lewat server.'
            : ''}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
        <StorageSettingsForm initial={initial} />

        <div className="flex flex-col gap-4">
          <section className="panel shadow-soft p-4">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
              <Icon name="file" size={15} className="text-muted" /> Penggunaan Media
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="kpi">
                <span className="kpi-label">Total berkas</span>
                <span className="kpi-value">{agg._count._all}</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">Total ukuran</span>
                <span className="kpi-value !text-[20px]">{formatBytes(agg._sum.size ?? 0)}</span>
              </div>
              <div className="kpi">
                <span className="kpi-label">Footage</span>
                <span className="kpi-value">{byType.find((b) => b.type === 'FOOTAGE')?._count._all ?? 0}</span>
              </div>
            </div>
            <ul className="mt-3 flex flex-col gap-1 text-[12px] text-muted">
              <li>• Berkas di storage cloud/CDN: <span className="mono">{s3Assets}</span></li>
              <li>• Berkas di penyimpanan lokal: <span className="mono">{localAssets}</span></li>
            </ul>
            <ul className="mt-3 flex flex-col gap-1.5 text-[12px] text-muted">
              <li>• Gambar: jpg/jpeg/png/gif/webp/svg — maks 25 MB per berkas.</li>
              <li>• Footage video: mp4/webm/mov — maks 300 MB per berkas.</li>
              <li>• Dokumen pendukung: pdf/docx/xlsx/csv/txt/zip — maks 50 MB.</li>
            </ul>
          </section>

          <section className="panel shadow-soft p-4">
            <h2 className="mb-2 flex items-center gap-2 text-[14px] font-bold">
              <Icon name="shield" size={15} className="text-muted" /> Catatan Keamanan
            </h2>
            <ul className="flex flex-col gap-1.5 text-[12px] text-muted">
              <li>• Secret Access Key disimpan <strong>terenkripsi (AES-256-GCM)</strong>; kunci turunan dari SESSION_SECRET aplikasi.</li>
              <li>• Bila SESSION_SECRET diganti, kredensial harus diisi ulang (tidak dapat didekripsi lagi).</li>
              <li>• Gunakan kredensial khusus untuk aplikasi ini dengan izin terbatas pada satu bucket/zone.</li>
              <li>• Berkas dari storage dengan URL publik/CDN disajikan langsung ke browser; pastikan URL HTTPS.</li>
            </ul>
          </section>
        </div>
      </div>

      <section className="panel shadow-soft overflow-hidden">
        <h2 className="border-b border-line px-3 py-2.5 text-[13.5px] font-bold">
          Alternatif: Konfigurasi lewat Environment (<span className="mono">.env</span>)
        </h2>
        <p className="px-3 pt-3 text-[12px] text-muted">
          Berguna untuk infra-as-code. Konfigurasi dari form di atas <strong>menang</strong> bila sudah pernah disimpan;
          kosongkan Setting storage untuk kembali memakai nilai environment.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="dtable">
            <thead>
              <tr>
                <th style={{ width: 240 }}>Variabel</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {ENV_ROWS.map((r) => (
                <tr key={r.key}>
                  <td className="mono font-semibold">{r.key}</td>
                  <td className="text-[12.5px] text-muted">{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <pre className="overflow-x-auto border-t border-line bg-panel2 p-3 text-[11.5px] leading-relaxed text-inksoft">
{`# Contoh: BunnyCDN Storage (S3 compatible)
STORAGE_DRIVER=s3
S3_ENDPOINT=https://sg.storage.bunnycdn.com
S3_BUCKET=nama-storage-zone
S3_ACCESS_KEY_ID=nama-storage-zone
S3_SECRET_ACCESS_KEY=xxxxxxxx
S3_REGION=de
S3_PUBLIC_URL=https://nama-pull-zone.b-cdn.net
S3_PREFIX=newsroom
S3_FORCE_PATH_STYLE=true`}
        </pre>
      </section>
    </div>
  );
}
