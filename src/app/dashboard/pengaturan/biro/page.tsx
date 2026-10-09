import { requireRole } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { saveBureauAction } from '@/actions/settings';
import ActionForm from '@/components/forms/ActionForm';
import SettingsNav from '@/components/layout/SettingsNav';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Biro Daerah' };

export default async function BiroPage() {
  const user = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const bureaus = await prisma.bureau.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { users: true, news: true } } },
  });

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight">Biro Daerah (Network)</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Setiap biro memiliki pool tabulasi sendiri. Reporter/produser biro hanya melihat tabulasi daerahnya + tabulasi pusat.
        </p>
      </header>

      <SettingsNav user={user} active="biro" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
        <section className="panel shadow-soft overflow-hidden">
          <h2 className="border-b border-line px-3 py-2.5 text-[13.5px] font-bold">
            Daftar Biro <span className="ml-1 text-[12px] font-medium text-muted">{bureaus.length} biro</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="dtable">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Kode</th>
                  <th>Biro</th>
                  <th>Wilayah</th>
                  <th className="text-right">Pengguna</th>
                  <th className="text-right">Berita</th>
                  <th style={{ width: 90 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {bureaus.map((b) => (
                  <tr key={b.id}>
                    <td className="mono">{b.code}</td>
                    <td>
                      <p className="font-medium">{b.name}</p>
                      <p className="text-[11px] text-muted">{b.city || '-'}</p>
                    </td>
                    <td className="text-[12px]">{b.region}</td>
                    <td className="mono text-right">{b._count.users}</td>
                    <td className="mono text-right">{b._count.news}</td>
                    <td>
                      <span className={b.isActive ? 'badge badge-ok' : 'badge badge-muted'}>
                        {b.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                  </tr>
                ))}
                {!bureaus.length ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted">
                      Belum ada biro daerah.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <section className="panel shadow-soft p-4">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
              <Icon name="building" size={15} className="text-muted" /> Tambah Biro
            </h2>
            <ActionForm action={saveBureauAction} submitLabel="Tambah Biro" pendingText="Menyimpan…">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="b-code">
                    Kode *
                  </label>
                  <input id="b-code" name="code" className="input mono" placeholder="MDN" maxLength={8} />
                </div>
                <div>
                  <label className="label" htmlFor="b-city">
                    Kota
                  </label>
                  <input id="b-city" name="city" className="input" placeholder="Medan" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="b-name">
                  Nama biro *
                </label>
                <input id="b-name" name="name" className="input" placeholder="Biro Medan" />
              </div>
              <div>
                <label className="label" htmlFor="b-region">
                  Provinsi / wilayah *
                </label>
                <input id="b-region" name="region" className="input" placeholder="Sumatera Utara" />
              </div>
              <div>
                <label className="label" htmlFor="b-address">
                  Alamat
                </label>
                <input id="b-address" name="address" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="b-phone">
                  Telepon
                </label>
                <input id="b-phone" name="phone" className="input" />
              </div>
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" name="isActive" defaultChecked /> Aktif
              </label>
            </ActionForm>
          </section>

          {bureaus.map((b) => (
            <details key={b.id} className="panel shadow-soft p-3">
              <summary className="cursor-pointer text-[13px] font-semibold">
                Ubah: {b.name} <span className="mono text-muted">({b.code})</span>
              </summary>
              <div className="mt-3">
                <ActionForm action={saveBureauAction} submitLabel="Simpan Perubahan" pendingText="Menyimpan…">
                  <input type="hidden" name="id" value={b.id} />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Kode *</label>
                      <input name="code" className="input mono" defaultValue={b.code} maxLength={8} />
                    </div>
                    <div>
                      <label className="label">Kota</label>
                      <input name="city" className="input" defaultValue={b.city ?? ''} />
                    </div>
                  </div>
                  <div>
                    <label className="label">Nama biro *</label>
                    <input name="name" className="input" defaultValue={b.name} />
                  </div>
                  <div>
                    <label className="label">Provinsi / wilayah *</label>
                    <input name="region" className="input" defaultValue={b.region} />
                  </div>
                  <div>
                    <label className="label">Alamat</label>
                    <input name="address" className="input" defaultValue={b.address ?? ''} />
                  </div>
                  <div>
                    <label className="label">Telepon</label>
                    <input name="phone" className="input" defaultValue={b.phone ?? ''} />
                  </div>
                  <label className="flex items-center gap-2 text-[12.5px]">
                    <input type="checkbox" name="isActive" defaultChecked={b.isActive} /> Aktif
                  </label>
                </ActionForm>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
