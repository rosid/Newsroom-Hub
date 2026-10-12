'use server';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { genId, genNewsCode } from '@/lib/id';
import { logAudit } from '@/lib/audit';
import { notifyUsers, notifyRoles } from '@/lib/notify';
import { sanitizeHtml, stripHtml } from '@/lib/sanitize';
import {
  newsFormSchema,
  reviewNewsSchema,
  pushToCenterSchema,
  publishNewsSchema,
  airNewsSchema,
  retractAirSchema,
  deleteNewsSchema,
  zodToState,
  type ActionState,
} from '@/lib/validations';
import {
  canAirNews,
  canDeleteNews,
  canEditNews,
  canPushToCenter,
  canPublish,
  canReview,
  canViewNews,
  isAdmin,
} from '@/lib/permissions';
import type { MediaType, NewsKind, NewsStatus, Pool, Role } from '@prisma/client';
import { deleteObject } from '@/lib/storage';
import { MAX_ATTACHMENTS } from '@/lib/media-limits';
import { DEFAULT_NEWS_KIND, kindMeta } from '@/lib/news-kinds';

type MediaInput = {
  storageKey: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  type: MediaType;
  caption?: string;
};

const ALLOWED_EXT = /\.(mp4|webm|mov|jpg|jpeg|png|gif|webp|pdf|docx?|xlsx?|csv|txt|zip)$/i;

function parseMedia(json: string | undefined): MediaInput[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((m) => m && typeof m.storageKey === 'string' && m.storageKey.length > 3)
      .filter((m) => ALLOWED_EXT.test(String(m.filename || m.storageKey)))
      .slice(0, MAX_ATTACHMENTS)
      .map((m) => ({
        storageKey: String(m.storageKey),
        url: String(m.url || `local:${m.storageKey}`),
        filename: String(m.filename || 'berkas').slice(0, 180),
        mimeType: String(m.mimeType || 'application/octet-stream').slice(0, 100),
        size: Number(m.size) || 0,
        type: (m.type === 'IMAGE' ? 'IMAGE' : 'FOOTAGE') as MediaType,
        caption: m.caption ? String(m.caption).slice(0, 200) : '',
      }));
  } catch {
    return [];
  }
}

async function nextNewsCode(): Promise<string> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const count = await prisma.news.count({ where: { createdAt: { gte: start } } });
  for (let i = count + 1; i < count + 60; i += 1) {
    const code = genNewsCode(i, new Date());
    const exists = await prisma.news.findUnique({ where: { code }, select: { id: true } });
    if (!exists) return code;
  }
  return genNewsCode(Date.now() % 10000, new Date());
}

