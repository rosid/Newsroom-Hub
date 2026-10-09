'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import SubmitButton from '@/components/ui/SubmitButton';
import {
  reviewNewsAction,
  pushToCenterAction,
  retractPushAction,
  airNewsAction,
  retractAirNewsAction,
  unpublishNewsAction,
  deleteNewsAction,
} from '@/actions/news';
import type { ActionState } from '@/lib/validations';

type Props = {
  newsId: string;
  status: string;
  isPushed: boolean;
  isNational: boolean;
  /** Kanal tayang: ONAIR (siaran TV) & MEDSOS (sosial media). */
  airedOnair: boolean;
  airedMedsos: boolean;
  canEdit: boolean;
  canReview: boolean;
  canPush: boolean;
  canRetractPush: boolean;
  /** Boleh menandai tayang pada kanal yang BELUM tayang. */
  canAirOnair: boolean;
  canAirMedsos: boolean;
  canUnpublish: boolean;
  canDelete: boolean;
};

export default function NewsActions(props: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<null | 'review' | 'push' | 'onair' | 'medsos' | 'delete'>(null);

  const [reviewState, reviewAction] = useActionState<ActionState, FormData>(reviewNewsAction, {});
  const [pushState, pushAction] = useActionState<ActionState, FormData>(pushToCenterAction, {});
  const [airState, airAction] = useActionState<ActionState, FormData>(airNewsAction, {});
  const [retractAirState, retractAirAction] = useActionState<ActionState, FormData>(retractAirNewsAction, {});
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(deleteNewsAction, {});
  const [retractState, retractAction] = useActionState<ActionState, FormData>(retractPushAction, {});
  const [unpubState, unpubAction] = useActionState<ActionState, FormData>(unpublishNewsAction, {});

  const [tab, setTab] = useState('VERIFIED');

  const anySuccess = [reviewState, pushState, airState, retractAirState, deleteState, retractState, unpubState].find(
    (s) => s?.ok
  );
  const anyError = [reviewState, pushState, airState, retractAirState, deleteState, retractState, unpubState].find(
    (s) => s?.error
  );

  useEffect(() => {
    if (anySuccess) {
      setDialog(null);
      router.refresh();
    }
  }, [anySuccess, router]);

  return (
    <div className="flex flex-col gap-2">
      {anyError?.error ? (
        <p className="rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12px] text-danger">
          {anyError.error}
        </p>
      ) : null}
      {anySuccess?.message ? (
        <p className="rounded-lg border border-[color-mix(in_srgb,var(--ok)_40%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-3 py-2 text-[12px] text-[color:var(--ok)]">
          {anySuccess.message}
        </p>
      ) : null}

      {props.canReview ? (
        <button className="btn btn-primary w-full" onClick={() => setDialog('review')}>
          <Icon name="shield" size={14} /> Validasi Berita
        </button>
      ) : null}

      {props.canPush ? (
        <button className="btn btn-accent w-full" onClick={() => setDialog('push')}>
          <Icon name="push" size={14} /> Dorong ke Pool Pusat
        </button>
      ) : null}

      {props.canRetractPush ? (
        <form action={retractAction}>
          <input type="hidden" name="newsId" value={props.newsId} />
          <SubmitButton className="btn w-full" pendingText="Membatalkan…">
            <Icon name="back" size={14} /> Batalkan Dorongan ke Pusat
          </SubmitButton>
        </form>
      ) : null}

      {/* Kanal tayang: ONAIR (TV) & MEDSOS */}
      {props.airedOnair ? (
        <form action={retractAirAction} className="flex flex-col gap-1">
          <input type="hidden" name="newsId" value={props.newsId} />
          <input type="hidden" name="channel" value="ONAIR" />
          <p className="badge badge-brand w-fit">Sudah tayang ONAIR</p>
          <SubmitButton className="btn w-full" pendingText="Menarik…">
            <Icon name="back" size={14} /> Tarik ONAIR
          </SubmitButton>
        </form>
      ) : props.canAirOnair ? (
        <button className="btn btn-ok w-full" onClick={() => setDialog('onair')} data-air="ONAIR">
          <Icon name="broadcast" size={14} /> Tayang Onair
        </button>
      ) : null}

      {props.airedMedsos ? (
        <form action={retractAirAction} className="flex flex-col gap-1">
          <input type="hidden" name="newsId" value={props.newsId} />
          <input type="hidden" name="channel" value="MEDSOS" />
          <p className="badge badge-accent w-fit">Sudah tayang MEDSOS</p>
          <SubmitButton className="btn w-full" pendingText="Menarik…">
            <Icon name="back" size={14} /> Tarik MEDSOS
          </SubmitButton>
        </form>
      ) : props.canAirMedsos ? (
        <button className="btn btn-accent w-full" onClick={() => setDialog('medsos')} data-air="MEDSOS">
          <Icon name="broadcast" size={14} /> Tayang Medsos
        </button>
      ) : null}

      {props.canUnpublish && (props.airedOnair || props.airedMedsos) ? (
        <form action={unpubAction}>
          <input type="hidden" name="newsId" value={props.newsId} />
          <SubmitButton className="btn w-full" pendingText="Menarik semua tayang…">
            <Icon name="back" size={14} /> Tarik Semua Tayang
          </SubmitButton>
        </form>
      ) : null}

      {props.canEdit ? (
        <Link href={`/dashboard/tabulasi/berita/${props.newsId}/edit`} className="btn w-full">
          <Icon name="edit" size={14} /> Ubah Berita
        </Link>
      ) : null}

      {props.canDelete ? (
        <button className="btn btn-danger w-full" onClick={() => setDialog('delete')}>
          <Icon name="trash" size={14} /> Hapus Berita
        </button>
      ) : null}

      {/* Dialog validasi */}
      <Modal
        open={dialog === 'review'}
        onClose={() => setDialog(null)}
        title="Validasi Berita"
        description="Tentukan hasil pemeriksaan berita ini. Alasan wajib diisi untuk revisi/penolakan."
      >
        <form action={reviewAction} className="flex flex-col gap-3">
          <input type="hidden" name="newsId" value={props.newsId} />
          <input type="hidden" name="status" value={tab} />
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: 'VERIFIED', label: 'Verifikasi / Lolos', cls: 'btn-ok' },
              { key: 'REVISION', label: 'Minta Revisi', cls: '' },
              { key: 'REJECTED', label: 'Tolak', cls: 'btn-danger' },
            ].map((o) => (
              <button
                key={o.key}
                type="button"
                className={`btn btn-sm ${tab === o.key ? `btn-primary ${o.cls === 'btn-ok' ? 'btn-ok' : ''}` : o.cls}`}
                onClick={() => setTab(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div>
            <label className="label" htmlFor="review-note">
              Catatan {tab === 'VERIFIED' ? '(opsional)' : '*'}
            </label>
            <textarea
              id="review-note"
              name="note"
              rows={3}
              className="textarea"
              placeholder={
                tab === 'VERIFIED'
                  ? 'Catatan untuk reporter (opsional)'
                  : 'Contoh: lengkapi kutipan narasumber dan konfirmasi data dari dinas terkait.'
              }
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setDialog(null)}>
              Batal
            </button>
            <SubmitButton className="btn btn-primary" pendingText="Menyimpan…">
              Simpan Hasil Validasi
            </SubmitButton>
          </div>
        </form>
      </Modal>

      {/* Dialog dorong ke pusat */}
      <Modal
        open={dialog === 'push'}
        onClose={() => setDialog(null)}
        title="Dorong ke Pool Tabulasi Pusat"
        description="Berita ini akan muncul di tabulasi pusat dan siap dipertimbangkan untuk siaran nasional."
      >
        <form action={pushAction} className="flex flex-col gap-3">
          <input type="hidden" name="newsId" value={props.newsId} />
          <div>
            <label className="label" htmlFor="push-note">
              Alasan / catatan untuk redaktur pusat
            </label>
            <textarea
              id="push-note"
              name="note"
              rows={3}
              className="textarea"
              placeholder="Contoh: peristiwa berdampak nasional, ada footage eksklusif dari lokasi."
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setDialog(null)}>
              Batal
            </button>
            <SubmitButton className="btn btn-accent" pendingText="Mendorong…">
              <Icon name="push" size={14} /> Dorong ke Pusat
            </SubmitButton>
          </div>
        </form>
      </Modal>

      {/* Dialog tayang ONAIR */}
      <Modal
        open={dialog === 'onair'}
        onClose={() => setDialog(null)}
        title="Tayang ONAIR"
        description="Tandai berita sudah disiarkan di televisi (on air). Status berubah menjadi Disiarkan."
      >
        <form action={airAction} className="flex flex-col gap-3">
          <input type="hidden" name="newsId" value={props.newsId} />
          <input type="hidden" name="channel" value="ONAIR" />
          <label className="flex items-start gap-2.5 rounded-lg border border-line bg-panel2 p-3">
            <input type="checkbox" name="isNational" defaultChecked={props.isNational || props.isPushed} className="mt-0.5" />
            <span>
              <span className="block text-[12.5px] font-semibold">Siaran nasional</span>
              <span className="block text-[11.5px] text-muted">
                Berita tayang di kanal nasional dan tercatat sebagai Siaran Nasional.
              </span>
            </span>
          </label>
          <div>
            <label className="label" htmlFor="onair-note">
              Catatan penayangan (opsional)
            </label>
            <input id="onair-note" name="note" className="input" placeholder="Contoh: tayang di buletin siang" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setDialog(null)}>
              Batal
            </button>
            <SubmitButton className="btn btn-ok" pendingText="Menandai tayang…">
              <Icon name="broadcast" size={14} /> Tayang Onair
            </SubmitButton>
          </div>
        </form>
      </Modal>

      {/* Dialog tayang MEDSOS */}
      <Modal
        open={dialog === 'medsos'}
        onClose={() => setDialog(null)}
        title="Tayang MEDSOS"
        description="Tandai berita sudah diunggah/tayang di kanal sosial media."
      >
        <form action={airAction} className="flex flex-col gap-3">
          <input type="hidden" name="newsId" value={props.newsId} />
          <input type="hidden" name="channel" value="MEDSOS" />
          <div>
            <label className="label" htmlFor="medsos-note">
              Catatan (opsional)
            </label>
            <input
              id="medsos-note"
              name="note"
              className="input"
              placeholder="Contoh: Instagram & TikTok GarudaTV pukul 19.00"
            />
          </div>
          <p className="hint">
            Berita dapat tayang di kedua kanal — tandai ONAIR terpisah bila juga disiarkan di televisi.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setDialog(null)}>
              Batal
            </button>
            <SubmitButton className="btn btn-accent" pendingText="Menandai tayang…">
              <Icon name="broadcast" size={14} /> Tayang Medsos
            </SubmitButton>
          </div>
        </form>
      </Modal>

      {/* Dialog hapus */}
      <Modal
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        title="Hapus Berita"
        description="Berita, naskah, dan lampiran media akan dihapus permanen."
        maxWidth="max-w-md"
      >
        <form action={deleteAction} className="flex flex-col gap-3">
          <input type="hidden" name="newsId" value={props.newsId} />
          <p className="text-[12.5px] text-muted">
            Tindakan ini tidak dapat dibatalkan. Pastikan berita belum tayang atau sudah tidak dibutuhkan.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setDialog(null)}>
              Batal
            </button>
            <SubmitButton className="btn btn-danger" pendingText="Menghapus…">
              <Icon name="trash" size={14} /> Hapus Permanen
            </SubmitButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
