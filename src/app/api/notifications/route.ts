import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Route handler TIDAK mendapat basePath otomatis dari redirect() -> kembalikan 401
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const countOnly = new URL(req.url).searchParams.get('countOnly');

  if (countOnly) {
    const unread = await prisma.notification.count({ where: { userId: user.id, isRead: false } });
    return NextResponse.json({ unread });
  }

  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);

  return NextResponse.json({ unread, items });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { action?: string; id?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* body kosong */
  }

  if (body.action === 'readAll') {
    await prisma.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
    return NextResponse.json({ ok: true });
  }
  if (body.id) {
    await prisma.notification.updateMany({ where: { id: body.id, userId: user.id }, data: { isRead: true } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: 'Aksi tidak dikenal' }, { status: 400 });
}
