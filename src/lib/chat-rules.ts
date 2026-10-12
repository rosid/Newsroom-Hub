/**
 * Aturan klaster chat Newsroom Hub — SATU SUMBER KEBENARAN, dipakai SERVER (otorisasi) dan
 * CLIENT (tampilan). Jangan mengimpor prisma/next/fs di sini karena file ini juga
 * dipakai komponen client.
 *
 * =====================================================================================
 * ALUR (perubahan Okt 2026 — versi berlaku)
 * =====================================================================================
 * BIRO:
 *   Reporter Daerah ──► Produser Daerah (biro yang sama)
 *                            │  (bila berita DIDORONG KE PUSAT — keterangan alur, bukan syarat
 *                            │   teknis: pasangan di bawah selalu bisa chat)
 *                            ▼
 *                        Koordinator Daerah ──► Produser Pusat
 *
 * PUSAT:
 *   Kontributor      ──► Koordinator Daerah ──► Produser Pusat
 *   Reporter Pusat   ──► Koordinator Liputan ──► Produser Pusat
 *
 * CATATAN PENTING (jangan diubah tanpa instruksi):
 *   • Reporter Pusat TIDAK dapat chat langsung ke Produser Pusat (harus lewat Koordinator Liputan).
 *   • Kontributor TIDAK lagi chat ke Koordinator Liputan (dialihkan ke Koordinator Daerah).
 *   • Magang TETAP chat ke Koordinator Liputan, dan — bila berada di biro — ke Produser
 *     Daerah dari biro yang sama.
 *
 * CARA MEMBACA BERKAS INI: aturan ditulis sebagai TABEL PASANGAN (`CHAT_PAIRS`) + daftar
 * pasangan yang mensyaratkan biro sama (`SAME_BUREAU_PAIRS`). `canChatBetween` dan
 * `partnerSpecsFor` keduanya DITURUNKAN dari tabel itu, sehingga menambah/menghapus satu
 * pasangan cukup di satu tempat — tidak ada aturan bertumpuk yang bisa saling berbeda.
 * =====================================================================================
 */
import type { Role } from '@prisma/client';

export const EDIT_WINDOW_MS = 60_000;
export const MAX_MESSAGE_LENGTH = 2000;
export const CHAT_POLL_MS = 5000;

export type ChatClusterKey = 'DAERAH_BIRO' | 'PUSAT' | 'KOORDINASI_DAERAH';

export type ChatClusterInfo = {
  key: ChatClusterKey;
  label: string;
  description: string;
  roles: Role[];
};

/** Klaster pusat yang saling berhubungan langsung (Reporter Pusat lewat Koordinator Liputan). */
export const PUSAT_CHAT_ROLES: Role[] = ['REPORTER_PUSAT', 'KOORDINATOR_LIPUTAN', 'PRODUSER_PUSAT'];

/** Role yang menaungi koordinasi liputan/daerah. */
export const KOORDINATOR_ROLES: Role[] = ['KOORDINATOR_LIPUTAN', 'KOORDINATOR_DAERAH'];
/** Produser (pusat & daerah). */
export const PRODUSER_ROLES: Role[] = ['PRODUSER_PUSAT', 'PRODUSER_DAERAH'];
/** Pengelola sistem/redaksi yang dapat dichat keempat role Produser/Koordinator. */
export const ADMIN_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];
/** Role yang boleh menghubungi Redaktur maupun Admin/Super Admin (eskalasi koordinasi). */
export const ESCALATION_CALLERS: Role[] = [...PRODUSER_ROLES, ...KOORDINATOR_ROLES];

/**
 * Pasangan role yang boleh saling chat (berlaku dua arah).
 * Pasangan yang butuh biro sama didaftarkan juga di `SAME_BUREAU_PAIRS` di bawah.
 */
