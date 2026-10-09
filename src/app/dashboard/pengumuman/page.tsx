import { requireUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { getAnnouncementsFor, audienceLabel } from '@/lib/announcements';
import { canCreateAnnouncement, canViewAllPools } from '@/lib/permissions';
import { PRIORITY_BADGE, PRIORITY_LABELS, ROLE_LABELS } from '@/lib/constants';
import { formatDateShortID, formatDateTimeID } from '@/lib/utils';
import { sanitizeHtml } from '@/lib/sanitize';
import { saveAnnouncementAction, toggleAnnouncementAction, deleteAnnouncementAction } from '@/actions/announcements';
import ActionForm from '@/components/forms/ActionForm';
import Icon from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pengumuman' };

export default async function PengumumanPage() {
  const user = await requireUser();
  const [items, bureaus] = await Promise.all([
    getAnnouncementsFor(user),
    prisma.bureau.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ]);
  const canManage = canCreateAnnouncement(user);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">Pengumuman Redaksi</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            {canManage
              ? 'Kelola pengumuman untuk seluruh newsroom atau biro tertentu.'
              : 'Informasi resmi dari redaksi pusat untuk Anda.'}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <section className="flex flex-col gap-3">
          {items.length ? (
            items.map((a) => (
              <article key={a.id} className={`panel shadow-soft p-4 ${a.isActive ? '' : 'opacity-70'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={PRIORITY_BADGE[a.priority]}>{PRIORITY_LABELS[a.priority]}</span>
                  {!a.isActive ? <span className="badge badge-muted">Nonaktif</span> : null}
                  <span className="badge badge-muted">
                    {audienceLabel(a, bureaus.find((b) => b.id === a.targetBureauId)?.name)}
                  </span>
                  <span className="ml-auto text-[11px] text-muted">{formatDateTimeID(a.createdAt)}</span>
                </div>
                <h2 className="mt-2 text-[15px] font-bold">{a.title}</h2>
                <div
                  className="prose-news mt-1 text-[13px] leading-relaxed text-inksoft"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(a.body) }}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-2.5 text-[11px] text-muted">
                  <span>Oleh {a.createdByName}</span>
                  {a.expiresAt ? <span>· Berakhir {formatDateShortID(a.expiresAt)}</span> : null}
                  {canManage ? (
                    <span className="ml-auto flex items-center gap-1.5">
                      <ActionForm
                        action={toggleAnnouncementAction}
                        submitLabel={a.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        buttonClassName="btn btn-sm"
                        className="contents"
                        pendingText="…"
                      >
                        <input type="hidden" name="id" value={a.id} />
                      </ActionForm>
                      {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || a.createdById === user.id) ? (
                        <ActionForm
                          action={deleteAnnouncementAction}
                          submitLabel="Hapus"
                          buttonClassName="btn btn-sm btn-danger"
                          className="contents"
                          pendingText="…"
                        >
                          <input type="hidden" name="id" value={a.id} />
                        </ActionForm>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <div className="panel shadow-soft p-10 text-center">
              <Icon name="megaphone" size={22} className="mx-auto text-muted" />
              <p className="mt-2 text-[13px] font-semibold">Belum ada pengumuman</p>
              <p className="text-[12px] text-muted">Pengumuman aktif dari redaksi akan tampil di sini.</p>
            </div>
          )}
        </section>

        {canManage ? (
          <aside className="panel shadow-soft sticky top-16 h-fit p-4">
            <h2 className="mb-3 text-[14px] font-bold">Buat Pengumuman</h2>
            <ActionForm action={saveAnnouncementAction} submitLabel="Kirim Pengumuman" pendingText="Mengirim…">
              <div>
                <label className="label" htmlFor="a-title">
                  Judul *
                </label>
                <input id="a-title" name="title" className="input" placeholder="Rapat redaksi pukul 09.00" />
              </div>
              <div>
                <label className="label" htmlFor="a-body">
                  Isi Pengumuman *
                </label>
                <textarea
                  id="a-body"
                  name="body"
                  rows={5}
                  className="textarea"
                  placeholder="Tuliskan isi pengumuman. Format sederhana (teks, tebal via editor naskah tidak diperlukan di sini)."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="a-priority">
                    Prioritas
                  </label>
                  <select id="a-priority" name="priority" className="select" defaultValue="NORMAL">
                    <option value="NORMAL">Normal</option>
                    <option value="PENTING">Penting</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="a-expires">
                    Berakhir (opsional)
                  </label>
                  <input id="a-expires" name="expiresAt" type="date" className="input" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="a-audience">
                  Audiens
                </label>
                <select id="a-audience" name="audience" className="select" defaultValue="ALL">
                  <option value="ALL">Semua pengguna</option>
                  <option value="POOL:PUSAT">Pool Pusat (redaksi pusat)</option>
                  <option value="POOL:DAERAH">Semua Biro Daerah</option>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <option key={k} value={`ROLE:${k}`}>
                      Role: {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="a-bureau">
                  Batasi ke biro tertentu (opsional)
                </label>
                <select id="a-bureau" name="targetBureauId" className="select" defaultValue="">
                  <option value="">Tidak dibatasi</option>
                  {bureaus.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" name="isActive" defaultChecked />
                Aktifkan &amp; kirim notifikasi sekarang
              </label>
              <p className="hint">
                Notifikasi lonceng dikirim ke audiens terpilih. {canViewAllPools(user) ? '' : ''}
              </p>
            </ActionForm>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
