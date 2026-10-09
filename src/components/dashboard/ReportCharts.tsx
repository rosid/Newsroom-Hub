'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const AXIS = { fontSize: 11, fill: 'var(--muted)' };
const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#64748b',
  PENDING: '#eab308',
  REVISION: '#8b5cf6',
  VERIFIED: '#4d7cfe',
  REJECTED: '#f87171',
  PUBLISHED: '#16a34a',
};

const tooltipStyle = {
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--ink)',
};

export function CategoryChart({ data }: { data: { key: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data.slice(0, 10)} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid stroke="var(--line-soft)" horizontal={false} />
        <XAxis type="number" tick={AXIS} allowDecimals={false} />
        <YAxis type="category" dataKey="key" tick={AXIS} width={110} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="value" fill="var(--accent)" radius={[0, 4, 4, 0]} name="Berita" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendChart({ data }: { data: { label: string; total: number; published: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
        <CartesianGrid stroke="var(--line-soft)" />
        <XAxis dataKey="label" tick={AXIS} />
        <YAxis tick={AXIS} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="total" name="Total kiriman" stroke="var(--accent)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="published" name="Disiarkan" stroke="#16a34a" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="onair" name="Tayang Onair" stroke="#d61f2c" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="medsos" name="Tayang Medsos" stroke="#4d7cfe" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function StatusChart({ data }: { data: { key: string; label: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius={52} outerRadius={88} paddingAngle={2}>
          {data.map((d) => (
            <Cell key={d.key} fill={STATUS_COLORS[d.key] ?? '#64748b'} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

const AIR_COLORS: Record<string, string> = {
  ONAIR: '#d61f2c',
  MEDSOS: '#4d7cfe',
  BOTH: '#8b5cf6',
  BELUM: '#64748b',
};

/** Komposisi kanal tayang: Onair saja / Medsos saja / keduanya / belum tayang. */
export function AirChannelChart({ data }: { data: { key: string; label: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius={52} outerRadius={88} paddingAngle={2}>
          {data.map((d) => (
            <Cell key={d.key} fill={AIR_COLORS[d.key] ?? '#64748b'} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Batang: perbandingan jumlah tayang Onair vs Medsos per kategori. */
export function AirByCategoryChart({ data }: { data: { key: string; onair: number; medsos: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data.slice(0, 10)} margin={{ left: 0, right: 12, top: 8, bottom: 44 }}>
        <CartesianGrid stroke="var(--line-soft)" vertical={false} />
        <XAxis dataKey="key" tick={{ ...AXIS, fontSize: 10 }} angle={-25} textAnchor="end" height={54} interval={0} />
        <YAxis tick={AXIS} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="onair" name="Tayang Onair" fill="#d61f2c" radius={[4, 4, 0, 0]} />
        <Bar dataKey="medsos" name="Tayang Medsos" fill="#4d7cfe" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BureauChart({ data }: { data: { key: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data.slice(0, 10)} margin={{ left: 0, right: 12, top: 8, bottom: 40 }}>
        <CartesianGrid stroke="var(--line-soft)" vertical={false} />
        <XAxis dataKey="key" tick={{ ...AXIS, fontSize: 10 }} angle={-25} textAnchor="end" height={50} interval={0} />
        <YAxis tick={AXIS} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="value" fill="var(--brand)" radius={[4, 4, 0, 0]} name="Berita" />
      </BarChart>
    </ResponsiveContainer>
  );
}
