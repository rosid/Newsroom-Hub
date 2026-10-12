import { NewsStatus, NewsKind, Pool, type Prisma, type Role } from '@prisma/client';
import { prisma } from './prisma';
import { newsVisibilityWhere, canViewAllPools, type PoolTab } from './permissions';
import type { CurrentUser } from './session';
import { endOfDay, startOfDay, parseDateRange, parseTags, type DateRange } from './utils';
import { mediaSrc } from './storage';
import { getActiveAnnouncementsFor } from './announcements';
import { isNewsKind } from './news-kinds';

export type TabKey = PoolTab['key'];

export type TabulasiFilters = {
  q?: string;
  status?: string;
  category?: string;
  kind?: string;
  province?: string;
  bureauId?: string;
  tag?: string;
  range: DateRange;
};

const NEWS_STATUSES: NewsStatus[] = ['DRAFT', 'PENDING', 'REVISION', 'VERIFIED', 'REJECTED', 'PUBLISHED'];

export function tabWhere(user: CurrentUser, tab: TabKey, filters: TabulasiFilters): Prisma.NewsWhereInput {
  const parts: Prisma.NewsWhereInput[] = [newsVisibilityWhere(user)];

  switch (tab) {
    case 'pusat':
      parts.push({ OR: [{ originPool: Pool.PUSAT }, { isPushedToCenter: true }] });
      break;
    case 'daerah':
      parts.push({ originPool: Pool.DAERAH, authorBureauId: { not: null } });
      if (user.bureauId && !canViewAllPools(user)) parts.push({ authorBureauId: user.bureauId });
      break;
    case 'saya':
      parts.push({ authorId: user.id });
      break;
    case 'pending':
      parts.push({ status: NewsStatus.PENDING });
      break;
    case 'nasional':
      parts.push({ isNational: true });
      break;
  }

  // Filter tanggal (berdasarkan waktu kirim)
  parts.push({ createdAt: { gte: filters.range.from, lte: filters.range.to } });

  if (filters.status && NEWS_STATUSES.includes(filters.status as NewsStatus)) {
    parts.push({ status: filters.status as NewsStatus });
  }
  if (filters.kind && isNewsKind(filters.kind)) {
    parts.push({ kind: filters.kind as NewsKind });
  }
  if (filters.category) parts.push({ category: filters.category });
  if (filters.province) parts.push({ province: filters.province });
  if (filters.bureauId && (canViewAllPools(user) || user.bureauId === filters.bureauId)) {
    parts.push({ authorBureauId: filters.bureauId });
  }
  if (filters.tag) parts.push({ tags: { contains: `"${filters.tag}"` } });
  if (filters.q) {
    const q = filters.q.trim();
    parts.push({
      OR: [
        { title: { contains: q } },
        { summary: { contains: q } },
        { location: { contains: q } },
        { code: { contains: q } },
        { script: { contains: q } },
      ],
    });
  }

  return { AND: parts };
}

export type NewsListItem = Prisma.NewsGetPayload<{
  include: {
    author: { select: { id: true; name: true; role: true } };
    bureau: { select: { id: true; name: true; code: true } };
    media: { select: { id: true; url: true; storageKey: true; mimeType: true; filename: true; size: true } };
    _count: { select: { media: true } };
  };
}>;

/** PerPage standar untuk tabel (pagination nomor) maupun kartu (load more). */
export const TABULASI_PER_PAGE = 20;

export async function getTabulation(
  user: CurrentUser,
  tab: TabKey,
  filters: TabulasiFilters,
  page = 1,
  perPage: number = TABULASI_PER_PAGE
): Promise<{ items: NewsListItem[]; total: number; pages: number; page: number; perPage: number }> {
  const where = tabWhere(user, tab, filters);
  const safePage = Math.max(1, Math.min(page, 1000));
  const [total, items] = await Promise.all([
    prisma.news.count({ where }),
    prisma.news.findMany({
      where,
      include: {
        author: { select: { id: true, name: true, role: true } },
        bureau: { select: { id: true, name: true, code: true } },
        // hanya berkas pertama yang dibutuhkan untuk thumbnail kartu
        media: {
          take: 4,
          orderBy: { createdAt: 'asc' },
          select: { id: true, url: true, storageKey: true, mimeType: true, filename: true, size: true },
        },
        _count: { select: { media: true } },
      },
      orderBy: [{ kind: 'desc' }, { createdAt: 'desc' }],
      skip: (safePage - 1) * perPage,
      take: perPage,
    }),
  ]);
  return { items, total, pages: Math.max(1, Math.ceil(total / perPage)), page: safePage, perPage };
}

