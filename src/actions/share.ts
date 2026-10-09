'use server';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { canViewNews } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';
import {
  DEFAULT_SHARE_DAYS,
  MAX_SHARE_DAYS,
  sharePagePath,
  signShareToken,
} from '@/lib/share';
import { zodToState, type ActionState } from '@/lib/validations';

export type ShareLinkState = ActionState & {
  /** Path relatif halaman berbagi (pakai BASE_PATH di client). */
  path?: string;
  expiresAt?: string;
  days?: number;
  assetCount?: number;
  kind?: 'news' | 'media';
};

/**
 * Buat tautan berbagi untuk TAMU (mis. video editor) — tanpa akun newsroom.
 * Masa berlaku dipilih (1/7/30 hari). Tidak ada tabel baru: tautan ditandatangani
 * (HMAC) dengan secret aplikasi sehingga dapat dicabut hanya dengan membiarkannya
 * kedaluwarsa (atau dengan mengganti SESSION_SECRET).
 */
export async function createShareLinkAction(_prev: ShareLinkState, formData: FormData): Promise<ShareLinkState> {
  const user = await requireUser();

  const newsId = String(formData.get('newsId') || '');
  const mediaId = String(formData.get('mediaId') || '');
  const daysRaw = Number(formData.get('days') || DEFAULT_SHARE_DAYS);
  const days = Math.max(1, Math.min(Number.isFinite(daysRaw) ? daysRaw : DEFAULT_SHARE_DAYS, MAX_SHARE_DAYS));

  if (!newsId && !mediaId) return { ok: false, error: 'Tidak ada berkas/berita yang dipilih untuk dibagikan.' };

  try {
    if (mediaId) {
      const asset = await prisma.mediaAsset.findUnique({
        where: { id: mediaId },
        include: { news: true },
      });
      if (!asset) return { ok: false, error: 'Lampiran tidak ditemukan.' };
      if (!canViewNews(user, asset.news)) return { ok: false, error: 'Anda tidak berhak membagikan berkas ini.' };

      const token = signShareToken(
        { kind: 'media', storageKey: asset.storageKey, filename: asset.filename },
        days
      );
      await logAudit({
        actor: user,
        action: 'SHARE_LINK_CREATE',
        entity: 'MediaAsset',
        entityId: asset.id,
        meta: { kind: 'media', days, filename: asset.filename, newsId: asset.newsId },
      });
      return {
        ok: true,
        kind: 'media',
        days,
        path: sharePagePath(token),
        expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
        assetCount: 1,
        message: `Tautan berbagi berkas dibuat (berlaku ${days} hari).`,
      };
    }

    const news = await prisma.news.findUnique({
      where: { id: newsId },
      include: { media: { select: { id: true } } },
    });
    if (!news) return { ok: false, error: 'Berita tidak ditemukan.' };
    if (!canViewNews(user, news)) return { ok: false, error: 'Anda tidak berhak membagikan berita ini.' };
    if (!news.media.length) {
      return { ok: false, error: 'Berita ini belum memiliki lampiran footage/gambar untuk dibagikan.' };
    }

    const token = signShareToken({ kind: 'news', newsId: news.id }, days);
    await logAudit({
      actor: user,
      action: 'SHARE_LINK_CREATE',
      entity: 'News',
      entityId: news.id,
      meta: { kind: 'news', days, assets: news.media.length, code: news.code },
    });
    return {
      ok: true,
      kind: 'news',
      days,
      path: sharePagePath(token),
      expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
      assetCount: news.media.length,
      message: `Tautan berbagi untuk ${news.media.length} lampiran dibuat (berlaku ${days} hari).`,
    };
  } catch (e) {
    console.error('[share] gagal membuat tautan:', e);
    return { ok: false, error: 'Gagal membuat tautan berbagi. Coba lagi.' };
  }
}
