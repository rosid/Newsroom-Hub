/**
 * Fixture untuk menguji "load more" pada tampilan kartu.
 * HANYA boleh dijalankan pada database uji di /tmp (pengaman di bawah menolak
 * database aplikasi apa pun) — skrip `clean` MENGHAPUS data.
 *
 *   DATABASE_URL="file:/tmp/newsroom-test.db" npx tsx scripts/cards-fixture.ts seed 22
 *   DATABASE_URL="file:/tmp/newsroom-test.db" npx tsx scripts/cards-fixture.ts clean
 */
import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL || '';
if (!url.startsWith('file:/tmp/')) {
  console.error(
    `DITOLAK: skrip fixture hanya untuk database uji di /tmp.\nDATABASE_URL saat ini: ${url || '(default aplikasi)'}\n` +
      'Jalankan dengan: DATABASE_URL="file:/tmp/newsroom-test.db" npx tsx scripts/cards-fixture.ts <seed|clean>'
  );
  process.exit(1);
}

const PREFIX = 'UJI-KARTU';
const prisma = new PrismaClient();

async function seed(count: number) {
  const central = await prisma.user.findFirst({ where: { email: 'reporter.pusat@newsroom.demo' } });
  const categories = await prisma.category.findMany({ where: { isActive: true }, take: 6 });
  if (!central) throw new Error('Akun reporter pusat tidak ditemukan — jalankan npm run db:seed dulu.');

  const now = Date.now();
  const created = [];
  for (let i = 0; i < count; i += 1) {
    const created_at = new Date(now - i * 60_000);
    created.push(
      await prisma.news.create({
        data: {
          id: `fixture-card-${now}-${i}`,
          code: `UJI-${now}-${i}`,
          title: `${PREFIX} ${i + 1} — uji paginasi kartu tabulasi`,
          summary: 'Data uji otomatis untuk memverifikasi muat 20 kartu lagi pada tabulasi.',
          script: '<p>Data uji otomatis. Tidak untuk produksi.</p>',
          category: categories[i % categories.length]?.name ?? 'Umum',
          kind: i % 5 === 0 ? 'BREAKING' : 'REGULAR',
          status: 'PENDING',
          originPool: 'PUSAT',
          authorId: central.id,
          authorRole: central.role,
          location: 'Jakarta Pusat',
          province: 'DKI Jakarta',
          city: 'Jakarta',
          latitude: -6.18 + i * 0.001,
          longitude: 106.83 + i * 0.001,
          tags: JSON.stringify(['uji', 'kartu']),
          submittedAt: created_at,
          createdAt: created_at,
          updatedAt: created_at,
        },
      })
    );
  }
  console.log(`[fixture] ${created.length} berita uji kartu dibuat`);
}

async function clean() {
  const res = await prisma.news.deleteMany({ where: { title: { startsWith: PREFIX } } });
  console.log(`[fixture] ${res.count} berita uji kartu dihapus`);
}

const mode = process.argv[2] ?? 'seed';
const amount = Number(process.argv[3] ?? 22);

(mode === 'clean' ? clean() : seed(amount))
  .catch((e) => {
    console.error('[fixture] gagal:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
