'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import Modal from '@/components/ui/Modal';
import SubmitButton from '@/components/ui/SubmitButton';
import PasswordStrengthMeter from './PasswordStrength';
import {
  createBureauUserAction,
  updateBureauUserAction,
  toggleBureauUserActiveAction,
} from '@/actions/bureau-users';
import { ROLE_LABELS } from '@/lib/constants';
import { formatDateTimeID, timeAgo } from '@/lib/utils';
import type { ActionState } from '@/lib/validations';
import type { Role } from '@prisma/client';

export type BureauMember = {
  id: string;
  name: string;
  email: string;
  role: Role;
  jobTitle: string | null;
  phone: string | null;
  isActive: boolean;
  mustChangePass: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  newsCount: number;
};

/**
 * Manajemen akun lingkup biro.
 * Produser Daerah hanya melihat anggota biro-nya (Reporter Daerah & Magang);
 * Admin/Super Admin dapat memilih biro dan role daerah lainnya.
 */
export default function BureauUsersManager({
  members,
  roleOptions,
  bureaus,
  actorRole,
  actorBureauName,
}: {
  members: BureauMember[];
  roleOptions: Role[];
  bureaus: { id: string; name: string; code: string }[];
  actorRole: Role;
  actorBureauName: string;
}) {
  const isBureauChief = actorRole === 'PRODUSER_DAERAH';
  const router = useRouter();

  const [createState, createAction] = useActionState<ActionState, FormData>(createBureauUserAction, {});
  const [editTarget, setEditTarget] = useState<BureauMember | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const [updateState, updateAction] = useActionState<ActionState, FormData>(updateBureauUserAction, {});
  const [toggleState, toggleAction] = useActionState<ActionState, FormData>(toggleBureauUserActiveAction, {});

  useEffect(() => {
    if (createState?.ok) {
      router.refresh();
      setNewPassword('');
    }
  }, [createState, router]);

  useEffect(() => {
    if (updateState?.ok) {
      setEditTarget(null);
      setNewPassword('');
      router.refresh();
    }
  }, [updateState, router]);

  useEffect(() => {
    if (toggleState?.ok) router.refresh();
  }, [toggleState, router]);

  const activeCount = members.filter((m) => m.isActive).length;
  const reporterCount = members.filter((m) => m.role === 'REPORTER_DAERAH').length;
  const internCount = members.filter((m) => m.role === 'MAGANG').length;

  return (
    <div className="flex flex-col gap-4">
      {/* Ringkasan */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="kpi">
          <span className="kpi-label">Total Akun Biro</span>
          <span className="kpi-value">{members.length}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Aktif</span>
          <span className="kpi-value">{activeCount}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Reporter Daerah</span>
          <span className="kpi-value">{reporterCount}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Magang</span>
          <span className="kpi-value">{internCount}</span>
        </div>
      </section>

      {toggleState?.error || updateState?.error ? (
        <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12px] text-danger">
          <Icon name="alert" size={14} className="mt-[2px] shrink-0" />
          <span>{toggleState?.error || updateState?.error}</span>
        </p>
      ) : null}
      {toggleState?.ok ? (
        <p className="rounded-lg border border-[color-mix(in_srgb,var(--ok)_40%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-3 py-2 text-[12px] text-[color:var(--ok)]">
          {toggleState.message}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_1fr]">
        {/* Daftar anggota biro */}
        <section className="panel shadow-soft overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
            <h2 className="text-[13.5px] font-bold">
              Akun Biro {isBureauChief ? actorBureauName : ''}
              <span className="ml-2 text-[12px] font-medium text-muted">{members.length} akun</span>
            </h2>
            <span className="text-[11px] text-muted">
              Produser Daerah mengelola akun anggota pada biro sendiri
            </span>
          </div>

          {members.length ? (
            <div className="overflow-x-auto">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Nama &amp; Email</th>
                    <th style={{ width: 140 }}>Role</th>
                    <th className="text-right" style={{ width: 70 }}>
                      Berita
                    </th>
                    <th style={{ width: 120 }}>Terakhir Masuk</th>
                    <th style={{ width: 100 }}>Status</th>
                    <th style={{ width: 150 }} />
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <p className="font-medium">{m.name}</p>
                        <p className="text-[11px] text-muted">{m.email}</p>
                        {m.jobTitle ? <p className="text-[11px] text-muted">{m.jobTitle}</p> : null}
                      </td>
                      <td>
                        <span className="badge badge-muted">{ROLE_LABELS[m.role]}</span>
                        {m.mustChangePass ? (
                          <span className="badge badge-warn mt-1 block w-fit">wajib ganti sandi</span>
                        ) : null}
                      </td>
                      <td className="mono text-right">{m.newsCount}</td>
                      <td className="text-[11.5px] text-muted">
                        {m.lastLoginAt ? timeAgo(m.lastLoginAt) : <span className="text-muted">belum pernah</span>}
                      </td>
                      <td>
                        <span className={m.isActive ? 'badge badge-ok' : 'badge badge-danger'}>
                          {m.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="text-right">
                        <span className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => {
                              setEditTarget(m);
                              setNewPassword('');
                            }}
                            data-edit-member={m.id}
                          >
                            <Icon name="edit" size={12} /> Ubah
                          </button>
                          <form action={toggleAction}>
                            <input type="hidden" name="id" value={m.id} />
                            <button
                              type="submit"
                              className={`btn btn-sm ${m.isActive ? 'btn-danger' : 'btn-ok'}`}
                              title={m.isActive ? 'Nonaktifkan akun' : 'Aktifkan akun'}
                            >
                              <Icon name={m.isActive ? 'x' : 'check'} size={12} />
                              {m.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                          </form>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-3 py-10 text-center">
              <Icon name="users" size={20} className="mx-auto text-muted" />
              <p className="mt-2 text-[13px] font-semibold">Belum ada akun di biro ini</p>
              <p className="text-[12px] text-muted">
                Buat akun {roleOptions.map((r) => ROLE_LABELS[r]).join(', ')} melalui formulir di samping.
              </p>
            </div>
          )}
        </section>

        {/* Form buat akun */}
        <section className="panel shadow-soft h-fit p-4">
          <h2 className="mb-3 flex items-center gap-2 text-[14px] font-bold">
            <Icon name="plus" size={15} className="text-muted" /> Buat Akun Baru
          </h2>

          <form action={createAction} className="flex flex-col gap-3">
            <div>
              <label className="label" htmlFor="bu-name">
                Nama lengkap *
              </label>
              <input id="bu-name" name="name" className="input" placeholder="Nama reporter/magang" />
            </div>

            <div>
              <label className="label" htmlFor="bu-email">
                Email *
              </label>
              <input id="bu-email" name="email" type="email" className="input" placeholder="nama@garuda.tv" />
            </div>

            <div>
              <label className="label" htmlFor="bu-role">
                Role *
              </label>
              <select id="bu-role" name="role" className="select" defaultValue={roleOptions[0] ?? 'REPORTER_DAERAH'}>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              {isBureauChief ? (
                <p className="hint">
                  Anda dapat membuat akun {roleOptions.map((r) => ROLE_LABELS[r]).join(', ')} untuk {actorBureauName}.
                  Akun otomatis ditempatkan di biro Anda.
                </p>
              ) : null}
            </div>

            {!isBureauChief ? (
              <div>
                <label className="label" htmlFor="bu-bureau">
                  Biro *
                </label>
                <select id="bu-bureau" name="bureauId" className="select" defaultValue="">
                  <option value="">Pilih biro…</option>
                  {bureaus.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <input type="hidden" name="bureauId" value="" />
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="bu-job">
                  Jabatan
                </label>
                <input id="bu-job" name="jobTitle" className="input" placeholder="Reporter Biro Medan" />
              </div>
              <div>
                <label className="label" htmlFor="bu-phone">
                  Telepon
                </label>
                <input id="bu-phone" name="phone" className="input" placeholder="0811…" />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="bu-pass">
                Sandi awal *
              </label>
              <input
                id="bu-pass"
                name="password"
                type="text"
                className="input mono"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="min 8 karakter, huruf besar/kecil + angka"
              />
              <div className="mt-2">
                <PasswordStrengthMeter value={newPassword} />
              </div>
              <p className="hint">
                Sampaikan sandi ini kepada yang bersangkutan. Akun baru <strong>wajib mengganti sandi</strong> saat
                pertama masuk.
              </p>
            </div>

            {createState?.error ? (
              <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12px] text-danger">
                <Icon name="alert" size={14} className="mt-[2px] shrink-0" />
                <span>{createState.error}</span>
              </p>
            ) : null}
            {createState?.ok ? (
              <p className="rounded-lg border border-[color-mix(in_srgb,var(--ok)_40%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-3 py-2 text-[12px] text-[color:var(--ok)]" data-member-created>
                {createState.message}
              </p>
            ) : null}

            <SubmitButton className="btn btn-primary" pendingText="Membuat akun…">
              <Icon name="plus" size={14} /> Buat Akun
            </SubmitButton>
          </form>
        </section>
      </div>

      {/* Modal ubah anggota */}
      <Modal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title={`Ubah Akun: ${editTarget?.name ?? ''}`}
        description="Perbarui data, tetapkan ulang sandi, atau nonaktifkan akun anggota biro."
        maxWidth="max-w-lg"
      >
        {editTarget ? (
          <form action={updateAction} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={editTarget.id} />

            <div className="panel-soft px-3 py-2 text-[12px] text-muted">
              Email <span className="font-semibold text-ink">{editTarget.email}</span> · dibuat{' '}
              {formatDateTimeID(editTarget.createdAt)} · {editTarget.newsCount} berita
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Nama lengkap *</label>
                <input name="name" className="input" defaultValue={editTarget.name} />
              </div>
              <div>
                <label className="label">Role *</label>
                <select name="role" className="select" defaultValue={editTarget.role}>
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Jabatan</label>
                <input name="jobTitle" className="input" defaultValue={editTarget.jobTitle ?? ''} />
              </div>
              <div>
                <label className="label">Telepon</label>
                <input name="phone" className="input" defaultValue={editTarget.phone ?? ''} />
              </div>
            </div>

            <div>
              <label className="label">Sandi baru (opsional — reset sandi anggota)</label>
              <input
                name="newPassword"
                className="input mono"
                placeholder="Kosongkan bila tidak diubah"
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <p className="hint">Bila diisi: minimal 8 karakter dengan huruf besar, kecil, dan angka.</p>
            </div>

            <label className="flex items-center gap-2 text-[12.5px]">
              <input type="checkbox" name="isActive" defaultChecked={editTarget.isActive} />
              Akun aktif (dapat masuk)
            </label>

            {updateState?.error ? (
              <p className="rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12px] text-danger">
                {updateState.error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setEditTarget(null)}>
                Batal
              </button>
              <SubmitButton className="btn btn-primary" pendingText="Menyimpan…">
                <Icon name="check" size={14} /> Simpan Perubahan
              </SubmitButton>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
