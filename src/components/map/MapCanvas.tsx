'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { p } from '@/lib/base';
import { NEWS_KINDS, isNewsKind, kindMeta } from '@/lib/news-kinds';

export type MapPoint = {
  id: string;
  code: string;
  title: string;
  category: string;
  kind: string;
  status: string;
  lat: number;
  lng: number;
  location: string;
  authorName: string;
  bureauName: string | null;
  isNational: boolean;
  isPushedToCenter: boolean;
  createdAt: string;
};

/**
 * Warna pin pada peta. Jenis berita (Breaking / Wajib Pimpinan / Sales Order) punya
 * warnanya sendiri dari `news-kinds.ts`; sisanya memakai warna status.
 */
const KIND_COLOR: Record<string, string> = Object.fromEntries(NEWS_KINDS.map((k) => [k.value, k.mapColor]));

const COLOR: Record<string, string> = {
  BREAKING: '#e8384a',
  PUBLISHED: '#16a34a',
  VERIFIED: '#4d7cfe',
  PENDING: '#eab308',
  REVISION: '#8b5cf6',
  REJECTED: '#94a3b8',
  DRAFT: '#64748b',
};

/**
 * Jenis berita non-biasa diperlakukan sebagai penanda khusus (warna & tanda sendiri),
 * jenis biasa memakai warna status agar peta tetap terbaca.
 */
function colorFor(kind: string | null | undefined, status: string): string {
  const byKind = KIND_COLOR[String(kind ?? '')];
  if (byKind && kind !== 'REGULAR') return byKind;
  return COLOR[status] ?? '#64748b';
}

export default function MapCanvas({
  points,
  height = 540,
  filterKey = 'all',
}: {
  points: MapPoint[];
  height?: number;
  filterKey?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  const visible = useMemo(() => {
    if (filterKey === 'all') return points;
    // Filter jenis: nilai filter = nilai jenis (mis. 'BREAKING', 'WAJIB_PIMPINAN').
    if (isNewsKind(filterKey)) return points.filter((pt) => pt.kind === filterKey);
    if (filterKey === 'nasional') return points.filter((pt) => pt.isNational);
    if (filterKey === 'pusat') return points.filter((pt) => pt.isPushedToCenter || pt.isNational);
    return points.filter((pt) => pt.status === filterKey);
  }, [points, filterKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !boxRef.current || mapRef.current) return;
      const map = L.map(boxRef.current, { center: [-2.2, 118], zoom: 5, scrollWheelZoom: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      try {
        mapRef.current?.remove();
      } catch {
        /* abaikan */
      }
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    (async () => {
      const L = (await import('leaflet')).default;
      const map = mapRef.current;
      if (!map) return;
      if (layerRef.current) layerRef.current.remove();
      const group = L.layerGroup();
      const latlngs: [number, number][] = [];

      visible.forEach((pt) => {
        const meta = kindMeta(pt.kind);
        const color = colorFor(pt.kind, pt.status);
        const icon = L.divIcon({
          className: '',
          html: `<span class="map-pin" style="background:${color}">${meta.pinMark}</span>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        const marker = L.marker([pt.lat, pt.lng], { icon });
        marker.bindPopup(
          `<div style="min-width:220px">
             <div style="font-weight:700;font-size:12.5px;line-height:1.35;margin-bottom:4px">${escapeHtml(pt.title)}</div>
             <div style="font-size:11px;opacity:.75;margin-bottom:6px">
               ${escapeHtml(pt.code)} · ${escapeHtml(pt.category)} · ${escapeHtml(pt.status)}
               ${pt.isNational ? ' · Siaran Nasional' : pt.isPushedToCenter ? ' · Didorong ke Pusat' : ''}
             </div>
             <div style="font-size:11px;opacity:.75;margin-bottom:6px">
               ${escapeHtml(pt.location || '-')}<br/>${escapeHtml(pt.authorName)}${pt.bureauName ? ` · ${escapeHtml(pt.bureauName)}` : ' · Pusat'}
             </div>
             <a href="${p(`/dashboard/tabulasi/berita/${pt.id}`)}" style="font-size:11.5px;font-weight:700;color:var(--accent)">Buka berita →</a>
           </div>`
        );
        group.addLayer(marker);
        latlngs.push([pt.lat, pt.lng]);
      });

      group.addTo(map);
      layerRef.current = group;

      if (latlngs.length) {
        try {
          map.fitBounds(latlngs, { padding: [40, 40], maxZoom: 12 });
        } catch {
          /* abaikan */
        }
      }
    })();
  }, [visible]);

  return (
    <div className="relative">
      <div ref={boxRef} className="panel overflow-hidden" style={{ height }} />
      {!ready ? <p className="absolute inset-0 grid place-items-center text-[12px] text-muted">Memuat peta…</p> : null}
      {ready && !visible.length ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="panel shadow-soft px-3 py-1.5 text-[12px] text-muted">
            Tidak ada berita ber-geo-tag pada filter ini.
          </span>
        </div>
      ) : null}
    </div>
  );
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
