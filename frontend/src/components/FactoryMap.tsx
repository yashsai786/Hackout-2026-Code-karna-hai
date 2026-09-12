import { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Maximize, RotateCcw, MapPinOff } from 'lucide-react';
import type { Factory } from '../domain/types';
import { Btn, compact } from './Primitives';
import 'leaflet/dist/leaflet.css';

const colors: Record<string, string> = {
  Steel: '#2c5eea',
  Cement: '#098875',
  Textiles: '#bb861b',
  Chemicals: '#dd7150',
};
const Fit = ({ factories }: { factories: Factory[]; selected: string | null }) => {
  const map = useMap();
  useEffect(() => {
    const points = factories.flatMap(f => (f.coordinates ? [f.coordinates] : []));
    if (points.length)
      map.fitBounds(L.latLngBounds(points), { padding: [50, 42], maxZoom: 6, animate: false });
  }, [map, factories]);
  useEffect(() => {
    const el = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [map]);
  useEffect(() => {
    map
      .getContainer()
      .querySelectorAll('.leaflet-control-zoom a')
      .forEach((node, i) => node.setAttribute('data-testid', `map-zoom-${i === 0 ? 'in' : 'out'}`));
    map
      .getContainer()
      .querySelectorAll('.leaflet-control-attribution a')
      .forEach((node, i) => node.setAttribute('data-testid', `map-attribution-${i}`));
  }, [map]);
  return null;
};
const ResetControl = ({ factories }: { factories: Factory[] }) => {
  const map = useMap();
  return (
    <Btn
      className="map-fit icon-btn"
      aria-label="Fit all factories"
      title="Fit all factories"
      data-testid="map-fit-all"
      onClick={() => {
        const p = factories.flatMap(f => (f.coordinates ? [f.coordinates] : []));
        if (p.length) map.fitBounds(L.latLngBounds(p), { padding: [50, 42], maxZoom: 6, animate: false });
      }}
    >
      <Maximize size={16} />
    </Btn>
  );
};
export const FactoryMap = ({
  factories,
  selected,
  onSelect,
  full = false,
}: {
  factories: Factory[];
  selected: string | null;
  onSelect: (id: string) => void;
  full?: boolean;
}) => {
  const [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0),
    successes = useRef(0);
  const points = useMemo(() => factories.filter(f => f.coordinates), [factories]);
  useEffect(() => {
    successes.current = 0;
    setFailed(false);
    const timer = window.setTimeout(() => {
      if (successes.current === 0) setFailed(true);
    }, 10000);
    return () => clearTimeout(timer);
  }, [attempt]);
  return (
    <div className={`factory-map ${full ? 'full' : ''}`} data-testid="factory-map">
      {!full && (
        <div className="map-country-label" data-testid="map-region-label">
          <span className="live-dot" />
          INDIA<span className="mono">/ {points.length} SITES</span>
        </div>
      )}
      <MapContainer
        key={attempt}
        center={[22.5, 79.5]}
        zoom={5}
        zoomSnap={0.25}
        scrollWheelZoom={false}
        zoomControl={!full}
        attributionControl={true}
        className="leaflet-map"
        aria-label="Illustrative Indian factory locations"
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
          eventHandlers={{
            tileerror: () => {
              if (successes.current === 0) setFailed(true);
            },
            tileload: () => {
              successes.current++;
              setFailed(false);
            },
          }}
        />
        {full && <ZoomControl position="topright" />}
        <Fit factories={points} selected={selected} />
        <ResetControl factories={points} />
        {points.map(f => (
          <Marker
            key={f.id}
            position={f.coordinates!}
            title={f.name}
            alt={f.name}
            icon={L.divIcon({
              className: 'factory-marker',
              html: `<span data-testid="map-marker-${f.id}" class="map-dot ${selected === f.id ? 'selected' : ''}" style="--marker-color:${colors[f.sector]}"><span></span></span>`,
              iconSize: [34, 34],
              iconAnchor: [17, 17],
            })}
            eventHandlers={{
              click: () => onSelect(f.id),
              add: event => {
                const el = event.target.getElement();
                el?.setAttribute('data-testid', `factory-pin-${f.id}`);
                el?.setAttribute('aria-label', `Select ${f.name}`);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -15]}>
              {f.name}
              <br />
              {compact(f.baseline!)} tCO₂e / year
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
      {failed && (
        <div className="map-outage" role="status" data-testid="map-outage">
          <MapPinOff size={22} />
          <strong>Map tiles are unavailable</strong>
          <span>Factory lists and typed commands remain available.</span>
          <Btn data-testid="retry-map" onClick={() => setAttempt(a => a + 1)}>
            <RotateCcw size={14} />
            Retry map
          </Btn>
        </div>
      )}
      <div className="map-legend" data-testid="map-legend">
        {Object.entries(colors).map(([s, c]) => (
          <span key={s}>
            <i style={{ background: c }} />
            {s}
          </span>
        ))}
      </div>
      {!full && (
        <div className="map-footnote" data-testid="map-location-note">
          Illustrative locations · Not facility boundaries
        </div>
      )}
    </div>
  );
};
