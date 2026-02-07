'use client';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useCallback } from 'react';

/* ── Exported types ── */
export interface Ambulance {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: 'idle' | 'en-route' | 'on-scene';
  destination?: string;
  zone?: string;
  lastUpdate: number;
}

export interface TrafficSignal {
  id: string;
  name: string;
  lat: number;
  lng: number;
  state: 'red' | 'green' | 'emergency';
  zone?: string;
}

export interface Hospital {
  id: string;
  name: string;
  lat: number;
  lng: number;
  beds: number;
  er: boolean;
  phone: string;
  zone?: string;
}

export interface IoTDevice {
  id: string;
  name: string;
  type: 'signal_controller' | 'sensor' | 'camera' | 'gateway';
  status: 'online' | 'offline' | 'warning';
  lat: number;
  lng: number;
  zone?: string;
  lastPing: number;
  firmware: string;
}

export interface Zone {
  id: string;
  name: string;
  color: string;
  active: boolean;
  lat?: number;
  lng?: number;
  radius?: number;
}

/* NEW — Emergency route data passed by parent */
export interface EmergencyRoute {
  ambulanceId: string;
  ambulanceLat: number;
  ambulanceLng: number;
  hospitalId: string;
  hospitalLat: number;
  hospitalLng: number;
  hospitalName: string;
  /** Optional intermediate waypoints (from OSRM or similar) */
  waypoints?: [number, number][];
}

interface Props {
  ambulances: Ambulance[];
  trafficSignals: TrafficSignal[];
  hospitals: Hospital[];
  iotDevices: IoTDevice[];
  zones: Zone[];
  isEmergency: boolean;
  userLocation: { lat: number; lng: number } | null;
  activeZoneFilter: string | null;
  onAmbulanceClick?: (id: string) => void;
  /** When set, shows animated route line + highlighted signals */
  emergencyRoute?: EmergencyRoute | null;
  /** When set, smoothly pans map to this ambulance and highlights it */
  focusAmbulanceId?: string | null;
}

/* ── Helpers ── */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Check if a point is within `thresholdKm` of a polyline segment */
function isNearRoute(lat: number, lng: number, routePoints: [number, number][], thresholdKm = 0.5): boolean {
  for (let i = 0; i < routePoints.length - 1; i++) {
    const [aLat, aLng] = routePoints[i];
    const [bLat, bLng] = routePoints[i + 1];
    // Distance from point to segment (approx: distance to midpoint or endpoints)
    const dA = haversineKm(lat, lng, aLat, aLng);
    const dB = haversineKm(lat, lng, bLat, bLng);
    const dMid = haversineKm(lat, lng, (aLat + bLat) / 2, (aLng + bLng) / 2);
    if (Math.min(dA, dB, dMid) < thresholdKm) return true;
  }
  return false;
}