const CHAT_PAIRS: [Role, Role][] = [
  // ---- Alur BIRO ----
  ['REPORTER_DAERAH', 'PRODUSER_DAERAH'], // + syarat biro sama
  ['MAGANG', 'PRODUSER_DAERAH'], // + syarat biro sama
  ['PRODUSER_DAERAH', 'KOORDINATOR_DAERAH'], // semua biro
  ['KOORDINATOR_DAERAH', 'PRODUSER_PUSAT'], // lanjutan alur: didorong ke pusat
  // ---- Alur PUSAT ----
  ['REPORTER_PUSAT', 'KOORDINATOR_LIPUTAN'],
  ['KOORDINATOR_LIPUTAN', 'PRODUSER_PUSAT'],
  // (Reporter Pusat ↔ Produser Pusat SENGAJA TIDAK ADA — harus lewat Koordinator Liputan)
  // ---- Kontributor ----
  ['KONTRIBUTOR', 'KOORDINATOR_DAERAH'],
  // ---- Pembimbing magang ----
  ['MAGANG', 'KOORDINATOR_LIPUTAN'],
  // ---- Eskalasi ke Redaktur ----
  ...ESCALATION_CALLERS.map((r) => ['REDAKTUR', r] as [Role, Role]),
  // ---- Eskalasi ke Admin & Super Admin ----
  ...ESCALATION_CALLERS.flatMap((r) => ADMIN_ROLES.map((a) => [a, r] as [Role, Role])),
];

/** Kunci pasangan ternormalisasi (urutan role tidak berpengaruh). */
const pairKey = (a: Role, b: Role): string => [a, b].sort().join('|');

/** Pasangan yang HANYA boleh chat bila kedua pengguna berada di biro yang sama. */
const SAME_BUREAU_PAIRS = new Set<string>([
  pairKey('REPORTER_DAERAH', 'PRODUSER_DAERAH'),
  pairKey('MAGANG', 'PRODUSER_DAERAH'),
]);

const ALLOWED_PAIRS = new Set<string>(CHAT_PAIRS.map(([a, b]) => pairKey(a, b)));
/** Pasangan yang boleh chat tanpa melihat biro — dipakai menyusun kandidat kontak. */
const ANY_BUREAU_BY_ROLE = new Map<Role, Set<Role>>();
const SAME_BUREAU_BY_ROLE = new Map<Role, Set<Role>>();
for (const [a, b] of CHAT_PAIRS) {
  const same = SAME_BUREAU_PAIRS.has(pairKey(a, b));
  const target = same ? SAME_BUREAU_BY_ROLE : ANY_BUREAU_BY_ROLE;
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as [Role, Role][]) {
    if (!target.has(x)) target.set(x, new Set<Role>());
    target.get(x)!.add(y);
  }
}

const ALL_ROLES: Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'REDAKTUR',
  'PRODUSER_PUSAT',
  'REPORTER_PUSAT',
  'PRODUSER_DAERAH',
  'REPORTER_DAERAH',
  'KONTRIBUTOR',
  'MAGANG',
  'KOORDINATOR_LIPUTAN',
  'KOORDINATOR_DAERAH',
];

/** Ringkasan aturan untuk ditampilkan di halaman chat. */
export const CHAT_RULE_SUMMARIES: { title: string; detail: string }[] = [
  {
    title: 'Biro · Reporter Daerah → Produser Daerah',
    detail: 'Reporter Daerah chat dengan Produser Daerah dari biro yang sama (tidak lintas biro).',
  },
  {
    title: 'Biro · Didorong ke Pusat',
    detail:
      'Berita biro yang didorong ke pusat berlanjut ke Koordinator Daerah, lalu ke Produser Pusat. Koordinator Daerah dan Produser Pusat selalu dapat saling chat.',
  },
  {
    title: 'Pusat · Reporter Pusat → Koordinator Liputan → Produser Pusat',
    detail: 'Reporter Pusat berkoordinasi lewat Koordinator Liputan, lalu ke Produser Pusat.',
  },
  {
    title: 'Pusat · Kontributor → Koordinator Daerah → Produser Pusat',
    detail: 'Kontributor berkoordinasi dengan Koordinator Daerah, yang meneruskan ke Produser Pusat.',
  },
  {
    title: 'Eskalasi ke Redaktur / Admin / Super Admin',
    detail:
      'Redaktur, Admin, dan Super Admin dapat dichat oleh Produser Pusat, Produser Daerah, Koordinator Liputan, dan Koordinator Daerah.',
  },
  {
    title: 'Magang',
    detail:
      'Magang chat dengan Koordinator Liputan; bila berada di biro, juga dengan Produser Daerah dari biro yang sama.',
  },
];

