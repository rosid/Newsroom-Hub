/**
 * Uji unit fitur TAYANG ONAIR & MEDSOS:
 * - wewenang penayangan (canAirNews) vs wewenang penyiaran lama (canPublish);
 * - sanitasi skema form tayang/tarik;
 * - agregasi laporan (komposisi kanal, rekap per biro, tren) dihitung dari data nyata
 *   pada SALINAN database /tmp.
 *
 *   DATABASE_URL="file:/tmp/…/newsroom.db" npx tsx scripts/airing-unit.ts
 */
import { PrismaClient } from '@prisma/client';
import { canAirNews, canPublish } from '../src/lib/permissions';
import { airNewsSchema, retractAirSchema } from '../src/lib/validations';
import { getAiredNews, getReportBundle } from '../src/lib/news';
import { AIR_CHANNEL_BADGE, AIR_CHANNEL_LABELS, AIR_CHANNELS } from '../src/lib/constants';
import { parseDateRange } from '../src/lib/utils';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}${extra ? ` — ${extra}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  }
};

const ROLES = {
  redaktur: { id: 'u-red', role: 'REDAKTUR' as const, bureauId: null },
  produserPusat: { id: 'u-pp', role: 'PRODUSER_PUSAT' as const, bureauId: null },
  produserDaerah: { id: 'u-pd', role: 'PRODUSER_DAERAH' as const, bureauId: 'biro-medan' },
  reporterPusat: { id: 'u-rp', role: 'REPORTER_PUSAT' as const, bureauId: null },
  admin: { id: 'u-adm', role: 'ADMIN' as const, bureauId: null },
};

const newsOf = (over: Partial<{ status: string; originPool: string; authorBureauId: string | null; isPushedToCenter: boolean }> = {}) => ({
  authorId: 'u-rp',
  authorBureauId: (over.authorBureauId ?? null) as string | null,
  originPool: (over.originPool ?? 'PUSAT') as never,
  isPushedToCenter: over.isPushedToCenter ?? false,
  status: (over.status ?? 'VERIFIED') as never,
});

async function main() {
  // ---------- Label & konstanta kanal ----------
  check('ada 2 kanal tayang', AIR_CHANNELS.length === 2, AIR_CHANNELS.join(', '));
  check('label kanal benar', AIR_CHANNEL_LABELS.ONAIR === 'Tayang Onair' && AIR_CHANNEL_LABELS.MEDSOS === 'Tayang Medsos');
  check('badge kanal berbeda', AIR_CHANNEL_BADGE.ONAIR !== AIR_CHANNEL_BADGE.MEDSOS, `${AIR_CHANNEL_BADGE.ONAIR} vs ${AIR_CHANNEL_BADGE.MEDSOS}`);

  // ---------- Wewenang tayang ----------
  check('Redaktur boleh menayangkan berita pusat terverifikasi', canAirNews(ROLES.redaktur as never, newsOf() as never));
  check('Produser Pusat boleh menayangkan berita pusat', canAirNews(ROLES.produserPusat as never, newsOf() as never));
  check('Admin boleh menayangkan berita terverifikasi & yang sudah tayang', canAirNews(ROLES.admin as never, newsOf({ status: 'PUBLISHED' }) as never));
  check(
    'Admin TIDAK boleh menandai tayang berita yang belum diverifikasi (alur editorial dijaga)',
    !canAirNews(ROLES.admin as never, newsOf({ status: 'PENDING' }) as never)
  );
  check(
    'Produser Daerah boleh menayangkan berita biro-nya',
    canAirNews(ROLES.produserDaerah as never, newsOf({ originPool: 'DAERAH', authorBureauId: 'biro-medan' }) as never)
  );
  check(
    'Produser Daerah TIDAK boleh menayangkan berita biro lain',
    !canAirNews(ROLES.produserDaerah as never, newsOf({ originPool: 'DAERAH', authorBureauId: 'biro-surabaya' }) as never)
  );
  check('Reporter Pusat TIDAK boleh menandai tayang', !canAirNews(ROLES.reporterPusat as never, newsOf() as never));
  check('Berita DRAFT/PENDING tidak boleh ditandai tayang', !canAirNews(ROLES.admin as never, newsOf({ status: 'PENDING' }) as never));
  check(
    'Berita yang SUDAH tayang masih boleh ditambah kanal lain (PUBLISHED)',
    canAirNews(ROLES.admin as never, newsOf({ status: 'PUBLISHED' }) as never)
  );
  check(
    'Berita daerah yang didorong ke pusat boleh ditayangkan redaktur',
    canAirNews(ROLES.redaktur as never, newsOf({ originPool: 'DAERAH', authorBureauId: 'biro-medan', isPushedToCenter: true }) as never)
  );
  // Perbedaan penting dengan wewenang lama (canPublish): untuk NON-admin, canPublish
  // mensyaratkan status VERIFIED (berita yang sudah tayang tidak bisa "disiarkan lagi"),
  // sedangkan canAirNews membolehkan PUBLISHED agar kanal kedua dapat ditandai.
  check(
    'canPublish menolak berita yang sudah PUBLISHED (perilaku lama, non-admin)',
    !canPublish(ROLES.redaktur as never, newsOf({ status: 'PUBLISHED' }) as never) &&
      canPublish(ROLES.redaktur as never, newsOf() as never)
  );
  check(
    'canAirNews MEMBOLEHKAN menandai kanal kedua pada berita PUBLISHED (non-admin)',
    canAirNews(ROLES.redaktur as never, newsOf({ status: 'PUBLISHED' }) as never)
  );

  // ---------- Skema form ----------
  const ok = airNewsSchema.safeParse({ newsId: 'n1', channel: 'ONAIR', note: '', isNational: 'on' });
  check('skema tayang menerima ONAIR', ok.success);
  check('skema tayang menerima MEDSOS', airNewsSchema.safeParse({ newsId: 'n1', channel: 'MEDSOS' }).success);
  check('skema tayang menolak kanal tak dikenal', !airNewsSchema.safeParse({ newsId: 'n1', channel: 'TV' }).success);
  check('skema tarik tayang menerima kanal', retractAirSchema.safeParse({ newsId: 'n1', channel: 'MEDSOS' }).success);

  // ---------- Agregasi pada DB salinan ----------
  const url = process.env.DATABASE_URL || '';
  check('uji dijalankan pada DB salinan /tmp', url.startsWith('file:/tmp/'), url || '(default)');
  const prisma = new PrismaClient();
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!adminUser) {
    check('akun admin tersedia di DB uji', false, 'jalankan db:seed dulu');
    await prisma.$disconnect();
    return;
  }
  const actor = { ...adminUser, bureau: null } as never;

  // Siapkan data uji: satu berita tayang ONAIR saja, satu MEDSOS saja, satu keduanya
  const code = `UJI-AIR-${Date.now()}`;
  const created = [];
  for (const [i, plan] of [
    { onair: true, medsos: false },
    { onair: false, medsos: true },
    { onair: true, medsos: true },
  ].entries()) {
    const n = await prisma.news.create({
      data: {
        id: `uji-air-${Date.now()}-${i}`,
        code: `${code}-${i}`,
        title: `Uji Tayang ${i + 1}`,
        script: '<p>uji</p>',
        summary: 'uji tayang',
        category: 'Uji Kategori Tayang',
        status: 'PUBLISHED',
        originPool: 'PUSAT',
        authorId: adminUser.id,
        authorRole: adminUser.role,
        airedOnair: plan.onair,
        airedOnairAt: plan.onair ? new Date() : null,
        airedMedsos: plan.medsos,
        airedMedsosAt: plan.medsos ? new Date() : null,
        publishedAt: new Date(),
      },
    });
    created.push(n);
  }

  const range = parseDateRange({ range: '30d' });
  const bundle = await getReportBundle(actor, range);
  const mine = (key: string) => bundle.byAirChannel.find((c) => c.key === key)?.value ?? 0;

  check('laporan: komposisi kanal -- Onair saja terhitung', mine('ONAIR') >= 1, `${mine('ONAIR')}`);
  check('laporan: komposisi kanal -- Medsos saja terhitung', mine('MEDSOS') >= 1, `${mine('MEDSOS')}`);
  check('laporan: komposisi kanal -- keduanya terhitung', mine('BOTH') >= 1, `${mine('BOTH')}`);
  check('laporan: total kanal = Onair + Medsos + Both (tidak ada yang hilang)', bundle.byAirChannel.reduce((s, c) => s + c.value, 0) === bundle.totals.total || bundle.byAirChannel.length === 4);
  check('laporan: totals.onair >= 2 (1 onair saja + 1 keduanya)', bundle.totals.onair >= 2, `${bundle.totals.onair}`);
  check('laporan: totals.medsos >= 2 (1 medsos saja + 1 keduanya)', bundle.totals.medsos >= 2, `${bundle.totals.medsos}`);
  check('laporan: totals.airedBoth >= 1', bundle.totals.airedBoth >= 1, `${bundle.totals.airedBoth}`);
  check('laporan: rekap tayang per kategori memuat kategori uji', bundle.airByCategory.some((c) => c.key === 'Uji Kategori Tayang' && c.onair >= 2 && c.medsos >= 2));
  check('laporan: tren harian memuat onair & medsos', bundle.trend.some((t) => t.onair > 0 && t.medsos > 0));
  check('laporan: rekap per biro memuat kolom onair/medsos', bundle.byBureau.every((b) => 'onair' in b && 'medsos' in b));

  // Daftar berita tayang + filter kanal
  const all = await getAiredNews(actor, range, 'SEMUA', 500);
  const onlyAir = await getAiredNews(actor, range, 'ONAIR', 500);
  const onlyMedsos = await getAiredNews(actor, range, 'MEDSOS', 500);
  check('daftar berita tayang memuat data uji', all.some((n) => n.code.startsWith(code)), `${all.length} berita tayang`);
  check('filter ONAIR hanya memuat berita yang tayang onair', onlyAir.every((n) => n.airedOnair) && onlyAir.length > 0, `${onlyAir.length}`);
  check('filter MEDSOS hanya memuat berita yang tayang medsos', onlyMedsos.every((n) => n.airedMedsos) && onlyMedsos.length > 0, `${onlyMedsos.length}`);
  check('berita tayang menyertakan waktu tayang kanal', all.every((n) => (n.airedOnair ? Boolean(n.airedOnairAt) : true)));

  // Bersihkan data uji
  await prisma.newsLog.deleteMany({ where: { newsId: { in: created.map((c) => c.id) } } });
  await prisma.news.deleteMany({ where: { id: { in: created.map((c) => c.id) } } });
  const left = await prisma.news.count({ where: { code: { startsWith: code } } });
  check('data uji dibersihkan kembali', left === 0, `${left} sisa`);

  await prisma.$disconnect();

  console.log(`\n${pass}/${pass + fail} pemeriksaan unit tayang lulus`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error('gagal menjalankan uji unit tayang:', e.message);
  process.exit(1);
});
