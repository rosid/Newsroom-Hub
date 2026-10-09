/**
 * Aturan chat Newsroom Hub — SATU SUMBER KEBENARAN, dipakai SERVER (otorisasi) dan
 * CLIENT (tampilan). Jangan mengimpor prisma/next/fs di sini karena file ini juga
 * dipakai komponen client.
 *
 * Klaster utama:
 * 1. DAERAH_BIRO       : Reporter Daerah ↔ Produser Daerah **biro yang sama**
 *                        (tidak lintas biro; sesama reporter/produser tidak boleh).
 * 2. PUSAT             : Reporter Pusat ↔ Koordinator Liputan ↔ Produser Pusat.
 * 3. KOORDINASI_DAERAH : Produser Daerah (semua biro) ↔ Koordinator Daerah.
 *
 * Penghubung (eskalasi koordinasi):
 * 4. Redaktur dapat dichat oleh Produser Pusat, Produser Daerah, Koordinator Liputan,
 *    dan Koordinator Daerah.
 * 5. Admin & Super Admin dapat dichat oleh keempat role Produser/Koordinator di atas.
 * 6. Kontributor & Magang dapat chat dengan Koordinator Liputan; khusus Magang yang
 *    berada di biro, juga dapat chat dengan Produser Daerah **biro yang sama**.
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

export const PUSAT_CHAT_ROLES: Role[] = ['REPORTER_PUSAT', 'KOORDINATOR_LIPUTAN', 'PRODUSER_PUSAT'];

/** Role yang menaungi koordinasi liputan/daerah. */
export const KOORDINATOR_ROLES: Role[] = ['KOORDINATOR_LIPUTAN', 'KOORDINATOR_DAERAH'];
/** Produser (pusat & daerah). */
export const PRODUSER_ROLES: Role[] = ['PRODUSER_PUSAT', 'PRODUSER_DAERAH'];
/** Pengelola sistem/redaksi yang dapat dichat keempat role Produser/Koordinator. */
export const ADMIN_ROLES: Role[] = ['ADMIN', 'SUPER_ADMIN'];
/** Role yang berkoordinasi dengan Koordinator Liputan (kontributor & magang). */
export const PEMBIMBING_ROLES: Role[] = ['KONTRIBUTOR', 'MAGANG'];
/** Role yang boleh menghubungi Redaktur maupun Admin/Super Admin. */
export const ESCALATION_CALLERS: Role[] = [...PRODUSER_ROLES, ...KOORDINATOR_ROLES];

