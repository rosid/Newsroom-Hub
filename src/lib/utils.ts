const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const MONTHS_SHORT_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export const startOfDay = (d: Date | string): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const endOfDay = (d: Date | string): Date => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

export const addDays = (d: Date, days: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

export function formatDateID(d: Date | string | null | undefined): string {
  if (!d) return '-';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '-';
  return `${x.getDate()} ${MONTHS_ID[x.getMonth()]} ${x.getFullYear()}`;
}

export function formatDateShortID(d: Date | string | null | undefined): string {
  if (!d) return '-';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '-';
  return `${x.getDate()} ${MONTHS_SHORT_ID[x.getMonth()]} ${x.getFullYear()}`;
}

export function formatTimeID(d: Date | string | null | undefined): string {
  if (!d) return '-';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '-';
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')} WIB`;
}

export function formatDateTimeID(d: Date | string | null | undefined): string {
  if (!d) return '-';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '-';
  return `${DAYS_ID[x.getDay()]}, ${formatDateShortID(x)} • ${formatTimeID(x)}`;
}

export const toDateInputValue = (d: Date | string | null | undefined): string => {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export function timeAgo(d: Date | string | null | undefined): string {
  if (!d) return '-';
  const x = new Date(d).getTime();
  const diff = Date.now() - x;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} menit lalu`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} hari lalu`;
  return formatDateShortID(new Date(d));
}

export type RangePreset = 'today' | '7d' | '30d' | 'month' | 'custom' | 'all';

export type DateRange = {
  preset: RangePreset;
  from: Date;
  to: Date;
  fromStr: string;
  toStr: string;
};

export const RANGE_OPTIONS: { key: RangePreset; label: string }[] = [
  { key: 'today', label: 'Hari Ini' },
  { key: '7d', label: '7 Hari' },
  { key: '30d', label: '30 Hari' },
  { key: 'month', label: 'Bulan Ini' },
  { key: 'custom', label: 'Kustom' },
  { key: 'all', label: 'Semua' },
];

/** Bangun rentang tanggal dari query string (?range=&from=&to=). */
export function parseDateRange(params: { range?: string; from?: string; to?: string }): DateRange {
  const now = new Date();
  const preset = (RANGE_OPTIONS.find((o) => o.key === params.range)?.key ?? '30d') as RangePreset;
  let from: Date;
  let to: Date = endOfDay(now);

  switch (preset) {
    case 'today':
      from = startOfDay(now);
      break;
    case '7d':
      from = startOfDay(addDays(now, -6));
      break;
    case 'month':
      from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      break;
    case 'all':
      from = new Date(2000, 0, 1);
      break;
    case 'custom': {
      const f = params.from ? new Date(`${params.from}T00:00:00`) : addDays(now, -29);
      const t = params.to ? new Date(`${params.to}T23:59:59`) : now;
      from = Number.isNaN(f.getTime()) ? startOfDay(addDays(now, -29)) : f;
      to = Number.isNaN(t.getTime()) ? endOfDay(now) : endOfDay(t);
      break;
    }
    case '30d':
    default:
      from = startOfDay(addDays(now, -29));
      break;
  }

  return {
    preset,
    from,
    to,
    fromStr: preset === 'custom' || preset === 'all' ? (params.from ?? '') : toDateInputValue(from),
    toStr: preset === 'custom' || preset === 'all' ? (params.to ?? '') : toDateInputValue(to),
  };
}

export const numberID = (n: number): string => new Intl.NumberFormat('id-ID').format(n);

export function parseTags(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map((s) => String(s)).filter(Boolean) : [];
  } catch {
    return json
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
}

/** Ekspor CSV sederhana (aman untuk Excel: dibungkus tanda kutip). */
export function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))].join('\r\n');
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const formatBytes = (n: number): string => {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

/** Bangun query string dari objek (nilai kosong/undefined dibuang). */
export function buildQuery(base: string, params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}
