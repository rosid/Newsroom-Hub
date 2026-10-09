/** Utilitas kecil: menampilkan jumlah data inti (memakai DATABASE_URL aktif). */
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  console.log(
    JSON.stringify({
      database: process.env.DATABASE_URL ?? '(default)',
      news: await p.news.count(),
      users: await p.user.count(),
      bureaus: await p.bureau.count(),
    })
  );
  await p.$disconnect();
})();
