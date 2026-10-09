// Base path aplikasi (dipublish di slug => '/newsroom-hub').
// redirect() Next.js sudah menambahkan basePath otomatis — p() hanya untuk
// <a href>, form action HTML, src gambar/media, dan router.push() di client.
export const BASE_PATH: string = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const p = (path: string): string => {
  if (!path.startsWith('/')) return path;
  if (BASE_PATH && path.startsWith(BASE_PATH)) return path;
  return BASE_PATH + path;
};
