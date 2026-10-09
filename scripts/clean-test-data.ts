/**
 * Membersihkan artefak data uji (dipakai setelah menjalankan smoke test).
 * Hanya menghapus: pengumuman berjudul "Uji Pengumuman%", seluruh notifikasi &
 * log audit hasil uji, dan berkas di folder uploads/ yang tidak lagi terpakai.
 * Jalankan: npx tsx scripts/clean-test-data.ts
 */
import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const ann = await prisma.announcement.deleteMany({ where: { title: { startsWith: 'Uji Pengumuman' } } });
  const notif = await prisma.notification.deleteMany({ where: {} });
  const audit = await prisma.auditLog.deleteMany({ where: {} });
  console.log(`[clean] penghapusan: ${ann.count} pengumuman uji, ${notif.count} notifikasi, ${audit.count} log audit`);

  const used = new Set((await prisma.mediaAsset.findMany({ select: { storageKey: true } })).map((m) => m.storageKey));
  const root = path.join(process.cwd(), 'uploads');
  let removed = 0;
  async function walk(dir: string) {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.startsWith('.')) continue; // jangan sentuh berkas penanda (.gitkeep)
      const full = path.join(dir, e);
      const st = await fs.stat(full);
      if (st.isDirectory()) {
        await walk(full);
        const rest = await fs.readdir(full);
        if (!rest.length) await fs.rmdir(full);
      } else {
        const key = path.relative(root, full).split(path.sep).join('/');
        if (!used.has(key)) {
          await fs.unlink(full);
          removed += 1;
        }
      }
    }
  }
  await walk(root);
  console.log(`[clean] ${removed} berkas uploads/ tidak terpakai dihapus`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
