import Icon from '@/components/ui/Icon';
import { numberID } from '@/lib/utils';
import type { NewsStats } from '@/lib/news';

const CARDS: {
  key: keyof NewsStats;
  label: string;
  icon: string;
  tone: string;
  hint: string;
}[] = [
  { key: 'totalToday', label: 'Berita Hari Ini', icon: 'file', tone: 'var(--accent)', hint: 'kiriman masuk sejak 00:00' },
  { key: 'pending', label: 'Menunggu Persetujuan', icon: 'clock', tone: 'var(--warn)', hint: 'butuh validasi produser' },
  { key: 'published', label: 'Telah Disiarkan', icon: 'broadcast', tone: 'var(--ok)', hint: 'total tayang' },
  { key: 'breaking', label: 'Breaking News', icon: 'flame', tone: 'var(--brand)', hint: 'aktif proses' },
];

export default function StatsCards({ stats }: { stats: NewsStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map((c) => (
        <div key={c.key} className="kpi">
          <div className="flex items-center justify-between">
            <span className="kpi-label">{c.label}</span>
            <span style={{ color: c.tone }}>
              <Icon name={c.icon} size={15} />
            </span>
          </div>
          <span className="kpi-value" style={{ color: c.key === 'pending' && stats.pending > 0 ? c.tone : undefined }}>
            {numberID(stats[c.key] as number)}
          </span>
          <span className="text-[11px] text-muted">{c.hint}</span>
        </div>
      ))}
    </div>
  );
}
