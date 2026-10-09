'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import SubmitButton from '@/components/ui/SubmitButton';
import { saveEmailSettingsAction, sendTestEmailAction } from '@/actions/settings';
import { EMAIL_PROVIDER_LABELS, EMAIL_PROVIDER_NOTES, EMAIL_PROVIDERS } from '@/lib/email-providers';
import type { ActionState } from '@/lib/validations';

type Provider = 'smtp' | 'resend' | 'brevo' | 'sendgrid';

export type EmailFormValues = {
  provider: Provider;
  host: string;
  port: number;
  user: string;
  from: string;
  replyTo: string;
  secure: boolean;
  hasPass: boolean;
  hasApiKey: boolean;
  apiBaseUrl: string;
};

export default function EmailSettingsForm({ initial }: { initial: EmailFormValues }) {
  const router = useRouter();
  const [saveState, saveAction] = useActionState<ActionState, FormData>(saveEmailSettingsAction, {});
  const [testState, testAction] = useActionState<ActionState, FormData>(sendTestEmailAction, {});

  const [provider, setProvider] = useState<Provider>(initial.provider);
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(String(initial.port));
  const [user, setUser] = useState(initial.user);
  const [from, setFrom] = useState(initial.from);
  const [replyTo, setReplyTo] = useState(initial.replyTo);
  const [secure, setSecure] = useState(initial.secure);
  const [apiBaseUrl, setApiBaseUrl] = useState(initial.apiBaseUrl);
  const [pass, setPass] = useState('');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    if (saveState?.ok) router.refresh();
  }, [saveState, router]);

  const isSmtp = provider === 'smtp';
  const feed = saveState?.ok ? saveState : saveState?.error ? saveState : null;

  return (
    <div className="flex flex-col gap-4">
      <form action={saveAction} className="panel shadow-soft flex flex-col gap-4 p-4">
        <h2 className="flex items-center gap-2 text-[14px] font-bold">
          <Icon name="send" size={15} className="text-muted" /> Metode Pengiriman Email
        </h2>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {EMAIL_PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              data-provider={p}
              className={`panel-soft flex items-start gap-3 p-3 text-left ${provider === p ? 'ring-2 ring-[color:var(--accent)]' : ''}`}
            >
              <Icon name={p === 'smtp' ? 'send' : 'cloud'} size={15} className="mt-0.5 text-muted" />
              <span>
                <span className="block text-[12.5px] font-bold">{EMAIL_PROVIDER_LABELS[p]}</span>
                <span className="block text-[11px] text-muted">
                  {p === 'smtp' ? 'Butuh host, username, password' : 'Cukup API key, lewat HTTPS (port 443)'}
                </span>
              </span>
            </button>
          ))}
        </div>

        <input type="hidden" name="provider" value={provider} />

        {isSmtp ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="e-host">
                  Host SMTP *
                </label>
                <input
                  id="e-host"
                  name="host"
                  className="input mono"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="mail.garuda.tv"
                />
              </div>
              <div>
                <label className="label" htmlFor="e-port">
                  Port *
                </label>
                <input
                  id="e-port"
                  name="port"
                  className="input mono"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="587"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="e-user">
                  Username SMTP *
                </label>
                <input
                  id="e-user"
                  name="user"
                  className="input"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="no-reply@garuda.tv"
                />
              </div>
              <div>
                <label className="label" htmlFor="e-pass">
                  Password / App Password {initial.hasPass ? '(biarkan kosong bila tidak diubah)' : '*'}
                </label>
                <input
                  id="e-pass"
                  name="pass"
                  type="password"
                  autoComplete="new-password"
                  className="input mono"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder={initial.hasPass ? '•••••••• (tersimpan, terenkripsi)' : 'password SMTP'}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-[12.5px]">
              <input type="checkbox" name="secure" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
              Gunakan SSL langsung (biasanya port 465). Nonaktif = STARTTLS (biasanya port 587).
            </label>
          </>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="e-apikey">
                API Key {initial.hasApiKey ? '(biarkan kosong bila tidak diubah)' : '*'}
              </label>
              <input
                id="e-apikey"
                name="apiKey"
                type="password"
                autoComplete="new-password"
                className="input mono"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={initial.hasApiKey ? '•••••••• (tersimpan, terenkripsi)' : 'tempel API key penyedia'}
              />
            </div>
            <div>
              <label className="label" htmlFor="e-apibase">
                Endpoint API kustom (opsional)
              </label>
              <input
                id="e-apibase"
                name="apiBaseUrl"
                className="input mono"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                placeholder="kosongkan untuk memakai endpoint bawaan penyedia"
              />
              <p className="hint">Isi hanya bila memakai gateway/internal mail relay yang kompatibel.</p>
            </div>
            <input type="hidden" name="host" value={host} />
            <input type="hidden" name="port" value={port} />
            <input type="hidden" name="user" value={user} />
          </>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="e-from">
              Alamat pengirim (From)
            </label>
            <input
              id="e-from"
              name="from"
              className="input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="GarudaTV Newsroom <no-reply@garuda.tv>"
            />
            <p className="hint">Kosongkan untuk memakai username SMTP sebagai pengirim.</p>
          </div>
          <div>
            <label className="label" htmlFor="e-reply">
              Reply-To (opsional)
            </label>
            <input
              id="e-reply"
              name="replyTo"
              className="input"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="redaksi@garuda.tv"
            />
          </div>
        </div>

        {(initial.hasPass || initial.hasApiKey) ? (
          <label className="flex items-center gap-2 text-[11.5px] text-muted">
            <input type="checkbox" name="clearSecret" value="on" />
            Hapus kredensial tersimpan (isi ulang dari awal)
          </label>
        ) : null}

        <ul className="flex flex-col gap-1 rounded-lg border border-line bg-panel2 p-3 text-[11.5px] text-muted">
          {EMAIL_PROVIDER_NOTES[provider].map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>

        {feed?.error ? (
          <p className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12px] text-danger">
            <Icon name="alert" size={14} className="mt-[2px] shrink-0" />
            <span>{feed.error}</span>
          </p>
        ) : null}
        {feed?.ok ? (
          <p className="rounded-lg border border-[color-mix(in_srgb,var(--ok)_40%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-3 py-2 text-[12px] text-[color:var(--ok)]">
            {feed.message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton className="btn btn-primary" pendingText="Menyimpan…">
            <Icon name="check" size={14} /> Simpan Pengaturan Email
          </SubmitButton>
          <span className="hint">Kredensial disimpan terenkripsi dan hanya dibaca server.</span>
        </div>
      </form>

      {/* Uji kirim: memakai pengaturan TERSIMPAN, jadi simpan dulu perubahan di atas */}
      <form action={testAction} className="panel shadow-soft flex flex-col gap-3 p-4" data-test-email>
        <h2 className="flex items-center gap-2 text-[14px] font-bold">
          <Icon name="send" size={15} className="text-muted" /> Kirim Email Uji
        </h2>
        <p className="text-[12px] text-muted">
          Mengirim email uji memakai pengaturan yang <strong>sudah tersimpan</strong> — simpan perubahan terlebih
          dahulu. Bila berhasil, fitur <strong>lupa kata sandi</strong> siap dipakai pengguna.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <label className="label" htmlFor="t-to">
              Kirim ke
            </label>
            <input id="t-to" name="to" type="email" className="input" placeholder="kosongkan = email akun Anda" />
          </div>
          <SubmitButton className="btn" pendingText="Mengirim…">
            <Icon name="send" size={14} /> Kirim Email Uji
          </SubmitButton>
        </div>

        {testState?.error ? (
          <p className="rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[12px] text-danger" data-test-email-result="error">
            {testState.error}
          </p>
        ) : null}
        {testState?.ok ? (
          <p className="rounded-lg border border-[color-mix(in_srgb,var(--ok)_40%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-3 py-2 text-[12px] text-[color:var(--ok)]" data-test-email-result="ok">
            {testState.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
