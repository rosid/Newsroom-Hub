'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';

/**
 * Pemilih titik lokasi (geo-tagging) memakai Leaflet + tile OpenStreetMap.
 * Leaflet diimpor dinamis di dalam useEffect (hanya jalan di browser).
 */
export default function GeoPicker({
  latitude,
  longitude,
  onChange,
  height = 260,
}: {
  latitude: string;
  longitude: string;
  onChange: (lat: string, lng: string) => void;
  height?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  const lat = Number(latitude);
  const lng = Number(longitude);
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng) && latitude !== '' && longitude !== '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !boxRef.current) return;

      const center: [number, number] = hasPoint ? [lat, lng] : [-2.5, 118];
      const map = L.map(boxRef.current, { center, zoom: hasPoint ? 12 : 5, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      map.on('click', (e: any) => {
        const la = Number(e.latlng.lat.toFixed(5));
        const lo = Number(e.latlng.lng.toFixed(5));
        onChange(String(la), String(lo));
      });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sinkronkan marker dengan nilai input
  useEffect(() => {
    (async () => {
      const L = (await import('leaflet')).default;
      const map = mapRef.current;
      if (!map) return;
      if (hasPoint) {
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.marker([lat, lng]).addTo(map);
        }
        map.setView([lat, lng], Math.max(map.getZoom(), 10));
      } else if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    })();
  }, [lat, lng, hasPoint]);

  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      setError('Perangkat ini tidak mendukung geolokasi.');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(pos.coords.latitude.toFixed(5), pos.coords.longitude.toFixed(5));
        setLocating(false);
      },
      (e) => {
        setError(`Gagal mengambil lokasi: ${e.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="latitude">
            Latitude
          </label>
          <input
            id="latitude"
            name="latitude"
            className="input mono"
            placeholder="-6.20000"
            value={latitude}
            onChange={(e) => onChange(e.target.value, longitude)}
          />
        </div>
        <div>
          <label className="label" htmlFor="longitude">
            Longitude
          </label>
          <input
            id="longitude"
            name="longitude"
            className="input mono"
            placeholder="106.81666"
            value={longitude}
            onChange={(e) => onChange(latitude, e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-sm" onClick={useDeviceLocation} disabled={locating}>
          <Icon name="pin" size={13} /> {locating ? 'Mencari…' : 'Gunakan lokasi perangkat'}
        </button>
        {hasPoint ? (
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={() => onChange('', '')}
          >
            <Icon name="x" size={13} /> Hapus titik
          </button>
        ) : null}
        <span className="hint">{hasPoint ? 'Klik peta untuk memindahkan titik.' : 'Klik pada peta untuk menandai lokasi liputan.'}</span>
      </div>

      {error ? <p className="text-[11.5px] text-danger">{error}</p> : null}

      <div
        ref={boxRef}
        className="panel overflow-hidden"
        style={{ height }}
        aria-label="Peta pemilih lokasi"
      >
        {!ready ? <p className="p-3 text-[12px] text-muted">Memuat peta…</p> : null}
      </div>
    </div>
  );
}