export const CHAT_CLUSTERS: ChatClusterInfo[] = [
  {
    key: 'DAERAH_BIRO',
    label: 'Klaster 1 · Biro Daerah',
    description: 'Reporter Daerah ↔ Produser Daerah dari biro yang sama (tidak lintas biro).',
    roles: ['REPORTER_DAERAH', 'PRODUSER_DAERAH'],
  },
  {
    key: 'PUSAT',
    label: 'Klaster 2 · Pusat',
    description: 'Reporter Pusat ↔ Koordinator Liputan ↔ Produser Pusat (Reporter Pusat tidak langsung ke Produser Pusat).',
    roles: PUSAT_CHAT_ROLES,
  },
  {
    key: 'KOORDINASI_DAERAH',
    label: 'Klaster 3 · Koordinasi Daerah',
    description: 'Produser Daerah (semua biro) ↔ Koordinator Daerah, diteruskan ke Produser Pusat.',
    roles: ['PRODUSER_DAERAH', 'KOORDINATOR_DAERAH', 'PRODUSER_PUSAT'],
  },
];

export type ChatActor = {
  id: string;
  role: Role;
  bureauId: string | null;
};

/** Daftar klaster yang memuat role tertentu (bisa lebih dari satu, mis. Produser Daerah). */
export function clustersOfRole(role: Role): ChatClusterKey[] {
  return CHAT_CLUSTERS.filter((c) => c.roles.includes(role)).map((c) => c.key);
}

/**
 * True bila role punya lawan chat. Semua role saat ini memiliki lawan chat; fungsi ini
 * dipertahankan sebagai pengaman bila kelak ada role baru yang belum diatur.
 */
export function isChatRole(role: Role): boolean {
  const probe = (otherRole: Role): boolean =>
    canChatBetween(
      { id: 'a', role, bureauId: 'biro-1' },
      { id: 'b', role: otherRole, bureauId: 'biro-1' }
    );
  return ALL_ROLES.some((r) => r !== role && probe(r));
}

/**
 * Boleh chat atau tidak (aturan murni, tanpa DB). Aturan ini ditegakkan ulang di server
 * memakai data pengguna dari DATABASE (bukan dari input klien).
 * Relasi bersifat dua arah: bila A boleh menghubungi B, B juga boleh membalas A.
 */
export function canChatBetween(me: ChatActor, other: ChatActor): boolean {
  if (!me.id || !other.id || me.id === other.id) return false;
  const key = pairKey(me.role, other.role);
  if (!ALLOWED_PAIRS.has(key)) return false;
  if (SAME_BUREAU_PAIRS.has(key)) {
    return Boolean(me.bureauId) && me.bureauId === other.bureauId;
  }
  return true;
}

/**
 * Kandidat lawan chat (superset) untuk menyusun query efisien.
 * Diturunkan dari `CHAT_PAIRS` yang sama dengan `canChatBetween`, lalu hasil query SELALU
 * disaring lagi dengan `canChatBetween` (lihat getChatPartners) — jadi kekeliruan di sini
 * tidak dapat membuka akses yang tidak diizinkan, hanya memengaruhi efisiensi query.
 */
export type PartnerSpec = { roles: Role[]; requireSameBureau?: boolean };