/** Simpan berita (buat baru atau perbarui) — draft atau langsung kirim. */
export async function saveNewsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = newsFormSchema.safeParse({
    id: (formData.get('id') as string) || undefined,
    title: formData.get('title') ?? '',
    script: formData.get('script') ?? '',
    summary: formData.get('summary') ?? '',
    category: formData.get('category') ?? '',
    kind: formData.get('kind') ?? DEFAULT_NEWS_KIND,
    location: formData.get('location') ?? '',
    province: formData.get('province') ?? '',
    city: formData.get('city') ?? '',
    latitude: (formData.get('latitude') as string) ?? '',
    longitude: (formData.get('longitude') as string) ?? '',
    tags: (formData.get('tags') as string) ?? '',
    submit: (formData.get('submit') as string) ?? 'submit',
    media: (formData.get('media') as string) ?? '[]',
  });
  if (!parsed.success) return zodToState(parsed.error);
  const d = parsed.data;

  const media = parseMedia(d.media);
  const tags = (d.tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
  const script = sanitizeHtml(d.script);
  const summary = d.summary?.trim() ? d.summary.trim() : stripHtml(script).slice(0, 200);
  const originPool: Pool = user.bureauId ? 'DAERAH' : 'PUSAT';
  const status: NewsStatus = d.submit === 'submit' ? 'PENDING' : 'DRAFT';

  const baseData = {
    title: d.title,
    script,
    summary,
    category: d.category,
    kind: d.kind as NewsKind,
    location: d.location,
    province: d.province || '',
    city: d.city || '',
    latitude: d.latitude,
    longitude: d.longitude,
    tags: JSON.stringify(tags),
    updatedAt: new Date(),
  };

  let newsId = d.id ?? '';
  try {
    if (d.id) {
      const existing = await prisma.news.findUnique({ where: { id: d.id } });
      if (!existing) return { ok: false, error: 'Berita tidak ditemukan.' };
      if (!canEditNews(user, existing)) return { ok: false, error: 'Anda tidak berhak mengubah berita ini.' };
      await prisma.news.update({
        where: { id: existing.id },
        data: {
          ...baseData,
          status: status === 'PENDING' ? 'PENDING' : existing.status === 'PENDING' ? 'DRAFT' : existing.status,
          submittedAt: status === 'PENDING' ? new Date() : existing.submittedAt,
        },
      });
      newsId = existing.id;
      if (status === 'PENDING') {
        await prisma.newsLog.create({
          data: {
            id: genId(),
            newsId,
            fromStatus: existing.status,
            toStatus: 'PENDING',
            actorId: user.id,
            actorName: user.name,
            note: 'Dikirim ulang oleh reporter',
          },
        });
      }
    } else {
      const code = await nextNewsCode();
      const created = await prisma.news.create({
        data: {
          id: genId(),
          code,
          ...baseData,
          status,
          originPool,
          authorId: user.id,
          authorBureauId: user.bureauId ?? null,
          authorRole: user.role,
          submittedAt: status === 'PENDING' ? new Date() : null,
        },
      });
      newsId = created.id;
      await prisma.newsLog.create({
        data: {
          id: genId(),
          newsId,
          toStatus: status,
          actorId: user.id,
          actorName: user.name,
          note: status === 'PENDING' ? 'Dikirim ke newsroom' : 'Disimpan sebagai draft',
        },
      });
    }

    // lampirkan media yang belum terpasang di berita lain
    if (media.length) {
      const existingKeys = await prisma.mediaAsset.findMany({
        where: { newsId },
        select: { storageKey: true },
      });
      const used = new Set(existingKeys.map((e) => e.storageKey));
      const taken = await prisma.mediaAsset.findMany({
        where: { storageKey: { in: media.map((m) => m.storageKey) }, NOT: { newsId } },
        select: { storageKey: true },
      });
      const blocked = new Set(taken.map((t) => t.storageKey));
      const rows = media
        .filter((m) => !used.has(m.storageKey) && !blocked.has(m.storageKey))
        .map((m) => ({
          id: genId(),
          newsId,
          type: m.type,
          storageKey: m.storageKey,
          url: m.url,
          filename: m.filename,
          mimeType: m.mimeType,
          size: m.size,
          caption: m.caption ?? '',
          uploadedById: user.id,
        }));
      if (rows.length) await prisma.mediaAsset.createMany({ data: rows });
    }

    if (status === 'PENDING') {
      await notifyReviewers(user.role, user.bureauId, newsId, d.title, d.kind as NewsKind, user.id);
    }

    await logAudit({
      actor: user,
      action: d.id ? 'NEWS_UPDATE' : status === 'PENDING' ? 'NEWS_SUBMIT' : 'NEWS_DRAFT',
      entity: 'News',
      entityId: newsId,
      meta: { title: d.title, kind: d.kind, media: media.length },
    });
  } catch (e) {
    console.error('[news] gagal simpan:', e);
    return { ok: false, error: 'Gagal menyimpan berita. Coba lagi.' };
  }

  return {
    ok: true,
    message: status === 'PENDING' ? 'Berita berhasil dikirim ke produser.' : 'Draft disimpan.',
    fieldErrors: { id: newsId },
  };
}

/**
 * Prioritas jenis berita → tipe notifikasi lonceng.
 * Urgent = Breaking News, Penting = Wajib Pimpinan, Normal = sisanya.
 */
const NOTIF_TYPE_BY_PRIORITY: Record<'NORMAL' | 'PENTING' | 'URGENT', 'INFO' | 'WARNING' | 'DANGER'> = {
  NORMAL: 'INFO',
  PENTING: 'WARNING',
  URGENT: 'DANGER',
};

