import Link from 'next/link';
import { requireRole } from '@/lib/session';
import { getLoginSettings, getOrgSettings } from '@/lib/settings';
import { updateLoginSettingsAction } from '@/actions/settings';
import { DEFAULT_LOGIN, MAX_HERO_POINTS, parseHeroTitle } from '@/lib/login-content';
import ActionForm from '@/components/forms/ActionForm';
import ImageUrlField from '@/components/forms/ImageUrlField';
import SettingsNav from '@/components/layout/SettingsNav';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Halaman Login' };

/**
 * Pengaturan tampilan Frontpage (halaman login).
 *
 * Semua teks pada halaman login dapat diubah di sini, plus gambar latar (hero) opsional.
 * Kolom teks yang dikosongkan akan disembunyikan di halaman login.
 *
 * PENTING — hanya SATU form untuk semua kolom di halaman ini. Jangan memecahnya menjadi
 * beberapa form yang memakai action yang sama: server action menyimpan seluruh objek
 * Setting, jadi form yang tidak memuat sebagian kolom akan MENGHAPUS kolom tersebut.
 * (Kelas bug ini sudah pernah terjadi di aplikasi ini pada pengaturan `org`.)
 *
 * CATATAN KEAMANAN: halaman login tidak boleh menampilkan kredensial apa pun — jangan
 * menambahkan kolom berisi contoh akun/sandi.
 */
export default async function LoginSettingsPage() {
  const user = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const [login, org] = await Promise.all([getLoginSettings(), getOrgSettings()]);

  // Pratinjau memakai parser yang sama dengan halaman login → apa yang terlihat di sini
  // persis yang dirender (termasuk penanda warna [[…]] dan {{…}}).
  const titleParts = parseHeroTitle(login.heroTitle || DEFAULT_LOGIN.heroTitle);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Halaman Login (Frontpage)</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            Atur teks panel branding, teks form masuk, dan gambar latar yang dilihat pengguna sebelum masuk.
          </p>
        </div>
        <Link href="/login" target="_blank" className="btn btn-sm">
          <Icon name="external" size={13} /> Lihat halaman login
        </Link>
      </header>

      <SettingsNav user={user} active="login" />

      <ActionForm
        action={updateLoginSettingsAction}
        submitLabel="Simpan Tampilan Login"
        pendingText="Menyimpan…"
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_1fr]">
          {/* ---------- Kolom kiri: teks ---------- */}
          <section className="panel shadow-soft p-4">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
              <Icon name="file" size={15} className="text-muted" /> Teks Halaman Login
            </h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="label" htmlFor="login-heroBadge">
                  Teks badge (di atas judul)
                </label>
                <input id="login-heroBadge" name="heroBadge" className="input" defaultValue={login.heroBadge} data-login-field="heroBadge" />
                <p className="hint">Kosongkan untuk menyembunyikan badge.</p>
              </div>

              <div>
                <label className="label" htmlFor="login-heroTitle">
                  Judul besar
                </label>
                <input id="login-heroTitle" name="heroTitle" className="input" defaultValue={login.heroTitle} data-login-field="heroTitle" />
                <p className="hint">
                  Beri warna dengan penanda: <span className="mono">[[Pusat]]</span> = warna utama,{' '}
                  <span className="mono">{'{{Biro Daerah}}'}</span> = warna aksen. Tanpa penanda, teks tampil normal.
                </p>
              </div>

              <div>
                <label className="label" htmlFor="login-heroPoints">
                  Poin penjelasan (satu per baris, maksimal {MAX_HERO_POINTS})
                </label>
                <textarea
                  id="login-heroPoints"
                  name="heroPoints"
                  className="input min-h-[96px]"
                  defaultValue={login.heroPoints}
                  data-login-field="heroPoints"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="login-heroFooterNote">
                    Catatan kaki kiri
                  </label>
                  <input id="login-heroFooterNote" name="heroFooterNote" className="input" defaultValue={login.heroFooterNote} data-login-field="heroFooterNote" />
                </div>
                <div>
                  <label className="label" htmlFor="login-heroFooterRights">
                    Catatan kaki kanan
                  </label>
                  <input id="login-heroFooterRights" name="heroFooterRights" className="input" defaultValue={login.heroFooterRights} data-login-field="heroFooterRights" />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="login-formTitle">
                  Judul form masuk
                </label>
                <input id="login-formTitle" name="formTitle" className="input" defaultValue={login.formTitle} data-login-field="formTitle" />
              </div>

              <div>
                <label className="label" htmlFor="login-formSubtitle">
                  Keterangan di bawah judul form
                </label>
                <textarea
                  id="login-formSubtitle"
                  name="formSubtitle"
                  className="input min-h-[64px]"
                  defaultValue={login.formSubtitle}
                  data-login-field="formSubtitle"
                />
              </div>
            </div>
          </section>

          {/* ---------- Kolom kanan: gambar + pratinjau ---------- */}
          <div className="flex flex-col gap-4">
            <section className="panel shadow-soft p-4">
              <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
                <Icon name="image" size={15} className="text-muted" /> Gambar Latar (Hero)
              </h2>
              <div className="flex flex-col gap-3">
                <ImageUrlField
                  name="heroImageUrl"
                  defaultValue={login.heroImageUrl}
                  label="Gambar latar panel branding (opsional)"
                  hint="Harus URL PUBLIK (CDN/pull zone) karena halaman login dibuka tanpa login. Tombol Unggah memakai storage yang diatur di Storage & Integrasi."
                />
                <div>
                  <label className="label" htmlFor="login-heroImageOpacity">
                    Kepekatan lapisan gelap (0–100)
                  </label>
                  <input
                    id="login-heroImageOpacity"
                    name="heroImageOpacity"
                    className="input"
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={login.heroImageOpacity}
                  />
                  <p className="hint">Semakin tinggi, gambar semakin redup dan teks semakin mudah dibaca.</p>
                </div>
              </div>
            </section>

            <section className="panel shadow-soft p-4">
              <h2 className="mb-2 flex items-center gap-2 text-[14px] font-bold">
                <Icon name="eye" size={15} className="text-muted" /> Pratinjau Judul
              </h2>
              <div className="rounded-lg border border-line bg-bgdeep p-4">
                <p className="text-[20px] font-extrabold leading-snug tracking-tight" data-login-title-preview>
                  {titleParts.map((p, i) => (
                    <span
                      key={`${p.text}-${i}`}
                      style={
                        p.tone === 'brand'
                          ? { color: 'var(--brand)' }
                          : p.tone === 'accent'
                            ? { color: 'var(--accent)' }
                            : undefined
                      }
                    >
                      {p.text}
                    </span>
                  ))}
                </p>
              </div>
              <ul className="mt-3 flex flex-col gap-2 text-[12px] text-muted">
                <li>
                  Logo:{' '}
                  {org.logoUrl ? (
                    <>memakai logo dari Identitas &amp; Tampilan.</>
                  ) : (
                    <>belum diatur — tampil lambang huruf.</>
                  )}{' '}
                  <Link href="/dashboard/pengaturan" className="font-semibold text-accent hover:underline">
                    Ubah logo
                  </Link>
                </li>
                <li>Simpan, lalu buka halaman login untuk melihat hasilnya.</li>
              </ul>
            </section>
          </div>
        </div>
      </ActionForm>
    </div>
  );
}
