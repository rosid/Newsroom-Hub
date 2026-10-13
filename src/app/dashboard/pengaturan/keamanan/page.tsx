import Link from 'next/link';
import { requireRole } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { getStoredSecuritySettings, getSecuritySettings, isTurnstileReady, SECURITY_LIMITS } from '@/lib/settings';
import { updateSecuritySettingsAction } from '@/actions/settings';
import { formatDateTimeID, timeAgo } from '@/lib/utils';
import ActionForm from '@/components/forms/ActionForm';
import SettingsNav from '@/components/layout/SettingsNav';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Keamanan' };

/** Aksi audit yang dihitung sebagai "riwayat login". */
const LOGIN_ACTIONS = ['LOGIN', 'LOGIN_GAGAL', 'LOGIN_DIBLOKIR', 'LOGIN_TURNSTILE_GAGAL'];

/** Lencana status untuk riwayat login. */
const EVENT_BADGE: Record<string, { label: string; cls: string }> = {
  LOGIN: { label: 'Berhasil', cls: 'badge badge-ok' },
  LOGIN_GAGAL: { label: 'Sandi salah', cls: 'badge badge-danger' },
  LOGIN_DIBLOKIR: { label: 'Diblokir throttle', cls: 'badge badge-warn' },
  LOGIN_TURNSTILE_GAGAL: { label: 'Gagal verifikasi', cls: 'badge badge-warn' },
};

/** Ambil nilai ip/ua dari meta JSON (disimpan sebagai string). */
function metaOf(raw: string): { ip?: string; ua?: string; error?: string; retryAfterMinutes?: number } {
  try {
    const o = JSON.parse(raw || '{}') as Record<string, unknown>;
    return {
      ip: typeof o.ip === 'string' ? o.ip : undefined,
      ua: typeof o.ua === 'string' ? o.ua : undefined,
      error: typeof o.error === 'string' ? o.error : undefined,
      retryAfterMinutes: typeof o.retryAfterMinutes === 'number' ? o.retryAfterMinutes : undefined,
    };
  } catch {
    return {};
  }
}

/** Ringkas User-Agent menjadi label perangkat yang mudah dibaca. */
function deviceLabel(ua: string | undefined): string {
  if (!ua) return '-';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : 'Peramban lain';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
}

/**
 * Pengaturan Keamanan (Pengaturan → Keamanan).
 *
 * 1. Turnstile Cloudflare di halaman login — ON/OFF TERPISAH dari kuncinya.
 * 2. Login throttling (jumlah percobaan, jendela waktu, lama blokir).
 * 3. Auto logout: umur sesi (bawaan 72 jam = 3x24 jam), dihitung dari WAKTU LOGIN.
 * 4. Riwayat login (IP + waktu + perangkat), dibaca dari AuditLog — tanpa tabel baru.
 *
 * Keamanan: Secret Key Turnstile TIDAK pernah dikirim ke browser. Halaman hanya menerima
 * boolean "sudah diisi" (pola yang sama dengan pengaturan email & storage).
 */
