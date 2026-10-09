/**
 * Fixture uji chat — HANYA untuk database salinan di /tmp.
 *
 * 1. Membuat tabel chat (Conversation, Message) dari prisma/chat-ddl.sql,
 * 2. Menambahkan akun demo role Koordinator Liputan & Koordinator Daerah (bila belum ada),
 * 3. Menyediakan pesan lama (> 60 detik) untuk menguji batas waktu edit.
 *
 *   DATABASE_URL="file:/tmp/newsroom-chat/newsroom.db" npx tsx scripts/chat-fixture.ts [seed|clean]
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL || '';
if (!url.startsWith('file:/tmp/')) {
  console.error(
    `DITOLAK: skrip ini hanya untuk database uji di /tmp.\nDATABASE_URL saat ini: ${url || '(default aplikasi)'}`
  );
  process.exit(1);
}

const prisma = new PrismaClient();
const PREFIX = 'UJI-CHAT';
const id = () => `${PREFIX}-${Math.random().toString(36).slice(2, 10)}`;

const USERS = [
  { email: 'koordinator.liputan@newsroom.demo', name: 'Dimas Prayoga', role: 'KOORDINATOR_LIPUTAN' as const, jobTitle: 'Koordinator Liputan' },
  { email: 'koordinator.daerah@newsroom.demo', name: 'Ratna Melati', role: 'KOORDINATOR_DAERAH' as const, jobTitle: 'Koordinator Daerah (Network)' },
  // Produser Daerah untuk biro Makassar: agar Magang Makassar punya lawan chat
  // sesuai aturan "Magang di biro ↔ Produser Daerah biro yang sama".
  { email: 'produser.makassar@newsroom.demo', name: 'Pak Yusuf', role: 'PRODUSER_DAERAH' as const, bureauCode: 'MKS', jobTitle: 'Produser Biro Makassar' },
];

async function ensureTables() {
  // Komentar dibuang lebih dulu, baru dipecah per ';' (lihat catatan di server.js)
  const ddl = readFileSync(path.join(process.cwd(), 'prisma', 'chat-ddl.sql'), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  const statements = ddl
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const exists = await prisma.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='Message'"
  );
  if (exists.length) {
    console.log('[chat-fixture] tabel chat sudah ada');
    return;
  }
  for (const sql of statements) await prisma.$executeRawUnsafe(sql);
  console.log(`[chat-fixture] tabel chat dibuat (${statements.length} pernyataan)`);
}

async function seed() {
  await ensureTables();
  const hash = await bcrypt.hash('Demo123!', 10);
  for (const u of USERS) {
    const bureauId =
      'bureauCode' in u && u.bureauCode
        ? (await prisma.bureau.findUnique({ where: { code: u.bureauCode }, select: { id: true } }))?.id ?? null
        : null;
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        id: id(),
        email: u.email,
        name: u.name,
        role: u.role,
        jobTitle: u.jobTitle,
        passwordHash: hash,
        bureauId,
      },
    });
  }
  console.log(`[chat-fixture] ${USERS.length} akun uji chat siap (koordinator & produser Makassar)`);

  // Pesan lama untuk menguji batas edit 60 detik: pesan dari reporter Medan ke produser Medan
  const reporter = await prisma.user.findFirst({ where: { email: 'reporter.medan@newsroom.demo' } });
  const produser = await prisma.user.findFirst({ where: { email: 'produser.medan@newsroom.demo' } });
  if (!reporter || !produser) {
    console.log('[chat-fixture] akun biro Medan tidak ditemukan — lewati pesan lama');
    return;
  }
  const [a, b] = reporter.id < produser.id ? [reporter.id, produser.id] : [produser.id, reporter.id];
  const existing = await prisma.conversation.findUnique({
    where: { participant1Id_participant2Id: { participant1Id: a, participant2Id: b } },
  });
  const conv =
    existing ??
    (await prisma.conversation.create({ data: { id: id(), participant1Id: a, participant2Id: b } }));

  const old = new Date(Date.now() - 5 * 60_000); // 5 menit lalu
  await prisma.message.create({
    data: {
      id: `${PREFIX}-OLD-${Date.now()}`,
      conversationId: conv.id,
      senderId: reporter.id,
      body: 'Pesan lama (dibuat 5 menit lalu) — untuk menguji batas edit 60 detik.',
      createdAt: old,
      isRead: false,
    },
  });
  console.log(`[chat-fixture] pesan lama dibuat di percakapan ${conv.id} (Reporter Medan → Produser Medan)`);
}

async function clean() {
  await prisma.message.deleteMany({ where: { body: { startsWith: 'UJI-CHAT' } } });
  const res = await prisma.message.deleteMany({ where: { id: { startsWith: PREFIX } } });
  const conv = await prisma.conversation.deleteMany({ where: { id: { startsWith: PREFIX } } });
  console.log(`[chat-fixture] dibersihkan: ${res.count} pesan, ${conv.count} percakapan`);
}

const mode = process.argv[2] ?? 'seed';
(mode === 'clean' ? clean() : seed())
  .catch((e) => {
    console.error('[chat-fixture] gagal:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