// ===================== LISTING BERITA (berita biro yang didorong ke pusat) =====================

/**
 * Satu kelompok berita untuk halaman Listing Berita (dikelompokkan per biro).
 * `bureauName`/`bureauCode` null = berita tanpa biro (mis. kiriman pusat) — jaga-jaga saja,
 * karena daftar ini memang hanya berisi berita ber-biro.
 */
export type ListingBureauGroup = {
  bureauId: string;
  bureauName: string;
  bureauCode: string | null;
  items: NewsListItem[];
};

/**
 * Berita dari BIRO yang DIDORONG KE PUSAT (isPushedToCenter), dikelompokkan per biro.
 *
 * Kenapa lewat `tabWhere(..., 'pusat', ...)` dan bukan query baru: halaman lain memakai aturan
 * pool yang ketat (`newsVisibilityWhere`), dan aturan itu TIDAK boleh dilonggarkan di sini.
 * Akibatnya cakupan mengikuti role secara otomatis:
 *   - Admin/Super Admin     : seluruh biro
 *   - Produser/Reporter Pusat, Koordinator: seluruh biro (pool pusat + berita yang didorong)
 *   - Produser Daerah       : biro sendiri + berita biro lain yang VERIFIED/PUBLISHED
 * Urutan: diurutkan per biro (ALFABETIS) lalu waktu kirim terbaru di dalam tiap biro.
 */
