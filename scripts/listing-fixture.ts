/**
 * Fixture untuk uji halaman Listing Berita.
 *
 * Menyiapkan kondisi minimum supaya halaman Listing punya isi:
 *  1. Akun Koordinator Liputan & Koordinator Daerah (belum ada di data live).
 *  2. Beberapa berita BIRO dari dua biro berbeda yang sudah DIDORONG KE PUSAT
 *     (status VERIFIED agar terlihat oleh role daerah lain sesuai aturan pool).
 *  3. Satu berita pool PUSAT (isPushedToCenter = false) sebagai pembanding:
 *     berita ini TIDAK boleh muncul di halaman Listing.
 *
 * Aman dijalankan berulang: memakai upsert + nomor berita bertanda 'LIST-UJI'.
 *
 *   DATABASE_URL="file:/tmp/…/newsroom.db" npx tsx scripts/listing-fixture.ts
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const TAG = 'LIST-UJI';

async function main() {
  const hash = await prisma.user.findFirst({ where: { email: 'produser.medan@newsroom.demo' } });

  // 1) Akun Koordinator (kalau belum ada)
  const koordinator = [
    { email: 'koordinator.liputan@newsroom.demo', name: 'Dimas Prayoga', role: 'KOORDINATOR_LIPUTAN' as const },
    { email: 'koordinator.daerah@newsroom.demo', name: 'Ratna Melati', role: 'KOORDINATOR_DAERAH' as const },
  ];
  for (const k of koordinator) {
    const exists = await prisma.user.findUnique({ where: { email: k.email }, select: { id: true } });
    if (!exists) {
      await prisma.user.create({
        data: {
          id: randomUUID(),
          email: k.email,
          name: k.name,
          role: k.role,
          // Sandi dikosongkan: akun ini HANYA dipakai untuk memeriksa daftar kontak/akses,
          // bukan untuk login (login membutuhkan hash bcrypt yang valid).
          passwordHash: hash?.passwordHash ?? 'x',
          isActive: true,
        },
      });
      console.log(`[listing-fixture] akun ${k.email} dibuat`);
    }
  }

  // 2) Berita biro yang didorong ke pusat (dua biro) + 1 berita pusat sebagai pembanding
  const bureaus = await prisma.bureau.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, take: 2 });
  if (bureaus.length < 2) {
    console.error('[listing-fixture] butuh minimal 2 biro aktif');
    process.exit(1);
  }
  const author = await prisma.user.findFirst({ where: { email: 'reporter.medan@newsroom.demo' }, select: { id: true, name: true } });

  let created = 0;
  for (const [i, b] of bureaus.entries()) {
    const code = `LIST-UJI-${b.code}`;
    const exists = await prisma.news.findFirst({ where: { code }, select: { id: true } });
    if (exists) continue;
    await prisma.news.create({
      data: {
        id: randomUUID(),
        code,
        title: `Berita uji listing dari ${b.name} (${TAG})`,
        script: `<p>Naskah uji listing untuk ${b.name}.</p>`,
        summary: 'Ringkasan uji listing',
        category: 'Umum',
        kind: i === 0 ? 'REGULAR' : 'WAJIB_PIMPINAN',
        status: 'VERIFIED',
        originPool: 'DAERAH',
        authorId: author?.id ?? 'x',
        authorBureauId: b.id,
        authorRole: 'REPORTER_DAERAH',
        isPushedToCenter: true,
      },
    });
    created += 1;
  }

  // Pembanding: berita PUSAT (tidak didorong) — harus TIDAK muncul di Listing
  const pusatCode = 'LIST-UJI-PUSAT';
  const pusatExists = await prisma.news.findFirst({ where: { code: pusatCode }, select: { id: true } });
  if (!pusatExists) {
    await prisma.news.create({
      data: {
        id: randomUUID(),
        code: pusatCode,
        title: `Berita PUSAT uji listing (${TAG})`,
        script: '<p>Naskah uji pusat.</p>',
        summary: 'Ringkasan uji pusat',
        category: 'Umum',
        kind: 'REGULAR',
        status: 'VERIFIED',
        originPool: 'PUSAT',
        authorId: author?.id ?? 'x',
        authorRole: 'REPORTER_PUSAT',
        isPushedToCenter: false,
      },
    });
    created += 1;
  }

  console.log(`[listing-fixture] selesai — ${created} berita uji dibuat, ${bureaus.length} biro disiapkan`);
}

main()
  .catch((e) => {
    console.error('[listing-fixture] gagal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