async function notifyReviewers(
  authorRole: Role,
  bureauId: string | null,
  newsId: string,
  title: string,
  kind: NewsKind,
  excludeUserId: string
) {
  const link = `/dashboard/tabulasi/berita/${newsId}`;
  if (bureauId) {
    const produsers = await prisma.user.findMany({
      where: { bureauId, role: { in: ['PRODUSER_DAERAH', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true },
      select: { id: true },
    });
    await notifyUsers(
      produsers.map((p) => p.id).filter((id) => id !== excludeUserId),
      {
        // Judul & prioritas notifikasi mengikuti jenis berita (lihat lib/news-kinds.ts).
        title: `${kindMeta(kind).notificationPrefix} dari biro: ${title}`,
        body: 'Menunggu validasi produser.',
        link,
        type: NOTIF_TYPE_BY_PRIORITY[kindMeta(kind).priority],
      }
    );
  } else {
    await notifyRoles(['PRODUSER_PUSAT', 'REDAKTUR'], {
      title: `${kindMeta(kind).notificationPrefix} pusat: ${title}`,
      body: 'Menunggu validasi/penyiaran.',
      link,
      type: NOTIF_TYPE_BY_PRIORITY[kindMeta(kind).priority],
    }, excludeUserId);
  }
}

/** Validasi berita oleh produser (VERIFIED / REVISION / REJECTED). */
export async function reviewNewsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = reviewNewsSchema.safeParse({
    newsId: formData.get('newsId') ?? '',
    status: formData.get('status') ?? '',
    note: (formData.get('note') as string) ?? '',
  });
  if (!parsed.success) return zodToState(parsed.error);

  const news = await prisma.news.findUnique({ where: { id: parsed.data.newsId } });
  if (!news) return { ok: false, error: 'Berita tidak ditemukan.' };
  if (!canReview(user, news)) return { ok: false, error: 'Anda tidak berhak memvalidasi berita ini.' };

  await prisma.news.update({
    where: { id: news.id },
    data: {
      status: parsed.data.status,
      reviewerNote: parsed.data.note,
      reviewedById: user.id,
      reviewedAt: new Date(),
    },
  });
  await prisma.newsLog.create({
    data: {
      id: genId(),
      newsId: news.id,
      fromStatus: news.status,
      toStatus: parsed.data.status,
      actorId: user.id,
      actorName: user.name,
      note: parsed.data.note,
    },
  });

  const label =
    parsed.data.status === 'VERIFIED' ? 'diverifikasi' : parsed.data.status === 'REVISION' ? 'perlu revisi' : 'ditolak';
  await notifyUsers(
    [news.authorId, news.reviewedById ?? ''].filter((x) => x && x !== user.id),
    {
      title: `Berita ${news.code} ${label}`,
      body: parsed.data.note || `Status: ${parsed.data.status}`,
      link: `/dashboard/tabulasi/berita/${news.id}`,
      type: parsed.data.status === 'VERIFIED' ? 'SUCCESS' : parsed.data.status === 'REJECTED' ? 'DANGER' : 'WARNING',
    }
  );

  await logAudit({
    actor: user,
    action: `NEWS_${parsed.data.status}`,
    entity: 'News',
    entityId: news.id,
    meta: { from: news.status, note: parsed.data.note },
  });

  return { ok: true, message: `Berita ditandai ${label}.` };
}

/** Dorong berita daerah ke Pool Tabulasi Pusat. */
export async function pushToCenterAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = pushToCenterSchema.safeParse({
    newsId: formData.get('newsId') ?? '',
    note: (formData.get('note') as string) ?? '',
  });
  if (!parsed.success) return zodToState(parsed.error);

  const news = await prisma.news.findUnique({ where: { id: parsed.data.newsId } });
  if (!news) return { ok: false, error: 'Berita tidak ditemukan.' };
  if (!canPushToCenter(user, news)) return { ok: false, error: 'Anda tidak berhak mendorong berita ini ke pusat.' };

  await prisma.news.update({
    where: { id: news.id },
    data: { isPushedToCenter: true, pushedAt: new Date(), pushedById: user.id, reviewerNote: parsed.data.note || news.reviewerNote },
  });
  await prisma.newsLog.create({
    data: {
      id: genId(),
      newsId: news.id,
      fromStatus: news.status,
      toStatus: news.status,
      actorId: user.id,
      actorName: user.name,
      note: `Didorong ke Pool Tabulasi Pusat. ${parsed.data.note}`.trim(),
    },
  });

  await notifyRoles(['REDAKTUR', 'PRODUSER_PUSAT'], {
    title: `Berita daerah layak siaran nasional: ${news.title}`,
    body: `${user.name}${user.bureau?.name ? ` (${user.bureau.name})` : ''} mendorong berita ini ke Pool Pusat.`,
    link: `/dashboard/tabulasi/berita/${news.id}`,
    type: 'INFO',
  });

  await logAudit({ actor: user, action: 'NEWS_PUSH_CENTER', entity: 'News', entityId: news.id, meta: { note: parsed.data.note } });
  return { ok: true, message: 'Berita berhasil didorong ke Pool Tabulasi Pusat.' };
}