export function partnerSpecsFor(me: ChatActor): PartnerSpec[] {
  const specs: PartnerSpec[] = [];
  const any = [...(ANY_BUREAU_BY_ROLE.get(me.role) ?? [])].filter((r) => r !== me.role);
  const same = [...(SAME_BUREAU_BY_ROLE.get(me.role) ?? [])].filter((r) => r !== me.role);
  if (any.length) specs.push({ roles: any });
  if (same.length) specs.push({ roles: same, requireSameBureau: true });
  return specs;
}

/** Apakah pesan masih boleh diedit: hanya pengirimnya, dalam 60 detik pertama. */
export function canEditMessage(
  message: { senderId: string; createdAt: Date | string },
  me: { id: string },
  now: number = Date.now()
): boolean {
  if (message.senderId !== me.id) return false;
  const created = new Date(message.createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  return now - created <= EDIT_WINDOW_MS;
}

/** Sisa waktu (detik) untuk mengedit pesan; 0 = tidak bisa lagi. */
export function editSecondsLeft(createdAt: Date | string, now: number = Date.now()): number {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return 0;
  const left = EDIT_WINDOW_MS - (now - created);
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/**
 * Bersihkan isi pesan: hanya TEKS + emoticon.
 * - Tag HTML dibuang (mencegah gambar/tautan HTML disisipkan sebagai markup),
 * - `javascript:`/data-URL dihilangkan,
 * - spasi berlebih dirapikan, panjang dibatasi.
 */
export function sanitizeChatText(raw: string): string {
  let text = String(raw ?? '');
  // Hanya buang rangkaian yang benar-benar berbentuk tag HTML (diawali huruf setelah '<'
  // atau '</'), sehingga emoticon seperti "<3" dan perbandingan "3 > 2" tidak ikut hilang.
  text = text.replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(\s[^>]*)?\/?>/g, ' ');
  text = text.replace(/javascript:/gi, '').replace(/data:image\/[a-z+.-]*/gi, '');
  text = text.replace(/\u0000/g, '');
  // Rapikan spasi ganda yang tersisa setelah tag HTML dibuang (spasi ganda di
  // tengah pesan tidak punya arti di chat).
  text = text.replace(/[ \t]{2,}/g, ' ');
  text = text.replace(/\n{4,}/g, '\n\n\n');
  return text.trim();
}

export type ChatTextCheck = { ok: true; body: string } | { ok: false; error: string };

/** Validasi isi pesan (dipakai server action & route API). */
export function validateChatText(raw: string): ChatTextCheck {
  const body = sanitizeChatText(raw);
  if (!body) return { ok: false, error: 'Pesan tidak boleh kosong.' };
  if (body.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `Pesan maksimal ${MAX_MESSAGE_LENGTH} karakter (saat ini ${body.length}).` };
  }
  // Pesan wajib memuat setidaknya satu huruf/angka/emoticon — menolak kiriman berisi markup saja
  if (!/[\p{L}\p{N}\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(body)) {
    return { ok: false, error: 'Pesan harus berisi teks atau emoticon.' };
  }
  return { ok: true, body };
}

/** Emoticon yang tersedia di pemilih (disisipkan sebagai teks biasa). */
export const CHAT_EMOJIS = [
  '🙂', '😀', '😄', '😁', '😊', '😉', '😎', '🤔', '😅', '😢', '😮', '😡',
  '👍', '👎', '👏', '🙏', '💪', '✌️', '👌', '🤝', '🫡', '🙋',
  '❤️', '🔥', '⭐', '✅', '❌', '⚠️', '❗', '❓',
  '📌', '📝', '📷', '🎥', '🎤', '📺', '🗞️', '📡', '⏰', '🚗', '🏢', '🗺️',
  '☕', '🍽️', '😂', '🤣', '😴', '🤦', '🙈', '💡', '📞', '✉️',
];
