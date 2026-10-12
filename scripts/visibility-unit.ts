/**
 * Uji unit ATURAN VISIBILITAS BERITA (tanpa browser/DB).
 *
 * Ini logika keamanan inti: menentukan berita mana yang boleh dilihat sebuah role. Sebelumnya
 * aturan ini TIDAK punya uji unit sama sekali — hanya diuji lewat UI, sehingga perubahan seperti
 * "Reporter hanya melihat kiriman sendiri" (Okt 2026) berisiko meleset di jalur yang tidak
 * terpakai di uji UI (mis. halaman detail, tautan berbagi, ekspor, peta, laporan).
 *
 *   npx tsx scripts/visibility-unit.ts
 */
import type { Role } from '@prisma/client';
import { canViewNews, newsVisibilityWhere, seesOnlyOwnNews, OWN_NEWS_ONLY_ROLES } from '../src/lib/permissions';

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

const MEDAN = 'biro-medan';
const SBY = 'biro-surabaya';

/** Bentuk minimal CurrentUser (User + bureau) yang dibutuhkan aturan visibilitas. */
const user = (role: Role, bureauId: string | null = null, id = `${role}-${bureauId ?? 'x'}`) =>
  ({ id, role, bureauId, bureau: bureauId ? { id: bureauId, name: bureauId, code: 'X' } : null }) as never;

/** Bentuk minimal NewsLike. */
const news = (opts: {
  authorId: string;
  authorBureauId?: string | null;
  originPool?: 'PUSAT' | 'DAERAH';
  isPushedToCenter?: boolean;
  status?: 'DRAFT' | 'PENDING' | 'REVISION' | 'VERIFIED' | 'REJECTED' | 'PUBLISHED';
}) => ({
  authorId: opts.authorId,
  authorBureauId: opts.authorBureauId ?? null,
  originPool: opts.originPool ?? 'DAERAH',
  isPushedToCenter: opts.isPushedToCenter ?? false,
  status: opts.status ?? 'VERIFIED',
});

const ALL_ROLES: Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'REDAKTUR',
  'PRODUSER_PUSAT',
  'REPORTER_PUSAT',
  'PRODUSER_DAERAH',
  'REPORTER_DAERAH',
  'KONTRIBUTOR',
  'MAGANG',
  'KOORDINATOR_LIPUTAN',
  'KOORDINATOR_DAERAH',
];

// =====================================================================================
// 1. Daftar role "hanya kiriman sendiri" sesuai permintaan pemilik aplikasi
// =====================================================================================
const TARGET = ['REPORTER_PUSAT', 'REPORTER_DAERAH', 'KONTRIBUTOR', 'MAGANG'] as Role[];
check(
  'keempat role yang diminta masuk daftar "hanya kiriman sendiri"',
  TARGET.every((r) => seesOnlyOwnNews({ role: r })) && OWN_NEWS_ONLY_ROLES.length === 4,
  OWN_NEWS_ONLY_ROLES.join(', ')
);
check(
  'role lain TIDAK masuk daftar tersebut',
  ALL_ROLES.filter((r) => !TARGET.includes(r)).every((r) => !seesOnlyOwnNews({ role: r })),
  ALL_ROLES.filter((r) => seesOnlyOwnNews({ role: r })).join(', ')
);

// =====================================================================================
// 2. newsVisibilityWhere: 4 role itu HARUS hanya `{ authorId }` (tanpa OR apa pun)
// =====================================================================================
for (const role of TARGET) {
  for (const bureauId of [MEDAN, null]) {
    const w = newsVisibilityWhere(user(role, bureauId)) as Record<string, unknown>;
    const isOwnOnly = 'authorId' in w && Object.keys(w).length === 1;
    check(
      `newsVisibilityWhere(${role}${bureauId ? ', biro' : ', tanpa biro'}) = hanya authorId`,
      isOwnOnly,
      JSON.stringify(w)
    );
  }
}

// Tanpa perubahan perilaku untuk role lain
check('newsVisibilityWhere(SUPER_ADMIN) = {} (semua)', JSON.stringify(newsVisibilityWhere(user('SUPER_ADMIN'))) === '{}');
check('newsVisibilityWhere(ADMIN) = {} (semua)', JSON.stringify(newsVisibilityWhere(user('ADMIN'))) === '{}');
const wProduser = JSON.stringify(newsVisibilityWhere(user('PRODUSER_DAERAH', MEDAN)));
check(
  'newsVisibilityWhere(Produser Daerah) tidak berubah (biro + pool pusat terverifikasi)',
  wProduser.includes('authorBureauId') && wProduser.includes('isPushedToCenter'),
  wProduser
);
const wPusat = JSON.stringify(newsVisibilityWhere(user('PRODUSER_PUSAT')));
check(
  'newsVisibilityWhere(Produser Pusat) tidak berubah (pool pusat + didorong)',
  wPusat.includes('isPushedToCenter') && !wPusat.includes('authorBureauId'),
  wPusat
);
check('newsVisibilityWhere(Koordinator Daerah) tidak berubah (pool pusat + didorong)', JSON.stringify(newsVisibilityWhere(user('KOORDINATOR_DAERAH'))).includes('isPushedToCenter'));
check('newsVisibilityWhere(Redaktur) tidak berubah (pool pusat + didorong)', JSON.stringify(newsVisibilityWhere(user('REDAKTUR'))).includes('isPushedToCenter'));