/** Batalkan dorongan ke pusat. */
export async function retractPushAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = deleteNewsSchema.safeParse({ newsId: formData.get('newsId') ?? '' });
  if (!parsed.success) return zodToState(parsed.error);
  const news = await prisma.news.findUnique({ where: { id: parsed.data.newsId } });
  if (!news) return { ok: false, error: 'Berita tidak ditemukan.' };
  const allowed = isAdmin(user) || user.role === 'REDAKTUR' || (user.role === 'PRODUSER_DAERAH' && news.authorBureauId === user.bureauId);
  if (!allowed) return { ok: false, error: 'Anda tidak berhak membatalkan dorongan ini.' };

  await prisma.news.update({
    where: { id: news.id },
    data: { isPushedToCenter: false, pushedAt: null, pushedById: null },
  });
  await prisma.newsLog.create({
    data: {
      id: genId(),
      newsId: news.id,
      fromStatus: news.status,
      toStatus: news.status,
      actorId: user.id,
      actorName: user.name,
      note: 'Dorongan ke Pool Pusat dibatalkan',
    },
  });
  await logAudit({ actor: user, action: 'NEWS_PUSH_RETRACT', entity: 'News', entityId: news.id });
  return { ok: true, message: 'Dorongan ke Pusat dibatalkan.' };
}

/** Label kanal untuk pesan/notifikasi. */
const AIR_LABEL: Record<'ONAIR' | 'MEDSOS', string> = {
  ONAIR: 'siaran ONAIR (TV)',
  MEDSOS: 'tayang MEDSOS (sosial media)',
};

/**
 * Tandai berita TAYANG pada satu kanal: ONAIR (siaran TV) atau MEDSOS.
 *
 * Berita dapat tayang di kedua kanal (mis. disiarkan lalu diunggah ke sosial media);
 * status berubah menjadi PUBLISHED saat kanal pertama tayang.
 */