export default async function KeamananPage() {
  const user = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const [stored, full] = await Promise.all([getStoredSecuritySettings(), getSecuritySettings()]);

  const [loginEvents, totalEvents, failedCount] = await Promise.all([
    prisma.auditLog.findMany({
      where: { action: { in: LOGIN_ACTIONS } },
      orderBy: { createdAt: 'desc' },
      take: 60,
    }),
    prisma.auditLog.count({ where: { action: { in: LOGIN_ACTIONS } } }),
    prisma.auditLog.count({ where: { action: { in: ['LOGIN_GAGAL', 'LOGIN_DIBLOKIR', 'LOGIN_TURNSTILE_GAGAL'] } } }),
  ]);

  const hasSecret = Boolean(stored.turnstileSecretEnc);
  const ready = isTurnstileReady(full);
  const sessionDays = Math.round((stored.sessionHours / 24) * 10) / 10;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Keamanan</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            Perlindungan halaman login (Turnstile), pembatas percobaan masuk, umur sesi, dan riwayat login.
          </p>
        </div>
        <span className={ready ? 'badge badge-ok' : 'badge badge-muted'} data-security-status>
          {ready ? 'Turnstile AKTIF' : stored.turnstileEnabled ? 'Turnstile belum lengkap' : 'Turnstile nonaktif'}
        </span>
      </header>

      <SettingsNav user={user} active="keamanan" />

      <ActionForm
        action={updateSecuritySettingsAction}
        submitLabel="Simpan Pengaturan Keamanan"
        pendingText="Menyimpan…"
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr]">
          {/* ---------- Turnstile ---------- */}
          <section className="panel shadow-soft p-4">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
              <Icon name="shield" size={15} className="text-muted" /> Turnstile Cloudflare (halaman login)
            </h2>

            <label className="flex items-start gap-2 rounded-lg border border-line bg-panel2 p-3 text-[12.5px]">
              <input
                type="checkbox"
                name="turnstileEnabled"
                defaultChecked={stored.turnstileEnabled}
                className="mt-[2px]"
                data-turnstile-toggle
              />
              <span>
                <span className="block font-semibold">Aktifkan Turnstile</span>
                <span className="block text-muted">
                  Tombol ini terpisah dari kuncinya: Anda dapat mematikan Turnstile tanpa menghapus
                  Site Key / Secret Key, lalu menyalakannya lagi kapan saja.
                </span>
              </span>
            </label>

            <div className="mt-3 flex flex-col gap-3">
              <div>
                <label className="label" htmlFor="sec-sitekey">
                  Site Key
                </label>
                <input
                  id="sec-sitekey"
                  name="turnstileSiteKey"
                  className="input mono !text-[12px]"
                  placeholder="0x4AAAAAAA…"
                  defaultValue={stored.turnstileSiteKey}
                  data-turnstile-sitekey
                />
                <p className="hint">Dari dashboard Cloudflare → Turnstile → tambahkan situs.</p>
              </div>

              <div>
                <label className="label" htmlFor="sec-secret">
                  Secret Key {hasSecret ? <span className="text-[color:var(--ok)]">(sudah tersimpan)</span> : null}
                </label>
                <input
                  id="sec-secret"
                  name="turnstileSecretKey"
                  type="password"
                  className="input mono !text-[12px]"
                  placeholder={hasSecret ? '•••••••• (biarkan kosong bila tidak diubah)' : '0x4AAAAAAA…'}
                  autoComplete="new-password"
                  data-turnstile-secret
                />
                <p className="hint">
                  Disimpan terenkripsi dan tidak pernah dikirim balik ke browser. Kosongkan bila tidak ingin mengubahnya.
                </p>
                {hasSecret ? (
                  <label className="mt-2 flex items-center gap-2 text-[12px]">
                    <input type="checkbox" name="clearTurnstileSecret" data-turnstile-clear />
                    Hapus Secret Key yang tersimpan
                  </label>
                ) : null}
              </div>
            </div>

            {stored.turnstileEnabled && !ready ? (
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12px] text-danger">
                <Icon name="alert" size={14} className="mt-[2px] shrink-0" />
                <span>
                  Turnstile sedang dinyalakan tetapi Site Key / Secret Key belum lengkap. Selama itu,
                  login akan ditolak. Lengkapi kuncinya atau matikan tombolnya.
                </span>
              </p>
            ) : null}
          </section>

          {/* ---------- Throttling + sesi ---------- */}
          <div className="flex flex-col gap-4">
            <section className="panel shadow-soft p-4">
              <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
                <Icon name="lock" size={15} className="text-muted" /> Login Throttling
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label" htmlFor="sec-attempts">
                    Percobaan
                  </label>
                  <input
                    id="sec-attempts"
                    name="throttleMaxAttempts"
                    type="number"
                    min={SECURITY_LIMITS.attempts.min}
                    max={SECURITY_LIMITS.attempts.max}
                    className="input"
                    defaultValue={stored.throttleMaxAttempts}
                    data-sec-attempts
                  />
                </div>
                <div>
                  <label className="label" htmlFor="sec-window">
                    Jendela (menit)
                  </label>
                  <input
                    id="sec-window"
                    name="throttleWindowMinutes"
                    type="number"
                    min={SECURITY_LIMITS.windowMinutes.min}
                    max={SECURITY_LIMITS.windowMinutes.max}
                    className="input"
                    defaultValue={stored.throttleWindowMinutes}
                    data-sec-window
                  />
                </div>
                <div>
                  <label className="label" htmlFor="sec-block">
                    Blokir (menit)
                  </label>
                  <input
                    id="sec-block"
                    name="throttleBlockMinutes"
                    type="number"
                    min={SECURITY_LIMITS.blockMinutes.min}
                    max={SECURITY_LIMITS.blockMinutes.max}
                    className="input"
                    defaultValue={stored.throttleBlockMinutes}
                    data-sec-block
                  />
                </div>
              </div>
              <p className="hint mt-2">
                Hitungan dipisah per email + alamat IP. Saat ini: <b>{stored.throttleMaxAttempts} percobaan</b> per{' '}
                <b>{stored.throttleWindowMinutes} menit</b>, lalu diblokir <b>{stored.throttleBlockMinutes} menit</b>.
              </p>
              <p className="hint">
                Hitungan disimpan di memori server dan hilang saat aplikasi dimulai ulang.
              </p>
            </section>

            <section className="panel shadow-soft p-4">
              <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
                <Icon name="clock" size={15} className="text-muted" /> Auto Logout (umur sesi)
              </h2>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="label" htmlFor="sec-session">
                    Umur sesi (jam)
                  </label>
                  <input
                    id="sec-session"
                    name="sessionHours"
                    type="number"
                    min={SECURITY_LIMITS.sessionHours.min}
                    max={SECURITY_LIMITS.sessionHours.max}
                    className="input"
                    defaultValue={stored.sessionHours}
                    data-sec-session
                  />
                </div>
                <span className="badge badge-muted mb-1" data-sec-session-days>
                  ≈ {sessionDays} hari
                </span>
              </div>
              <p className="hint mt-2">
                Dihitung dari <b>waktu login</b>, bukan dari aktivitas terakhir — pengguna yang terus bekerja
                pun akan diminta masuk lagi setelah {stored.sessionHours} jam. Bawaan 72 jam (3×24 jam).
              </p>
            </section>
          </div>
        </div>
      </ActionForm>

      {/* ---------- Riwayat login ---------- */}
      <section className="panel shadow-soft overflow-hidden" data-login-history>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <h2 className="flex items-center gap-2 text-[13.5px] font-bold">
            <Icon name="shield" size={14} className="text-muted" /> Riwayat Login
          </h2>
          <span className="badge badge-muted">{totalEvents} peristiwa</span>
          {failedCount > 0 ? <span className="badge badge-warn">{failedCount} tidak berhasil</span> : null}
          <span className="ml-auto text-[11px] text-muted">60 peristiwa terbaru</span>
        </div>

        {loginEvents.length ? (
          <div className="overflow-x-auto">
            <table className="dtable" data-login-history-table>
              <thead>
                <tr>
                  <th style={{ width: 170 }}>Waktu</th>
                  <th style={{ width: 150 }}>Status</th>
                  <th>Pengguna</th>
                  <th style={{ width: 150 }}>Alamat IP</th>
                  <th style={{ width: 150 }}>Perangkat</th>
                </tr>
              </thead>
              <tbody>
                {loginEvents.map((e) => {
                  const m = metaOf(e.meta);
                  const badge = EVENT_BADGE[e.action] ?? { label: e.action, cls: 'badge badge-muted' };
                  return (
                    <tr key={e.id}>
                      <td className="text-[12px] text-muted">
                        <span className="block">{formatDateTimeID(e.createdAt)}</span>
                        <span className="block text-[10.5px]">{timeAgo(e.createdAt)}</span>
                      </td>
                      <td>
                        <span className={badge.cls}>{badge.label}</span>
                        {m.retryAfterMinutes ? (
                          <span className="mt-1 block text-[10.5px] text-muted">diblokir {m.retryAfterMinutes} menit</span>
                        ) : null}
                      </td>
                      <td className="text-[12.5px]">
                        <span className="block font-semibold">
                          {e.action === 'LOGIN' ? e.actorName : e.entityId || '-'}
                        </span>
                        {e.action === 'LOGIN' ? (
                          <span className="block text-[10.5px] text-muted">{e.actorRole}</span>
                        ) : m.error ? (
                          <span className="block text-[10.5px] text-muted">{m.error}</span>
                        ) : null}
                      </td>
                      <td className="mono text-[11.5px]">{m.ip || e.ip || '-'}</td>
                      <td className="text-[11.5px] text-muted">{deviceLabel(m.ua)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-3 py-8 text-center text-[12.5px] text-muted">
            Belum ada riwayat login. Catatan akan muncul setelah ada yang masuk atau gagal masuk.
          </p>
        )}
      </section>

      <p className="text-[11.5px] text-muted">
        Riwayat lengkap semua aktivitas (termasuk perubahan data) ada di{' '}
        <Link href="/dashboard/pengaturan/audit" className="font-semibold text-accent hover:underline">
          Log Aktivitas
        </Link>
        .
      </p>
    </div>
  );
}