/** Ringkasan aturan untuk ditampilkan di halaman chat. */
export const CHAT_RULE_SUMMARIES: { title: string; detail: string }[] = [
  {
    title: 'Klaster 1 · Biro Daerah',
    detail: 'Reporter Daerah ↔ Produser Daerah dari biro yang sama (tidak lintas biro).',
  },
  {
    title: 'Klaster 2 · Pusat',
    detail: 'Reporter Pusat, Koordinator Liputan, dan Produser Pusat saling chat.',
  },
  {
    title: 'Klaster 3 · Koordinasi Daerah',
    detail: 'Produser Daerah (semua biro) ↔ Koordinator Daerah.',
  },
  {
    title: 'Eskalasi ke Redaktur',
    detail: 'Redaktur dapat dichat oleh Produser Pusat, Produser Daerah, Koordinator Liputan, dan Koordinator Daerah.',
  },
  {
    title: 'Eskalasi ke Admin & Super Admin',
    detail: 'Admin dan Super Admin dapat dichat oleh Produser Pusat, Produser Daerah, Koordinator Liputan, dan Koordinator Daerah.',
  },
  {
    title: 'Kontributor & Magang',
    detail:
      'Dapat chat dengan Koordinator Liputan. Magang yang berada di biro juga dapat chat dengan Produser Daerah dari biro yang sama.',
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
    description: 'Reporter Pusat, Koordinator Liputan, dan Produser Pusat.',
    roles: PUSAT_CHAT_ROLES,
  },
  {
    key: 'KOORDINASI_DAERAH',
    label: 'Klaster 3 · Koordinasi Daerah',
    description: 'Produser Daerah (semua biro) ↔ Koordinator Daerah.',
    roles: ['PRODUSER_DAERAH', 'KOORDINATOR_DAERAH'],
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
 * True bila role punya lawan chat. Sejak aturan eskalasi & kontributor/magang ditambahkan,
 * SEMUA role memiliki lawan chat — fungsi ini dipertahankan untuk kompatibilitas dan
 * pengaman bila kelak ada role baru yang belum diatur.
 */
export function isChatRole(role: Role): boolean {
  const probe = (otherRole: Role): boolean =>
    canChatBetween(
      { id: 'a', role, bureauId: 'biro-1' },
      { id: 'b', role: otherRole, bureauId: 'biro-1' }
    );
  const all: Role[] = [
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
  return all.some((r) => r !== role && probe(r));
}

/**
 * Boleh chat atau tidak (aturan murni, tanpa DB). Aturan ini ditegakkan ulang di server
 * memakai data pengguna dari DATABASE (bukan dari input klien).
 * Relasi bersifat dua arah: bila A boleh menghubungi B, B juga boleh membalas A.
 */
export function canChatBetween(me: ChatActor, other: ChatActor): boolean {
  if (!me.id || !other.id || me.id === other.id) return false;
  const mine = me.role;
  const theirs = other.role;

  // --- Klaster 2: seluruh pasangan role pusat ---
  if (PUSAT_CHAT_ROLES.includes(mine) && PUSAT_CHAT_ROLES.includes(theirs)) return true;

  // --- Klaster 3: Produser Daerah (semua biro) ↔ Koordinator Daerah ---
  if (
    (mine === 'PRODUSER_DAERAH' && theirs === 'KOORDINATOR_DAERAH') ||
    (mine === 'KOORDINATOR_DAERAH' && theirs === 'PRODUSER_DAERAH')
  ) {
    return true;
  }

  // --- Klaster 1: Reporter Daerah ↔ Produser Daerah pada BIRO YANG SAMA ---
  const reporterProduserDaerah =
    (mine === 'REPORTER_DAERAH' && theirs === 'PRODUSER_DAERAH') ||
    (mine === 'PRODUSER_DAERAH' && theirs === 'REPORTER_DAERAH');
  if (reporterProduserDaerah) {
    return Boolean(me.bureauId) && me.bureauId === other.bureauId;
  }

  // --- Eskalasi: Redaktur dichat oleh Produser/Koordinator ---
  if (
    (mine === 'REDAKTUR' && ESCALATION_CALLERS.includes(theirs)) ||
    (theirs === 'REDAKTUR' && ESCALATION_CALLERS.includes(mine))
  ) {
    return true;
  }

  // --- Eskalasi: Admin & Super Admin dichat oleh Produser/Koordinator ---
  if (
    (ADMIN_ROLES.includes(mine) && ESCALATION_CALLERS.includes(theirs)) ||
    (ADMIN_ROLES.includes(theirs) && ESCALATION_CALLERS.includes(mine))
  ) {
    return true;
  }

  // --- Kontributor & Magang ↔ Koordinator Liputan ---
  if (
    (PEMBIMBING_ROLES.includes(mine) && theirs === 'KOORDINATOR_LIPUTAN') ||
    (PEMBIMBING_ROLES.includes(theirs) && mine === 'KOORDINATOR_LIPUTAN')
  ) {
    return true;
  }

  // --- Magang di biro ↔ Produser Daerah biro yang sama ---
  const magangProduserDaerah =
    (mine === 'MAGANG' && theirs === 'PRODUSER_DAERAH') ||
    (mine === 'PRODUSER_DAERAH' && theirs === 'MAGANG');
  if (magangProduserDaerah) {
    return Boolean(me.bureauId) && me.bureauId === other.bureauId;
  }

  return false;
}

/**
 * Kandidat lawan chat (superset) untuk menyusun query efisien.
 * Hasilnya SELALU disaring lagi dengan `canChatBetween`, sehingga kekeliruan di sini
 * tidak dapat membuka akses yang tidak diizinkan — hanya memengaruhi efisiensi query.
 */
export type PartnerSpec = { roles: Role[]; requireSameBureau?: boolean };

export function partnerSpecsFor(me: ChatActor): PartnerSpec[] {
  const specs: PartnerSpec[] = [];
  const mine = me.role;

  if (PUSAT_CHAT_ROLES.includes(mine)) {
    specs.push({ roles: PUSAT_CHAT_ROLES.filter((r) => r !== mine) });
  }
  if (mine === 'REPORTER_DAERAH') specs.push({ roles: ['PRODUSER_DAERAH'], requireSameBureau: true });
  if (mine === 'PRODUSER_DAERAH') {
    specs.push({ roles: ['REPORTER_DAERAH'], requireSameBureau: true });
    specs.push({ roles: ['KOORDINATOR_DAERAH'] });
    specs.push({ roles: ['MAGANG'], requireSameBureau: true });
    specs.push({ roles: [...ESCALATION_CALLERS.filter((r) => r !== 'PRODUSER_DAERAH'), 'REDAKTUR', ...ADMIN_ROLES] });
  }
  if (mine === 'KOORDINATOR_DAERAH') {
    specs.push({ roles: ['PRODUSER_DAERAH'] });
    specs.push({ roles: ['REDAKTUR', ...ADMIN_ROLES] });
  }
  if (mine === 'KOORDINATOR_LIPUTAN') {
    specs.push({ roles: ['REDAKTUR', ...ADMIN_ROLES, ...PEMBIMBING_ROLES] });
  }
  if (mine === 'PRODUSER_PUSAT') {
    specs.push({ roles: ['REDAKTUR', ...ADMIN_ROLES] });
  }
  if (PEMBIMBING_ROLES.includes(mine)) {
    specs.push({ roles: ['KOORDINATOR_LIPUTAN'] });
    if (mine === 'MAGANG') specs.push({ roles: ['PRODUSER_DAERAH'], requireSameBureau: true });
  }
  if (mine === 'REDAKTUR' || ADMIN_ROLES.includes(mine)) {
    specs.push({ roles: [...ESCALATION_CALLERS] });
  }

  // Buang duplikat role dalam satu spec (mis. saat me.role ikut terdaftar)
  return specs
    .map((sp) => ({ ...sp, roles: [...new Set(sp.roles.filter((r) => r !== mine))] }))
    .filter((sp) => sp.roles.length > 0);
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
