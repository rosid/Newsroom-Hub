import { requireRole } from '@/lib/session';
import { getEditorialSettings, getOrgSettings, getSeoSettings } from '@/lib/settings';
import {
  updateEditorialSettingsAction,
  updateOrgSettingsAction,
  updateSeoSettingsAction,
} from '@/actions/settings';
import ActionForm from '@/components/forms/ActionForm';
import ColorPresets from '@/components/forms/ColorPresets';
import SettingsNav from '@/components/layout/SettingsNav';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pengaturan' };

export default async function PengaturanPage() {
  const user = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const [org, seo, editorial] = await Promise.all([getOrgSettings(), getSeoSettings(), getEditorialSettings()]);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight">Master Pengaturan</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Identitas newsroom, warna tema, SEO, dan kebijakan editorial. Perubahan berlaku untuk seluruh pengguna.
        </p>
      </header>

      <SettingsNav user={user} active="umum" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="panel shadow-soft p-4">
          <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
            <Icon name="cog" size={15} className="text-muted" /> Identitas Newsroom
          </h2>
          <ActionForm action={updateOrgSettingsAction} submitLabel="Simpan Identitas" pendingText="Menyimpan…">
            <div>
              <label className="label" htmlFor="siteName">
                Nama situs *
              </label>
              <input id="siteName" name="siteName" className="input" defaultValue={org.siteName} />
            </div>
            <div>
              <label className="label" htmlFor="tagline">
                Tagline
              </label>
              <input id="tagline" name="tagline" className="input" defaultValue={org.tagline} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="companyName">
                  Nama perusahaan
                </label>
                <input id="companyName" name="companyName" className="input" defaultValue={org.companyName} />
              </div>
              <div>
                <label className="label" htmlFor="phone">
                  Telepon redaksi
                </label>
                <input id="phone" name="phone" className="input" defaultValue={org.phone} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="email">
                  Email redaksi
                </label>
                <input id="email" name="email" type="email" className="input" defaultValue={org.email} />
              </div>
              <div>
                <label className="label" htmlFor="logoWidth">
                  Lebar logo (px)
                </label>
                <input
                  id="logoWidth"
                  name="logoWidth"
                  type="number"
                  min={16}
                  max={320}
                  className="input"
                  defaultValue={org.logoWidth}
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="address">
                Alamat
              </label>
              <input id="address" name="address" className="input" defaultValue={org.address} />
            </div>
            <div>
              <label className="label" htmlFor="logoUrl">
                URL logo (opsional)
              </label>
              <input
                id="logoUrl"
                name="logoUrl"
                className="input"
                placeholder="https://…/logo.png"
                defaultValue={org.logoUrl}
              />
              <p className="hint">Kosongkan untuk memakai lambang huruf “G” bawaan.</p>
            </div>
            <div>
              <label className="label" htmlFor="defaultTheme">
                Tema bawaan
              </label>
              <select id="defaultTheme" name="defaultTheme" className="select" defaultValue={org.defaultTheme}>
                <option value="dark">Gelap (newsroom)</option>
                <option value="light">Terang</option>
              </select>
            </div>
          </ActionForm>
        </section>

        <div className="flex flex-col gap-4">
          <section className="panel shadow-soft p-4">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
              <Icon name="image" size={15} className="text-muted" /> Warna Tema
            </h2>
            <ActionForm action={updateOrgSettingsAction} submitLabel="Simpan Warna" pendingText="Menyimpan…">
              <ColorPresets primary={org.primaryColor} accent={org.accentColor} />
            </ActionForm>
          </section>

          <section className="panel shadow-soft p-4">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
              <Icon name="search" size={15} className="text-muted" /> SEO &amp; Metadata
            </h2>
            <ActionForm action={updateSeoSettingsAction} submitLabel="Simpan SEO" pendingText="Menyimpan…">
              <div>
                <label className="label" htmlFor="seo-title">
                  Judul halaman
                </label>
                <input id="seo-title" name="title" className="input" defaultValue={seo.title} />
              </div>
              <div>
                <label className="label" htmlFor="seo-desc">
                  Deskripsi
                </label>
                <textarea id="seo-desc" name="description" rows={3} className="textarea" defaultValue={seo.description} />
              </div>
            </ActionForm>
          </section>

          <section className="panel shadow-soft p-4">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
              <Icon name="shield" size={15} className="text-muted" /> Kebijakan Editorial
            </h2>
            <ActionForm action={updateEditorialSettingsAction} submitLabel="Simpan Kebijakan" pendingText="Menyimpan…">
              <label className="flex items-start gap-2.5">
                <input type="checkbox" name="requireVerification" defaultChecked={editorial.requireVerification} className="mt-0.5" />
                <span>
                  <span className="block text-[12.5px] font-semibold">Wajib validasi produser sebelum disiarkan</span>
                  <span className="block text-[11.5px] text-muted">
                    Berita berstatus Menunggu Persetujuan harus diverifikasi produser terlebih dahulu.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2.5">
                <input type="checkbox" name="breakingAutoNotify" defaultChecked={editorial.breakingAutoNotify} className="mt-0.5" />
                <span>
                  <span className="block text-[12.5px] font-semibold">Notifikasi otomatis breaking news</span>
                  <span className="block text-[11.5px] text-muted">
                    Setiap breaking news dari reporter langsung memicu notifikasi ke redaktur &amp; produser.
                  </span>
                </span>
              </label>
            </ActionForm>
          </section>
        </div>
      </div>
    </div>
  );
}