/* ── Icon helpers ── */
function mkAmbulanceIcon(status: string, isRouteAmb = false) {
  const bg = status === 'en-route' ? '#ef4444' : status === 'on-scene' ? '#f59e0b' : '#22c55e';
  const size = isRouteAmb ? 48 : 38;
  const glow = isRouteAmb ? 'box-shadow:0 0 20px 6px rgba(239,68,68,.6),0 2px 8px rgba(0,0,0,.35);' : 'box-shadow:0 2px 8px rgba(0,0,0,.35);';
  return L.divIcon({
    className: 'leaflet-marker-custom',
    html: `<div style="background:${bg};width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${isRouteAmb ? 22 : 18}px;border:3px solid #fff;${glow}animation:pulse-marker 1.2s infinite">🚑</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function mkHospitalIcon(isTarget = false) {
  const size = isTarget ? 44 : 34;
  const glow = isTarget
    ? 'box-shadow:0 0 20px 6px rgba(59,130,246,.6),0 2px 8px rgba(0,0,0,.35);animation:pulse-marker 1.2s infinite;'
    : 'box-shadow:0 2px 8px rgba(0,0,0,.35);';
  return L.divIcon({
    className: 'leaflet-marker-custom',
    html: `<div style="background:${isTarget ? '#2563eb' : '#3b82f6'};width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${isTarget ? 20 : 16}px;border:3px solid #fff;${glow}">🏥</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function mkIotIcon(status: string) {
  const bg = status === 'online' ? '#22c55e' : status === 'warning' ? '#f59e0b' : '#6b7280';
  return L.divIcon({
    className: 'leaflet-marker-custom',
    html: `<div style="background:${bg};width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25)">📡</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function mkSignalIcon(state: string, isOnRoute = false) {
  const fillColor = state === 'emergency'
    ? '#ef4444'
    : state === 'green'
    ? '#22c55e'
    : '#ef4444';
  const size = isOnRoute ? 14 : 8;
  const ring = isOnRoute ? `box-shadow:0 0 12px 4px ${state === 'emergency' ? 'rgba(239,68,68,.7)' : 'rgba(239,68,68,.5)'};` : '';
  return { fillColor, size, ring, isOnRoute };
}

const userIcon = L.divIcon({
  className: 'leaflet-marker-custom',
  html: `<div style="background:#6366f1;width:20px;height:20px;border-radius:50%;border:4px solid #fff;box-shadow:0 0 0 4px rgba(99,102,241,.35),0 2px 8px rgba(0,0,0,.3)"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

/* ── Popup builders ── */
function ambulancePopup(a: Ambulance) {
  const sc = a.status === 'en-route' ? '#ef4444' : a.status === 'on-scene' ? '#f59e0b' : '#22c55e';
  return `<div style="font-family:Inter,sans-serif;min-width:180px">
    <strong style="font-size:1.05em">🚑 ${a.name}</strong>
    <hr style="margin:6px 0;border:none;border-top:1px solid #333"/>
    <div style="margin:3px 0"><b>Status:</b> <span style="color:${sc}">${a.status.toUpperCase()}</span></div>
    ${a.destination ? `<div style="margin:3px 0"><b>Dest:</b> ${a.destination}</div>` : ''}
    ${a.zone ? `<div style="margin:3px 0"><b>Zone:</b> ${a.zone}</div>` : ''}
    <div style="margin:3px 0;font-size:.8em;color:#999">${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}</div>
  </div>`;
}

function hospitalPopup(h: Hospital, isTarget = false) {
  return `<div style="font-family:Inter,sans-serif;min-width:180px">
    ${isTarget ? '<div style="color:#ef4444;font-weight:800;font-size:12px;margin-bottom:4px">📍 EMERGENCY DESTINATION</div>' : ''}
    <strong>🏥 ${h.name}</strong>
    <hr style="margin:6px 0;border:none;border-top:1px solid #333"/>
    <div style="margin:3px 0"><b>Beds:</b> ${h.beds}</div>
    <div style="margin:3px 0"><b>ER:</b> ${h.er ? '✅ Available' : '❌ Full'}</div>
    <div style="margin:3px 0"><b>Phone:</b> ${h.phone}</div>
    ${isTarget ? `<div style="margin:6px 0;font-size:11px;color:#6366f1">Distance shown on route line</div>` : ''}
  </div>`;
}

function signalPopup(sig: TrafficSignal, isOnRoute = false) {
  const c = sig.state === 'green' ? '#22c55e' : '#ef4444';
  return `<div style="font-family:Inter,sans-serif">
    ${isOnRoute ? '<div style="color:#f59e0b;font-weight:800;font-size:11px;margin-bottom:4px">⚠️ ON EMERGENCY ROUTE</div>' : ''}
    <strong>🚦 ${sig.name}</strong><br/>
    State: <span style="font-weight:700;color:${c}">${sig.state.toUpperCase()}</span>
    ${isOnRoute ? '<br/><span style="font-size:11px;color:#f59e0b">Signal will switch to EMERGENCY mode</span>' : ''}
  </div>`;
}

function iotPopup(d: IoTDevice) {
  const c = d.status === 'online' ? '#22c55e' : d.status === 'warning' ? '#f59e0b' : '#ef4444';
  return `<div style="font-family:Inter,sans-serif">
    <strong>📡 ${d.name}</strong><br/>
    Type: ${d.type.replace('_', ' ')}<br/>
    Status: <span style="color:${c}">${d.status.toUpperCase()}</span><br/>
    <span style="font-size:.8em;color:#888">FW: ${d.firmware}</span>
  </div>`;
}

function zonePopup(z: Zone) {
  return `<div style="font-family:Inter,sans-serif">
    <strong>🗺️ Zone: ${z.name}</strong><br/>
    Status: <span style="color:${z.active ? '#22c55e' : '#888'}">${z.active ? 'ACTIVE' : 'INACTIVE'}</span>
  </div>`;
}

/* ══════════════════════════════════════════════════════════
   MapSection — pure Leaflet (no react-leaflet MapContainer).
   Now supports emergency route rendering.
   ══════════════════════════════════════════════════════════ */
export default function MapSection({
  ambulances,
  trafficSignals,
  hospitals,
  iotDevices,
  zones,
  isEmergency,
  userLocation,
  activeZoneFilter,
  onAmbulanceClick,
  emergencyRoute,
  focusAmbulanceId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  const filtered = useCallback(
    <T extends { zone?: string }>(items: T[]): T[] =>
      activeZoneFilter ? items.filter((i) => i.zone === activeZoneFilter) : items,
    [activeZoneFilter],
  );

  /* ── 1. Create Leaflet map once ── */
  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [28.6139, 77.209],
      zoom: 13,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    }).addTo(map);

    const layers = L.layerGroup().addTo(map);
    const routeLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    layersRef.current = layers;
    routeLayerRef.current = routeLayer;

    setTimeout(() => map.invalidateSize(), 250);

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  /* ── 2. Draw markers / overlays ── */
  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;

    layers.clearLayers();

    // Build route points for "near route" signal detection
    let routePoints: [number, number][] = [];
    if (emergencyRoute) {
      if (emergencyRoute.waypoints && emergencyRoute.waypoints.length > 0) {
        routePoints = emergencyRoute.waypoints;
      } else {
        routePoints = [
          [emergencyRoute.ambulanceLat, emergencyRoute.ambulanceLng],
          [emergencyRoute.hospitalLat, emergencyRoute.hospitalLng],
        ];
      }
    }

    // User location
    if (userLocation) {
      L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .bindPopup('<strong>📍 Your Location</strong>')
        .addTo(layers);
      L.circle([userLocation.lat, userLocation.lng], {
        radius: 200, color: '#6366f1', fillOpacity: 0.08, weight: 1,
      }).addTo(layers);
      map.flyTo([userLocation.lat, userLocation.lng], 14, { duration: 1.2 });
    }

    // Zones
    zones.filter((z) => z.lat && z.lng && z.radius).forEach((z) => {
      L.circle([z.lat!, z.lng!], {
        radius: z.radius!, color: z.color, fillColor: z.color,
        fillOpacity: z.active ? 0.12 : 0.04, weight: 2,
        dashArray: z.active ? '' : '8 4',
      }).bindPopup(zonePopup(z)).addTo(layers);
    });

    // Ambulances
    filtered(ambulances).forEach((a) => {
      const isRouteAmb = emergencyRoute?.ambulanceId === a.id;
      const m = L.marker([a.lat, a.lng], { icon: mkAmbulanceIcon(a.status, isRouteAmb), zIndexOffset: isRouteAmb ? 1000 : 0 })
        .bindPopup(ambulancePopup(a))
        .addTo(layers);
      if (onAmbulanceClick) m.on('click', () => onAmbulanceClick(a.id));
    });

    // Hospitals
    filtered(hospitals).forEach((h) => {
      const isTarget = emergencyRoute?.hospitalId === h.id;
      L.marker([h.lat, h.lng], { icon: mkHospitalIcon(isTarget), zIndexOffset: isTarget ? 900 : 0 })
        .bindPopup(hospitalPopup(h, isTarget))
        .addTo(layers);
    });

    // Traffic signals — highlight those on route
    filtered(trafficSignals).forEach((sig) => {
      const onRoute = routePoints.length > 0 && isNearRoute(sig.lat, sig.lng, routePoints, 0.5);
      const si = mkSignalIcon(sig.state, onRoute);
      L.circleMarker([sig.lat, sig.lng], {
        radius: si.size,
        fillColor: onRoute ? '#f59e0b' : si.fillColor,
        fillOpacity: 0.9,
        color: onRoute ? '#f59e0b' : '#fff',
        weight: onRoute ? 3 : 2,
      }).bindPopup(signalPopup(sig, onRoute)).addTo(layers);

      // Extra glow ring for on-route signals
      if (onRoute) {
        L.circleMarker([sig.lat, sig.lng], {
          radius: 20, fillColor: '#f59e0b', fillOpacity: 0.15,
          color: '#f59e0b', weight: 1,
        }).addTo(layers);
      }
    });

    // IoT devices
    filtered(iotDevices).forEach((d) => {
      L.marker([d.lat, d.lng], { icon: mkIotIcon(d.status) })
        .bindPopup(iotPopup(d))
        .addTo(layers);
    });

    // Tracked ambulance highlight ring + auto-pan
    if (focusAmbulanceId) {
      const tracked = ambulances.find(a => a.id === focusAmbulanceId);
      if (tracked) {
        // Pulsing outer ring
        L.circleMarker([tracked.lat, tracked.lng], {
          radius: 28, fillColor: '#6366f1', fillOpacity: 0.12,
          color: '#6366f1', weight: 2, dashArray: '6 4',
        }).addTo(layers);
        // Solid inner ring
        L.circleMarker([tracked.lat, tracked.lng], {
          radius: 18, fillColor: '#6366f1', fillOpacity: 0.06,
          color: '#818cf8', weight: 3,
        }).addTo(layers);
        // Pan to tracked ambulance if not showing emergency route
        if (!emergencyRoute) {
          map.flyTo([tracked.lat, tracked.lng], 15, { duration: 0.8 });
        }
      }
    }
  }, [ambulances, trafficSignals, hospitals, iotDevices, zones, userLocation, activeZoneFilter, isEmergency, filtered, onAmbulanceClick, emergencyRoute, focusAmbulanceId]);

  /* ── 3. Draw emergency route line (separate layer so it can pulse) ── */
  useEffect(() => {
    const map = mapRef.current;
    const routeLayer = routeLayerRef.current;
    if (!map || !routeLayer) return;

    routeLayer.clearLayers();

    if (!emergencyRoute) return;

    const { ambulanceLat, ambulanceLng, hospitalLat, hospitalLng, hospitalName, waypoints } = emergencyRoute;

    // Build polyline points
    let linePoints: [number, number][];
    if (waypoints && waypoints.length > 0) {
      linePoints = waypoints;
    } else {
      // Straight line with intermediate bezier-like points for visual curve
      const midLat = (ambulanceLat + hospitalLat) / 2;
      const midLng = (ambulanceLng + hospitalLng) / 2;
      const offset = 0.003; // slight curve
      linePoints = [
        [ambulanceLat, ambulanceLng],
        [midLat + offset, midLng - offset],
        [hospitalLat, hospitalLng],
      ];
    }

    // Background route line (wider, translucent)
    L.polyline(linePoints, {
      color: '#ef4444',
      weight: 8,
      opacity: 0.25,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(routeLayer);

    // Animated dashed route line
    L.polyline(linePoints, {
      color: '#ef4444',
      weight: 4,
      opacity: 0.9,
      dashArray: '12 8',
      lineCap: 'round',
      lineJoin: 'round',
      className: 'emergency-route-line',
    }).addTo(routeLayer);

    // Route glow
    L.polyline(linePoints, {
      color: '#ff6b6b',
      weight: 12,
      opacity: 0.1,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(routeLayer);

    // Distance label at midpoint
    const dist = haversineKm(ambulanceLat, ambulanceLng, hospitalLat, hospitalLng);
    const eta = Math.max(1, Math.round(dist * 3)); // rough ETA: 3 min per km in city
    const midIdx = Math.floor(linePoints.length / 2);
    const labelPos = linePoints[midIdx];

    L.marker(labelPos, {
      icon: L.divIcon({
        className: 'route-label',
        html: `<div class="route-label-inner">
          <div class="rl-dist">${dist.toFixed(1)} km</div>
          <div class="rl-eta">~${eta} min ETA</div>
          <div class="rl-dest">→ ${hospitalName}</div>
        </div>`,
        iconSize: [140, 48],
        iconAnchor: [70, 24],
      }),
    }).addTo(routeLayer);

    // Fit map bounds to show full route
    const bounds = L.latLngBounds(linePoints.map(([lat, lng]) => [lat, lng] as [number, number]));
    map.fitBounds(bounds.pad(0.3), { duration: 1 });

  }, [emergencyRoute]);

  return (
    <div
      ref={containerRef}
      style={{ height: '100%', width: '100%', borderRadius: '10px', background: '#0a0e1a' }}
    />
  );
}

/* ── Utility: find nearest hospital with ER from ambulance position ── */
export function findNearestHospital(
  ambulanceLat: number,
  ambulanceLng: number,
  hospitals: Hospital[],
): Hospital | null {
  const erHospitals = hospitals.filter(h => h.er && h.beds > 0);
  if (erHospitals.length === 0) return hospitals[0] ?? null;

  let nearest: Hospital | null = null;
  let minDist = Infinity;
  for (const h of erHospitals) {
    const d = haversineKm(ambulanceLat, ambulanceLng, h.lat, h.lng);
    if (d < minDist) {
      minDist = d;
      nearest = h;
    }
  }
  return nearest;
}