export async function airNewsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = airNewsSchema.safeParse({
    newsId: formData.get('newsId') ?? '',
    channel: formData.get('channel') ?? '',
    note: (formData.get('note') as string) ?? '',
    isNational: (formData.get('isNational') as string) ?? undefined,
  });
  if (!parsed.success) return zodToState(parsed.error);
  const { channel } = parsed.data;

  const news = await prisma.news.findUnique({ where: { id: parsed.data.newsId } });
  if (!news) return { ok: false, error: 'Berita tidak ditemukan.' };
  if (!canAirNews(user, news)) {
    return {
      ok: false,
      error:
        news.status === 'VERIFIED' || news.status === 'PUBLISHED'
          ? 'Anda tidak berhak menandai tayang berita ini.'
          : 'Hanya berita terverifikasi (atau yang sudah tayang) dapat ditandai tayang.',
    };
  }

  const already = channel === 'ONAIR' ? news.airedOnair : news.airedMedsos;
  if (already) {
    return { ok: false, error: `Berita ini sudah ditandai ${AIR_LABEL[channel]}.` };
  }

  const now = new Date();
  const isNational =
    channel === 'ONAIR'
      ? parsed.data.isNational === 'on' || (news.originPool === 'PUSAT' && !news.authorBureauId)
      : news.isNational;

  // Status PUBLISHED bila ini kanal pertama yang tayang
  const firstAiring = !news.airedOnair && !news.airedMedsos;

  await prisma.news.update({
    where: { id: news.id },
    data: {
      ...(channel === 'ONAIR'
        ? { airedOnair: true, airedOnairAt: now, airedOnairById: user.id }
        : { airedMedsos: true, airedMedsosAt: now, airedMedsosById: user.id }),
      ...(firstAiring
        ? { status: 'PUBLISHED' as const, publishedAt: now, publishedById: user.id, isNational }
        : { isNational }),
      reviewerNote: parsed.data.note || news.reviewerNote,
    },
  });

  await prisma.newsLog.create({
    data: {
      id: genId(),
      newsId: news.id,
      fromStatus: news.status,
      toStatus: 'PUBLISHED',
      actorId: user.id,
      actorName: user.name,
      note: `${AIR_LABEL[channel]} oleh ${user.name}${isNational && channel === 'ONAIR' ? ' (nasional)' : ''}. ${parsed.data.note}`.trim(),
    },
  });

  await notifyUsers([news.authorId].filter((x) => x !== user.id), {
    title: `Berita ${AIR_LABEL[channel]}: ${news.title}`,
    body: parsed.data.note || (channel === 'ONAIR' && isNational ? 'Tayang sebagai siaran nasional.' : 'Berita sudah tayang.'),
    link: `/dashboard/tabulasi/berita/${news.id}`,
    type: 'SUCCESS',
  });
  if (news.isPushedToCenter) {
    await notifyRoles(['PRODUSER_DAERAH'], {
      title: `Berita biro ${AIR_LABEL[channel]}: ${news.title}`,
      link: `/dashboard/tabulasi/berita/${news.id}`,
      type: 'SUCCESS',
    });
  }

  await logAudit({
    actor: user,
    action: `NEWS_AIR_${channel}`,
    entity: 'News',
    entityId: news.id,
    meta: { channel, isNational, firstAiring },
  });

  return {
    ok: true,
    message:
      channel === 'ONAIR'
        ? isNational
          ? 'Berita ditandai TAYANG ONAIR (siaran nasional).'
          : 'Berita ditandai TAYANG ONAIR.'
        : 'Berita ditandai TAYANG MEDSOS.',
  };
}

/**
 * Tarik tayang pada satu kanal. Bila kedua kanal sudah tidak tayang, status
 * berita dikembalikan ke VERIFIED agar dapat diperbaiki/ditayangkan ulang.
 */
export async function retractAirNewsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = retractAirSchema.safeParse({
    newsId: formData.get('newsId') ?? '',
    channel: formData.get('channel') ?? '',
    note: (formData.get('note') as string) ?? '',
  });
  if (!parsed.success) return zodToState(parsed.error);
  const { channel } = parsed.data;

  const news = await prisma.news.findUnique({ where: { id: parsed.data.newsId } });
  if (!news) return { ok: false, error: 'Berita tidak ditemukan.' };
  if (!canAirNews(user, news)) return { ok: false, error: 'Anda tidak berhak menarik tayang berita ini.' };

  const stillOnair = channel === 'ONAIR' ? false : news.airedOnair;
  const stillMedsos = channel === 'MEDSOS' ? false : news.airedMedsos;
  const anyLeft = stillOnair || stillMedsos;

  await prisma.news.update({
    where: { id: news.id },
    data: {
      ...(channel === 'ONAIR'
        ? { airedOnair: false, airedOnairAt: null, airedOnairById: null }
        : { airedMedsos: false, airedMedsosAt: null, airedMedsosById: null }),
      ...(anyLeft
        ? {}
        : { status: 'VERIFIED' as const, publishedAt: null, publishedById: null, isNational: false }),
      reviewerNote: parsed.data.note || news.reviewerNote,
    },
  });

  await prisma.newsLog.create({
    data: {
      id: genId(),
      newsId: news.id,
      fromStatus: news.status,
      toStatus: anyLeft ? 'PUBLISHED' : 'VERIFIED',
      actorId: user.id,
      actorName: user.name,
      note: `Tayang ${channel} ditarik oleh ${user.name}${anyLeft ? ' (kanal lain masih tayang)' : ''}. ${parsed.data.note}`.trim(),
    },
  });

  await logAudit({ actor: user, action: `NEWS_RETRACT_AIR_${channel}`, entity: 'News', entityId: news.id, meta: { channel } });

  return {
    ok: true,
    message: anyLeft
      ? `Tayang ${channel} ditarik. Kanal lainnya masih tayang.`
      : `Tayang ${channel} ditarik. Status berita kembali ke Terverifikasi.`,
  };
}

