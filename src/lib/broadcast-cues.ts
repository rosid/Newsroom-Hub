/**
 * Shortcode format siaran (broadcast rundown cues) yang disisipkan ke naskah berita.
 * File ini dipakai komponen CLIENT (editor naskah) — jangan mengimpor prisma/next/fs.
 *
 * Naskah TV dibaca sebagai rundown: penanda seperti [ANCHOR ON CAM] memisahkan bagian
 * yang dibacakan pembawa acara, footage, suara reporter, kutipan narasumber, dan standup.
 */
export type BroadcastCue = {
  /** Teks penanda yang benar-benar masuk ke naskah (uppercase, dalam kurung siku). */
  code: string;
  /** Label singkat pada tombol. */
  label: string;
  /** Penjelasan untuk tooltip. */
  hint: string;
  /** Warna aksen chip di editor & naskah tersimpan. */
  tone: 'anchor' | 'tape' | 'vo' | 'sot' | 'standup';
};

export const BROADCAST_CUES: BroadcastCue[] = [
  {
    code: '[ANCHOR ON CAM]',
    label: 'ANCHOR ON CAM',
    hint: 'Pembawa acara membaca naskah langsung di kamera (tanpa gambar).',
    tone: 'anchor',
  },
  {
    code: '[ROLL TAPE / FOOTAGE]',
    label: 'ROLL TAPE / FOOTAGE',
    hint: 'Gulirkan footage/gambar yang dilampirkan pada berita ini.',
    tone: 'tape',
  },
  {
    code: '[VO REPORTER]',
    label: 'VO REPORTER',
    hint: 'Suara reporter mengiringi gambar (voice over), bukan reporter di layar.',
    tone: 'vo',
  },
  {
    code: '[SOUNDBITE / SOT]',
    label: 'SOUNDBITE / SOT',
    hint: 'Kutipan langsung narasumber (sound on tape) — sebutkan nama & jabatannya.',
    tone: 'sot',
  },
  {
    code: '[STANDUP LIVE]',
    label: 'STANDUP LIVE',
    hint: 'Reporter berdiri di lokasi kejadian (standup / live report).',
    tone: 'standup',
  },
];

/** Kelas CSS yang dipakai chip penanda; izinkan di sanitizer (lib/sanitize.ts). */
export const CUE_CLASS = 'bc-cue';

/** Kelas varian warna per jenis penanda. */
export const cueToneClass = (tone: BroadcastCue['tone']) => `${CUE_CLASS}-${tone}`;

/** Daftar lengkap penanda (dipakai untuk petunjuk singkat & pengujian). */
export const CUE_CODES: string[] = BROADCAST_CUES.map((c) => c.code);