// =====================================================================================
// 3. canViewNews: matriks keputusan untuk SATU berita
// =====================================================================================
// Berita contoh dari berbagai asal
const ownPusat = news({ authorId: 'me-pusat', originPool: 'PUSAT' });
const otherPusat = news({ authorId: 'orang-lain-pusat', originPool: 'PUSAT' });
const ownDaerah = news({ authorId: 'me-daerah', authorBureauId: MEDAN, originPool: 'DAERAH' });
const sameBureauPeer = news({ authorId: 'rekan-sebiro', authorBureauId: MEDAN, originPool: 'DAERAH' });
const otherBureau = news({ authorId: 'orang-surabaya', authorBureauId: SBY, originPool: 'DAERAH' });
const pushedToCenter = news({ authorId: 'orang-surabaya', authorBureauId: SBY, originPool: 'DAERAH', isPushedToCenter: true, status: 'PUBLISHED' });

// Reporter Pusat: hanya kiriman sendiri (sebelumnya masih bisa melihat SEMUA pool pusat)
const rp = user('REPORTER_PUSAT', null, 'me-pusat');
check('Reporter Pusat melihat kirimannya sendiri', canViewNews(rp, ownPusat));
check('Reporter Pusat TIDAK melihat kiriman reporter pusat lain', !canViewNews(rp, otherPusat));
check('Reporter Pusat TIDAK melihat berita daerah biro lain', !canViewNews(rp, otherBureau));
check('Reporter Pusat TIDAK melihat berita yang didorong ke pusat', !canViewNews(rp, pushedToCenter));

// Reporter Daerah: hanya kiriman sendiri (sebelumnya bisa melihat rekan SEBIRO)
const rd = user('REPORTER_DAERAH', MEDAN, 'me-daerah');
check('Reporter Daerah melihat kirimannya sendiri', canViewNews(rd, ownDaerah));
check('Reporter Daerah TIDAK melihat kiriman rekan SEBIRO', !canViewNews(rd, sameBureauPeer));
check('Reporter Daerah TIDAK melihat berita biro lain', !canViewNews(rd, otherBureau));
check('Reporter Daerah TIDAK melihat berita pool pusat', !canViewNews(rd, otherPusat));

// Kontributor: sama
const kt = user('KONTRIBUTOR', MEDAN, 'me-daerah');
check('Kontributor melihat kirimannya sendiri', canViewNews(kt, ownDaerah));
check('Kontributor TIDAK melihat kiriman rekan sebiro', !canViewNews(kt, sameBureauPeer));
check('Kontributor TIDAK melihat pool pusat', !canViewNews(kt, otherPusat));

// Magang: tetap seperti sebelumnya (hanya sendiri)
const mg = user('MAGANG', MEDAN, 'me-daerah');
check('Magang melihat kirimannya sendiri', canViewNews(mg, ownDaerah));
check('Magang TIDAK melihat kiriman orang lain', !canViewNews(mg, sameBureauPeer) && !canViewNews(mg, otherPusat));

// Berita sendiri tetap terlihat pada SEMUA status (Reporter harus bisa melihat hasil validasi)
for (const status of ['DRAFT', 'PENDING', 'REVISION', 'REJECTED', 'VERIFIED', 'PUBLISHED'] as const) {
  check(
    `Reporter Daerah tetap melihat kirimannya sendiri berstatus ${status}`,
    canViewNews(rd, news({ authorId: 'me-daerah', authorBureauId: MEDAN, status }))
  );
}

// =====================================================================================
// 4. TIDAK ada regresi untuk role lain (mereka harus tetap seperti semula)
// =====================================================================================
const admin = user('ADMIN', null, 'admin');
check('Admin melihat semua berita', [ownPusat, otherPusat, ownDaerah, sameBureauPeer, otherBureau, pushedToCenter].every((n) => canViewNews(admin, n)));

const produserDaerah = user('PRODUSER_DAERAH', MEDAN, 'pd');
check('Produser Daerah melihat kiriman reporter biro-nya (untuk validasi)', canViewNews(produserDaerah, sameBureauPeer));
check('Produser Daerah TIDAK melihat berita biro lain yang belum didorong', !canViewNews(produserDaerah, otherBureau));
check('Produser Daerah melihat berita biro lain yang sudah didorong & disiarkan', canViewNews(produserDaerah, pushedToCenter));

const produserPusat = user('PRODUSER_PUSAT', null, 'pp');
check('Produser Pusat melihat berita pool pusat', canViewNews(produserPusat, otherPusat));
check('Produser Pusat melihat berita daerah yang didorong ke pusat', canViewNews(produserPusat, pushedToCenter));
check('Produser Pusat TIDAK melihat berita daerah yang belum didorong', !canViewNews(produserPusat, otherBureau));

const redaktur = user('REDAKTUR', null, 'red');
check('Redaktur melihat pool pusat + berita yang didorong', canViewNews(redaktur, otherPusat) && canViewNews(redaktur, pushedToCenter));

console.log(`\n${pass}/${pass + fail} pemeriksaan unit visibilitas berita lulus`);
if (fail) process.exit(1);