/** Kompatibilitas: Siarkan berita tanpa memilih kanal = tandai ONAIR. */
export async function publishNewsAction(prev: ActionState, formData: FormData): Promise<ActionState> {
  const fd = new FormData();
  fd.set('newsId', String(formData.get('newsId') ?? ''));
  fd.set('channel', 'ONAIR');
  fd.set('note', String(formData.get('note') ?? ''));
  const national = formData.get('isNational');
  if (national) fd.set('isNational', String(national));
  return airNewsAction(prev, fd);
}

/** Tarik tayang SEMUA kanal sekaligus (dipakai tombol “Tarik Tayang”). */
export async function unpublishNewsAction(prev: ActionState, formData: FormData): Promise<ActionState> {
  const newsId = String(formData.get('newsId') ?? '');
  const fd = new FormData();
  fd.set('newsId', newsId);
  fd.set('channel', 'ONAIR');
  const resA = await retractAirNewsAction(prev, fd);
  const fd2 = new FormData();
  fd2.set('newsId', newsId);
  fd2.set('channel', 'MEDSOS');
  const resB = await retractAirNewsAction(prev, fd2);
  if (!resA.ok && !resB.ok) return resA;
  return { ok: true, message: 'Tayang berita ditarik. Status kembali ke Terverifikasi.' };
}

/** Hapus berita (+ media di storage). */
export async function deleteNewsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = deleteNewsSchema.safeParse({ newsId: formData.get('newsId') ?? '' });
  if (!parsed.success) return zodToState(parsed.error);

  const news = await prisma.news.findUnique({
    where: { id: parsed.data.newsId },
    include: { media: true },
  });
  if (!news) return { ok: false, error: 'Berita tidak ditemukan.' };
  if (!canDeleteNews(user, news)) return { ok: false, error: 'Anda tidak berhak menghapus berita ini.' };

  await prisma.newsLog.deleteMany({ where: { newsId: news.id } });
  await prisma.mediaAsset.deleteMany({ where: { newsId: news.id } });
  await prisma.news.delete({ where: { id: news.id } });
  for (const m of news.media) {
    try {
      await deleteObject(m.storageKey);
    } catch {
      /* abaikan */
    }
  }

  await logAudit({ actor: user, action: 'NEWS_DELETE', entity: 'News', entityId: news.id, meta: { code: news.code, title: news.title } });
  return { ok: true, message: `Berita ${news.code} dihapus.` };
}

/** Hapus lampiran media tertentu. */
export async function deleteMediaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const mediaId = String(formData.get('mediaId') || '');
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: mediaId },
    include: { news: true },
  });
  if (!asset) return { ok: false, error: 'Lampiran tidak ditemukan.' };
  if (!canEditNews(user, asset.news) && asset.uploadedById !== user.id) {
    return { ok: false, error: 'Anda tidak berhak menghapus lampiran ini.' };
  }
  await prisma.mediaAsset.delete({ where: { id: mediaId } });
  await deleteObject(asset.storageKey);
  await logAudit({ actor: user, action: 'MEDIA_DELETE', entity: 'MediaAsset', entityId: mediaId, meta: { newsId: asset.newsId } });
  return { ok: true, message: 'Lampiran dihapus.' };
}

/** Cek akses baca berita (dipakai halaman detail). */
export async function assertCanViewNews(newsId: string) {
  const user = await requireUser();
  const news = await prisma.news.findUnique({ where: { id: newsId } });
  if (!news) return { user, news: null, allowed: false as const };
  return { user, news, allowed: canViewNews(user, news) };
}
