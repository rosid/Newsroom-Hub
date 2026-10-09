import { requireRole } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { saveCategoryAction, deleteCategoryAction } from '@/actions/settings';
import ActionForm from '@/components/forms/ActionForm';
import SettingsNav from '@/components/layout/SettingsNav';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kategori Berita' };

export default async function KategoriPage() {
  const user = await requireRole(['SUPER_ADMIN', 'ADMIN']);
  const [categories, counts] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.news.groupBy({ by: ['category'], _count: { _all: true } }),
  ]);
  const usage = new Map(counts.map((c) => [c.category, c._count._all]));

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight">Kategori Berita</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Kategori muncul di form kirim berita, filter tabulasi, dan laporan.
        </p>
      </header>

      <SettingsNav user={user} active="kategori" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="panel shadow-soft overflow-hidden">
          <h2 className="border-b border-line px-3 py-2.5 text-[13.5px] font-bold">
            Daftar Kategori <span className="ml-1 text-[12px] font-medium text-muted">{categories.length}</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="dtable">
              <thead>
                <tr>
                  <th style={{ width: 44 }} />
                  <th>Kategori</th>
                  <th className="text-right" style={{ width: 90 }}>
                    Dipakai
                  </th>
                  <th className="text-right" style={{ width: 70 }}>
                    Urutan
                  </th>
                  <th style={{ width: 88 }}>Status</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="block h-4 w-4 rounded-full border border-line" style={{ background: c.color }} />
                    </td>
                    <td className="font-medium">{c.name}</td>
                    <td className="mono text-right">{usage.get(c.name) ?? 0}</td>
                    <td className="mono text-right">{c.sortOrder}</td>
                    <td>
                      <span className={c.isActive ? 'badge badge-ok' : 'badge badge-muted'}>
                        {c.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="text-right">
                      {(usage.get(c.name) ?? 0) === 0 ? (
                        <ActionForm
                          action={deleteCategoryAction}
                          submitLabel="Hapus"
                          buttonClassName="btn btn-sm btn-danger"
                          className="contents"
                          pendingText="…"
                        >
                          <input type="hidden" name="id" value={c.id} />
                        </ActionForm>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <section className="panel shadow-soft p-4">
            <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
              <Icon name="tag" size={15} className="text-muted" /> Tambah Kategori
            </h2>
            <ActionForm action={saveCategoryAction} submitLabel="Tambah Kategori" pendingText="Menyimpan…">
              <div>
                <label className="label" htmlFor="c-name">
                  Nama kategori *
                </label>
                <input id="c-name" name="name" className="input" placeholder="Ekonomi Kreatif" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="c-color">
                    Warna
                  </label>
                  <input id="c-color" name="color" type="color" defaultValue="#64748b" className="h-9 w-full cursor-pointer rounded-md border border-line bg-panel2 p-0.5" />
                </div>
                <div>
                  <label className="label" htmlFor="c-order">
                    Urutan
                  </label>
                  <input id="c-order" name="sortOrder" type="number" className="input" defaultValue={10} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" name="isActive" defaultChecked /> Aktif
              </label>
            </ActionForm>
          </section>

          {categories.map((c) => (
            <details key={c.id} className="panel shadow-soft p-3">
              <summary className="cursor-pointer text-[13px] font-semibold">
                <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: c.color }} />
                Ubah: {c.name}
              </summary>
              <div className="mt-3">
                <ActionForm action={saveCategoryAction} submitLabel="Simpan" pendingText="Menyimpan…">
                  <input type="hidden" name="id" value={c.id} />
                  <div>
                    <label className="label">Nama *</label>
                    <input name="name" className="input" defaultValue={c.name} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Warna</label>
                      <input name="color" type="color" defaultValue={c.color} className="h-9 w-full cursor-pointer rounded-md border border-line bg-panel2 p-0.5" />
                    </div>
                    <div>
                      <label className="label">Urutan</label>
                      <input name="sortOrder" type="number" className="input" defaultValue={c.sortOrder} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-[12.5px]">
                    <input type="checkbox" name="isActive" defaultChecked={c.isActive} /> Aktif
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