export async function getListingByBureau(
  user: CurrentUser,
  filters: Omit<TabulasiFilters, 'bureauId' | 'status' | 'province' | 'tag'>,
  perBureau = 200
): Promise<{ groups: ListingBureauGroup[]; total: number }> {
  const where: Prisma.NewsWhereInput = {
    AND: [
      tabWhere(user, 'pusat', { ...filters, bureauId: undefined, status: undefined, province: undefined, tag: undefined }),
      // HANYA berita biro yang didorong ke pusat (bukan seluruh pool pusat).
      { isPushedToCenter: true },
      { originPool: Pool.DAERAH },
      { authorBureauId: { not: null } },
    ],
  };

  const items = await prisma.news.findMany({
    where,
    include: {
      author: { select: { id: true, name: true, role: true } },
      bureau: { select: { id: true, name: true, code: true } },
      // Tabel Listing tidak menampilkan lampiran, tetapi NewsListItem mensyaratkan field ini.
      media: { select: { id: true, storageKey: true, url: true, mimeType: true, filename: true, size: true } },
      _count: { select: { media: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const byBureau = new Map<string, ListingBureauGroup>();
  for (const n of items) {
    const id = n.bureau?.id ?? '__tanpa-biro__';
    if (!byBureau.has(id)) {
      byBureau.set(id, {
        bureauId: id,
        bureauName: n.bureau?.name ?? 'Tanpa Biro',
        bureauCode: n.bureau?.code ?? null,
        items: [],
      });
    }
    const group = byBureau.get(id)!;
    if (group.items.length < perBureau) group.items.push(n);
  }

  // Urut abjad nama biro agar posisinya stabil antar-pemuatan
  const groups = [...byBureau.values()].sort((a, b) => a.bureauName.localeCompare(b.bureauName, 'id'));
  return { groups, total: items.length };
}

// ===================== TAMPILAN KARTU (grid 4 kolom + load more) =====================

export type NewsCardData = {
  id: string;
  code: string;
  title: string;
  summary: string;
  category: string;
  kind: NewsKind;
  status: NewsStatus;
  originPool: Pool;
  isPushedToCenter: boolean;
  isNational: boolean;
  airedOnair: boolean;
  airedMedsos: boolean;
  location: string;
  city: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  publishedAt: string | null;
  authorName: string;
  authorRole: Role;
  bureauName: string | null;
  bureauCode: string | null;
  mediaCount: number;
  photoCount: number;
  footageCount: number;
  thumbUrl: string | null;
  tags: string[];
};

/**
 * Serialisasi data berita untuk dikirim ke client (kartu + endpoint load more).
 * Semua URL media sudah diberi basePath oleh mediaSrc().
 */
export function serializeNewsCard(n: NewsListItem): NewsCardData {
  const images = n.media.filter((m) => m.mimeType.startsWith('image/'));
  const footage = n.media.filter((m) => m.mimeType.startsWith('video/'));
  // Hanya berkas yang benar-benar tersimpan yang dijadikan thumbnail
  // (media contoh/seed tidak punya berkas fisik -> tampil kartu tanpa gambar).
  const thumbable = images.find((m) => Boolean(m.url));
  return {
    id: n.id,
    code: n.code,
    title: n.title,
    summary: n.summary,
    category: n.category,
    kind: n.kind,
    status: n.status,
    originPool: n.originPool,
    isPushedToCenter: n.isPushedToCenter,
    isNational: n.isNational,
    airedOnair: n.airedOnair,
    airedMedsos: n.airedMedsos,
    location: n.location,
    city: n.city,
    province: n.province,
    latitude: n.latitude,
    longitude: n.longitude,
    createdAt: n.createdAt.toISOString(),
    publishedAt: n.publishedAt ? n.publishedAt.toISOString() : null,
    authorName: n.author.name,
    authorRole: n.author.role,
    bureauName: n.bureau?.name ?? null,
    bureauCode: n.bureau?.code ?? null,
    mediaCount: n._count.media,
    photoCount: images.length,
    footageCount: footage.length,
    thumbUrl: thumbable ? mediaSrc(thumbable) : null,
    tags: parseTags(n.tags),
  };
}

// ===================== HELPER QUERY (dipakai halaman & endpoint load more) =====================

export type RawSearchParams = Record<string, string | string[] | undefined>;

export const spOne = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v === '' ? undefined : v;

export function tabulationFiltersFrom(sp: RawSearchParams): TabulasiFilters {
  return {
    q: spOne(sp.q),
    status: spOne(sp.status),
    category: spOne(sp.category),
    kind: spOne(sp.kind),
    province: spOne(sp.province),
    bureauId: spOne(sp.bureauId),
    tag: spOne(sp.tag),
    range: parseDateRange({ range: spOne(sp.range), from: spOne(sp.from), to: spOne(sp.to) }),
  };
}

/**
 * Parameter filter yang harus dipertahankan saat berpindah tab/halaman/tampilan
 * atau saat memuat kartu berikutnya.
 */
export function tabulationQueryParams(
  tab: TabKey,
  filters: TabulasiFilters,
  view: 'list' | 'card' = 'list'
): Record<string, string | undefined> {
  const { range } = filters;
  return {
    tab,
    q: filters.q,
    status: filters.status,
    category: filters.category,
    kind: filters.kind,
    province: filters.province,
    bureauId: filters.bureauId,
    tag: filters.tag,
    range: range.preset,
    from: range.preset === 'custom' ? range.fromStr : undefined,
    to: range.preset === 'custom' ? range.toStr : undefined,
    view: view === 'card' ? 'card' : undefined,
  };
}

export type NewsStats = {
  totalToday: number;
  pending: number;
  published: number;
  breaking: number;
  verified: number;
  draft: number;
};

/** Statistik ringkas di atas tabulasi (mengikuti cakupan akses user). */
export async function getStats(user: CurrentUser): Promise<NewsStats> {
  const scope = newsVisibilityWhere(user);
  const now = new Date();
  const [totalToday, pending, published, breaking, verified, draft] = await Promise.all([
    prisma.news.count({
      where: { AND: [scope, { createdAt: { gte: startOfDay(now), lte: endOfDay(now) } }] },
    }),
    prisma.news.count({ where: { AND: [scope, { status: NewsStatus.PENDING }] } }),
    prisma.news.count({ where: { AND: [scope, { status: NewsStatus.PUBLISHED }] } }),
    prisma.news.count({
      where: { AND: [scope, { kind: NewsKind.BREAKING, status: { in: ['PENDING', 'VERIFIED'] } }] },
    }),
    prisma.news.count({ where: { AND: [scope, { status: NewsStatus.VERIFIED }] } }),
    prisma.news.count({ where: { AND: [scope, { status: NewsStatus.DRAFT }] } }),
  ]);
  return { totalToday, pending, published, breaking, verified, draft };
}

export async function getFilterOptions() {
  const [categories, provinces, bureaus] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.news.findMany({ distinct: ['province'], select: { province: true }, orderBy: { province: 'asc' } }),
    prisma.bureau.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ]);
  return {
    categories,
    provinces: provinces.map((p) => p.province).filter(Boolean),
    bureaus,
  };
}

/** Titik peta sebaran berita (yang punya geo-tagging). */
export async function getMapPoints(user: CurrentUser, range: DateRange, limit = 500) {
  return prisma.news.findMany({
    where: {
      AND: [newsVisibilityWhere(user), { createdAt: { gte: range.from, lte: range.to } }, { latitude: { not: null } }],
    },
    select: {
      id: true,
      code: true,
      title: true,
      category: true,
      kind: true,
      status: true,
      latitude: true,
      longitude: true,
      location: true,
      city: true,
      province: true,
      isNational: true,
      isPushedToCenter: true,
      originPool: true,
      createdAt: true,
      author: { select: { name: true } },
      bureau: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/** Daftar berita yang TAYANG (ONAIR dan/atau MEDSOS) untuk tabel laporan. */
export async function getAiredNews(
  user: CurrentUser,
  range: DateRange,
  channel: 'ONAIR' | 'MEDSOS' | 'SEMUA' = 'SEMUA',
  limit = 50
) {
  const airedFilter: Prisma.NewsWhereInput =
    channel === 'ONAIR' ? { airedOnair: true } : channel === 'MEDSOS' ? { airedMedsos: true } : { OR: [{ airedOnair: true }, { airedMedsos: true }] };
  return prisma.news.findMany({
    where: {
      AND: [
        newsVisibilityWhere(user),
        // Rentang mengikuti WAKTU TAYANG (bukan waktu kirim) agar tabel benar-benar
        // melaporkan penayangan pada periode yang dipilih.
        airedFilter,
        {
          OR: [
            { airedOnairAt: { gte: range.from, lte: range.to } },
            { airedMedsosAt: { gte: range.from, lte: range.to } },
          ],
        },
      ],
    },
    select: {
      id: true,
      code: true,
      title: true,
      category: true,
      kind: true,
      isNational: true,
      airedOnair: true,
      airedMedsos: true,
      airedOnairAt: true,
      airedMedsosAt: true,
      author: { select: { name: true } },
      bureau: { select: { name: true, code: true } },
    },
    orderBy: [{ airedOnairAt: 'desc' }, { airedMedsosAt: 'desc' }],
    take: limit,
  });
}

export type ReportBundle = {
  byStatus: { key: string; label: string; value: number }[];
  byCategory: { key: string; value: number }[];
  byBureau: { key: string; value: number; published: number; pending: number; onair: number; medsos: number }[];
  byKind: { key: string; value: number }[];
  /** Komposisi kanal tayang: Onair saja, Medsos saja, keduanya, belum tayang. */
  byAirChannel: { key: string; label: string; value: number }[];
  /** Rekap tayang per kategori berita. */
  airByCategory: { key: string; onair: number; medsos: number; total: number }[];
  trend: { date: string; label: string; total: number; published: number; onair: number; medsos: number }[];
  topReporters: { name: string; bureau: string; total: number; published: number }[];
  totals: {
    total: number;
    published: number;
    pending: number;
    pushed: number;
    national: number;
    /** Jumlah berita yang pernah tayang di tiap kanal (bisa tumpang tindih). */
    onair: number;
    medsos: number;
    /** Berita yang tayang di KEDUA kanal. */
    airedBoth: number;
  };
};

/** Agregasi laporan — dihitung di JS agar aturan visibilitas tetap konsisten. */
export async function getReportBundle(user: CurrentUser, range: DateRange): Promise<ReportBundle> {
  const rows = await prisma.news.findMany({
    where: {
      AND: [
        newsVisibilityWhere(user),
        { createdAt: { gte: range.from, lte: range.to } },
      ],
    },
    select: {
      status: true,
      category: true,
      kind: true,
      isNational: true,
      isPushedToCenter: true,
      airedOnair: true,
      airedMedsos: true,
      createdAt: true,
      publishedAt: true,
      airedOnairAt: true,
      airedMedsosAt: true,
      author: { select: { name: true } },
      bureau: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const statusLabels: Record<string, string> = {
    DRAFT: 'Draft',
    PENDING: 'Menunggu Persetujuan',
    REVISION: 'Perlu Revisi',
    VERIFIED: 'Terverifikasi',
    REJECTED: 'Ditolak',
    PUBLISHED: 'Disiarkan',
  };

  const byAirMap = new Map<string, number>();
  const airCatMap = new Map<string, { onair: number; medsos: number; total: number }>();
  const byStatusMap = new Map<string, number>();
  const byCategoryMap = new Map<string, number>();
  const byBureauMap = new Map<string, { value: number; published: number; pending: number; onair: number; medsos: number }>();
  const byKindMap = new Map<string, number>();
  const trendMap = new Map<string, { total: number; published: number; onair: number; medsos: number }>();
  const reportersMap = new Map<string, { name: string; bureau: string; total: number; published: number }>();

  let published = 0;
  let pending = 0;
  let pushed = 0;
  let national = 0;
  let onairCount = 0;
  let medsosCount = 0;
  let airedBoth = 0;

  for (const r of rows) {
    byStatusMap.set(r.status, (byStatusMap.get(r.status) ?? 0) + 1);
    byCategoryMap.set(r.category, (byCategoryMap.get(r.category) ?? 0) + 1);
    byKindMap.set(r.kind, (byKindMap.get(r.kind) ?? 0) + 1);
    if (r.status === 'PUBLISHED') published += 1;
    if (r.status === 'PENDING') pending += 1;
    if (r.isPushedToCenter) pushed += 1;
    if (r.isNational) national += 1;

    // ---- Kanal tayang (ONAIR / MEDSOS) ----
    if (r.airedOnair || r.airedMedsos) {
      if (r.airedOnair) onairCount += 1;
      if (r.airedMedsos) medsosCount += 1;
      if (r.airedOnair && r.airedMedsos) airedBoth += 1;
      const airKey = r.airedOnair && r.airedMedsos ? 'BOTH' : r.airedOnair ? 'ONAIR' : 'MEDSOS';
      byAirMap.set(airKey, (byAirMap.get(airKey) ?? 0) + 1);
      const c = airCatMap.get(r.category) ?? { onair: 0, medsos: 0, total: 0 };
      if (r.airedOnair) c.onair += 1;
      if (r.airedMedsos) c.medsos += 1;
      c.total += 1;
      airCatMap.set(r.category, c);
    } else {
      byAirMap.set('BELUM', (byAirMap.get('BELUM') ?? 0) + 1);
    }

    const bureauKey = r.bureau?.name ?? 'Pusat / Non-Biro';
    const b = byBureauMap.get(bureauKey) ?? { value: 0, published: 0, pending: 0, onair: 0, medsos: 0 };
    b.value += 1;
    if (r.status === 'PUBLISHED') b.published += 1;
    if (r.status === 'PENDING') b.pending += 1;
    if (r.airedOnair) b.onair += 1;
    if (r.airedMedsos) b.medsos += 1;
    byBureauMap.set(bureauKey, b);

    const day = new Date(r.createdAt);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const t = trendMap.get(key) ?? { total: 0, published: 0, onair: 0, medsos: 0 };
    t.total += 1;
    if (r.status === 'PUBLISHED') t.published += 1;
    if (r.airedOnair) t.onair += 1;
    if (r.airedMedsos) t.medsos += 1;
    trendMap.set(key, t);

    const rk = r.author.name;
    const rep = reportersMap.get(rk) ?? { name: r.author.name, bureau: bureauKey, total: 0, published: 0 };
    rep.total += 1;
    if (r.status === 'PUBLISHED') rep.published += 1;
    reportersMap.set(rk, rep);
  }

  const trend = [...trendMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, v]) => ({
      date,
      label: `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`,
      total: v.total,
      published: v.published,
      onair: v.onair,
      medsos: v.medsos,
    }));

  return {
    byStatus: [...byStatusMap.entries()].map(([key, value]) => ({
      key,
      label: statusLabels[key] ?? key,
      value,
    })),
    byCategory: [...byCategoryMap.entries()]
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => b.value - a.value),
    byBureau: [...byBureauMap.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.value - a.value),
    byKind: [...byKindMap.entries()].map(([key, value]) => ({ key, value })),
    byAirChannel: [
      { key: 'ONAIR', label: 'Tayang Onair saja', value: byAirMap.get('ONAIR') ?? 0 },
      { key: 'MEDSOS', label: 'Tayang Medsos saja', value: byAirMap.get('MEDSOS') ?? 0 },
      { key: 'BOTH', label: 'Tayang Onair & Medsos', value: byAirMap.get('BOTH') ?? 0 },
      { key: 'BELUM', label: 'Belum tayang', value: byAirMap.get('BELUM') ?? 0 },
    ],
    airByCategory: [...airCatMap.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.total - a.total),
    trend,
    topReporters: [...reportersMap.values()].sort((a, b) => b.total - a.total).slice(0, 10),
    totals: { total: rows.length, published, pending, pushed, national, onair: onairCount, medsos: medsosCount, airedBoth },
  };
}

/** Ringkasan untuk halaman dashboard utama. */
export async function getDashboardSummary(user: CurrentUser) {
  const scope = newsVisibilityWhere(user);
  const now = new Date();
  const [today, week, mine, recent, announcements, unread] = await Promise.all([
    prisma.news.count({ where: { AND: [scope, { createdAt: { gte: startOfDay(now) } }] } }),
    prisma.news.count({ where: { AND: [scope, { createdAt: { gte: startOfDay(new Date(now.getTime() - 6 * 864e5)) } }] } }),
    prisma.news.count({ where: { authorId: user.id } }),
    prisma.news.findMany({
      where: scope,
      include: {
        author: { select: { name: true } },
        bureau: { select: { name: true, code: true } },
        _count: { select: { media: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    getActiveAnnouncementsFor(user, 3),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);
  return { today, week, mine, recent, announcements, unread };
}
