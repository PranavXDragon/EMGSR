'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback, useRef } from 'react';
import { database, ref, set, onValue, push, update, get } from '@/lib/firebase';
import Link from 'next/link';
import type { Ambulance, TrafficSignal, Hospital, IoTDevice, Zone, EmergencyRoute } from '@/components/MapSection';

const MapSection = dynamic(() => import('@/components/MapSection'), { ssr: false });

/* ───── Types ───── */
interface LogEntry { id: string; time: string; message: string; type: 'normal' | 'emergency' | 'warning'; }
interface Incident {
  id: string; title: string; description: string; zone: string; severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in-progress' | 'resolved'; createdAt: number; closedAt?: number;
  ambulanceId?: string; hospitalId?: string;
}

type Tab = 'overview' | 'map' | 'fleet' | 'zones' | 'hospitals' | 'incidents' | 'iot' | 'logs';

/* ═════════════════════════════════════════════════════════ */
export default function Home() {
  /* ── Core ── */
  const [isEmergency, setIsEmergency] = useState(false);
  const [systemStatus, setSystemStatus] = useState('Connecting...');
  const [connected, setConnected] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode] = useState(true); // control center always dark by default
  const [currentTime, setCurrentTime] = useState('');

  /* ── Stats ── */
  const [totalActivations, setTotalActivations] = useState(0);
  const [avgResponseTime, setAvgResponseTime] = useState('--');
  const [uptime, setUptime] = useState('00:00:00');
  const [startTime] = useState(Date.now());

  /* ── Data ── */
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [trafficSignals, setTrafficSignals] = useState<TrafficSignal[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [iotDevices, setIoTDevices] = useState<IoTDevice[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);

  /* ── GPS ── */
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'off' | 'acquiring' | 'active' | 'error'>('off');
  const gpsWatchRef = useRef<number | null>(null);

  /* ── Filters ── */
  const [activeZoneFilter, setActiveZoneFilter] = useState<string | null>(null);
  const [selectedAmbulance, setSelectedAmbulance] = useState<string | null>(null);

  /* ── Emergency Route ── */
  const [emergencyRoute, setEmergencyRoute] = useState<EmergencyRoute | null>(null);

  /* ── Ambulance Tracking ── */
  const [trackedAmbulanceId, setTrackedAmbulanceId] = useState<string | null>(null);
  const trackedAmbulance = trackedAmbulanceId ? ambulances.find(a => a.id === trackedAmbulanceId) ?? null : null;

  /* ── Incident form ── */
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentForm, setIncidentForm] = useState({ title: '', description: '', zone: '', severity: 'medium' as Incident['severity'] });

  /* ═══ Helpers ═══ */
  const addLog = useCallback((message: string, type: LogEntry['type'] = 'normal') => {
    const entry: LogEntry = { id: crypto.randomUUID?.() ?? String(Date.now()), time: new Date().toLocaleTimeString(), message, type };
    setLogEntries(prev => [entry, ...prev].slice(0, 100));
    push(ref(database, 'logs'), { time: new Date().toISOString(), message, type }).catch(() => {});
  }, []);

  /* ═══ GPS Live Tracking ═══ */
  const startGPS = useCallback(() => {
    if (!navigator.geolocation) { setGpsStatus('error'); return; }
    setGpsStatus('acquiring');
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setGpsStatus('active');
        // Push to Firebase so other clients see this ambulance
        update(ref(database, 'ambulances/MY-UNIT'), {
          name: 'MY-UNIT', lat: loc.lat, lng: loc.lng, status: 'en-route',
          lastUpdate: Date.now(), zone: 'Zone-A',
        }).catch(() => {});
      },
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
    addLog('📍 GPS tracking started', 'normal');
  }, [addLog]);

  const stopGPS = useCallback(() => {
    if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
    gpsWatchRef.current = null;
    setGpsStatus('off');
    addLog('📍 GPS tracking stopped', 'normal');
  }, [addLog]);

  /* ═══ Firebase listeners ═══ */
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(onValue(ref(database, 'signal/emergency'), s => {
      const v = s.val(); if (v !== null) setIsEmergency(v);
      setConnected(true); setSystemStatus('Operational');
    }, () => { setConnected(false); setSystemStatus('Disconnected'); }));

    unsubs.push(onValue(ref(database, 'stats'), s => {
      const d = s.val(); if (d) { setTotalActivations(d.totalActivations ?? 0); setAvgResponseTime(d.avgResponseTime ? `${d.avgResponseTime}s` : '--'); }
    }));

    unsubs.push(onValue(ref(database, 'ambulances'), s => {
      const d = s.val(); if (d) setAmbulances(Object.entries(d).map(([k, v]: [string, any]) => ({
        id: k, name: v.name ?? k, lat: v.lat ?? 0, lng: v.lng ?? 0, status: v.status ?? 'idle',
        destination: v.destination, zone: v.zone, lastUpdate: v.lastUpdate ?? Date.now(),
      })));
    }));

    unsubs.push(onValue(ref(database, 'trafficSignals'), s => {
      const d = s.val(); if (d) setTrafficSignals(Object.entries(d).map(([k, v]: [string, any]) => ({
        id: k, name: v.name ?? k, lat: v.lat ?? 0, lng: v.lng ?? 0, state: v.state ?? 'red', zone: v.zone,
      })));
    }));

    unsubs.push(onValue(ref(database, 'hospitals'), s => {
      const d = s.val(); if (d) setHospitals(Object.entries(d).map(([k, v]: [string, any]) => ({
        id: k, name: v.name ?? k, lat: v.lat ?? 0, lng: v.lng ?? 0, beds: v.beds ?? 0,
        er: v.er ?? false, phone: v.phone ?? '', zone: v.zone,
      })));
    }));

    unsubs.push(onValue(ref(database, 'iot'), s => {
      const d = s.val(); if (d) setIoTDevices(Object.entries(d).map(([k, v]: [string, any]) => ({
        id: k, name: v.name ?? k, type: v.type ?? 'sensor', status: v.status ?? 'offline',
        lat: v.lat ?? 0, lng: v.lng ?? 0, zone: v.zone, lastPing: v.lastPing ?? 0, firmware: v.firmware ?? '1.0',
      })));
    }));

    unsubs.push(onValue(ref(database, 'zones'), s => {
      const d = s.val(); if (d) setZones(Object.entries(d).map(([k, v]: [string, any]) => ({
        id: k, name: v.name ?? k, color: v.color ?? '#6366f1', active: v.active ?? false,
        lat: v.lat, lng: v.lng, radius: v.radius,
      })));
    }));

    unsubs.push(onValue(ref(database, 'incidents'), s => {
      const d = s.val(); if (d) setIncidents(Object.entries(d).map(([k, v]: [string, any]) => ({
        id: k, ...v,
      })).sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0)));
    }));

    seedDemoData();
    return () => unsubs.forEach(u => u());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clock + uptime
  useEffect(() => {
    const t = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
      const d = Date.now() - startTime;
      setUptime(`${String(Math.floor(d / 3600000)).padStart(2, '0')}:${String(Math.floor((d % 3600000) / 60000)).padStart(2, '0')}:${String(Math.floor((d % 60000) / 1000)).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(t);
  }, [startTime]);

  // Auto-start GPS on load
  useEffect(() => {
    if (gpsStatus === 'off') startGPS();
    return () => {
      if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ═══ Seed demo data ═══ */
  async function seedDemoData() {
    try {
      // Zones
      if (!(await get(ref(database, 'zones'))).exists()) {
        await set(ref(database, 'zones'), {
          'Zone-A': { name: 'Zone A — Downtown', color: '#6366f1', active: true, lat: 28.6139, lng: 77.2090, radius: 2000 },
          'Zone-B': { name: 'Zone B — North District', color: '#f59e0b', active: true, lat: 28.6280, lng: 77.2180, radius: 1800 },
          'Zone-C': { name: 'Zone C — South Corridor', color: '#22c55e', active: false, lat: 28.6000, lng: 77.2000, radius: 2200 },
        });
      }
      // Ambulances
      if (!(await get(ref(database, 'ambulances'))).exists()) {
        await set(ref(database, 'ambulances'), {
          'AMB-101': { name: 'AMB-101', lat: 28.6145, lng: 77.2075, status: 'idle', zone: 'Zone-A', lastUpdate: Date.now() },
          'AMB-102': { name: 'AMB-102', lat: 28.6210, lng: 77.2155, status: 'en-route', destination: 'AIIMS Hospital', zone: 'Zone-A', lastUpdate: Date.now() },
          'AMB-103': { name: 'AMB-103', lat: 28.6280, lng: 77.2190, status: 'on-scene', zone: 'Zone-B', lastUpdate: Date.now() },
          'AMB-104': { name: 'AMB-104', lat: 28.6050, lng: 77.1980, status: 'idle', zone: 'Zone-C', lastUpdate: Date.now() },
          'AMB-105': { name: 'AMB-105', lat: 28.6175, lng: 77.2110, status: 'en-route', destination: 'City General', zone: 'Zone-B', lastUpdate: Date.now() },
        });
      }
      // Traffic Signals
      if (!(await get(ref(database, 'trafficSignals'))).exists()) {
        await set(ref(database, 'trafficSignals'), {
          'SIG-01': { name: 'Connaught Place Jn', lat: 28.6138, lng: 77.2090, state: 'green', zone: 'Zone-A' },
          'SIG-02': { name: 'Rajiv Chowk', lat: 28.6155, lng: 77.2115, state: 'red', zone: 'Zone-A' },
          'SIG-03': { name: 'ITO Junction', lat: 28.6200, lng: 77.2170, state: 'green', zone: 'Zone-B' },
          'SIG-04': { name: 'Mandi House', lat: 28.6185, lng: 77.2135, state: 'red', zone: 'Zone-A' },
          'SIG-05': { name: 'AIIMS Flyover', lat: 28.5685, lng: 77.2100, state: 'green', zone: 'Zone-C' },
          'SIG-06': { name: 'Ring Road Gate 5', lat: 28.6090, lng: 77.2040, state: 'red', zone: 'Zone-C' },
        });
      }
      // Hospitals
      if (!(await get(ref(database, 'hospitals'))).exists()) {
        await set(ref(database, 'hospitals'), {
          'HSP-01': { name: 'AIIMS Hospital', lat: 28.5672, lng: 77.2100, beds: 120, er: true, phone: '+91-11-26588500', zone: 'Zone-C' },
          'HSP-02': { name: 'Safdarjung Hospital', lat: 28.5684, lng: 77.2076, beds: 85, er: true, phone: '+91-11-26707419', zone: 'Zone-C' },
          'HSP-03': { name: 'Ram Manohar Lohia', lat: 28.6250, lng: 77.2050, beds: 60, er: false, phone: '+91-11-23404446', zone: 'Zone-A' },
          'HSP-04': { name: 'City General Hospital', lat: 28.6300, lng: 77.2200, beds: 45, er: true, phone: '+91-11-23456789', zone: 'Zone-B' },
        });
      }
      // IoT Devices
      if (!(await get(ref(database, 'iot'))).exists()) {
        await set(ref(database, 'iot'), {
          'IOT-001': { name: 'Signal Controller #1', type: 'signal_controller', status: 'online', lat: 28.6138, lng: 77.2090, zone: 'Zone-A', lastPing: Date.now(), firmware: 'v2.4.1' },
          'IOT-002': { name: 'Traffic Sensor N1', type: 'sensor', status: 'online', lat: 28.6200, lng: 77.2170, zone: 'Zone-B', lastPing: Date.now(), firmware: 'v1.8.0' },
          'IOT-003': { name: 'Junction Camera A', type: 'camera', status: 'warning', lat: 28.6155, lng: 77.2115, zone: 'Zone-A', lastPing: Date.now() - 120000, firmware: 'v3.1.2' },
          'IOT-004': { name: 'Gateway Hub South', type: 'gateway', status: 'online', lat: 28.6050, lng: 77.1980, zone: 'Zone-C', lastPing: Date.now(), firmware: 'v4.0.0' },
          'IOT-005': { name: 'Signal Controller #2', type: 'signal_controller', status: 'offline', lat: 28.6090, lng: 77.2040, zone: 'Zone-C', lastPing: Date.now() - 600000, firmware: 'v2.3.5' },
        });
      }
      // Stats
      if (!(await get(ref(database, 'stats'))).exists()) {
        await set(ref(database, 'stats'), { totalActivations: 0, avgResponseTime: 0 });
      }
      // Initial incident
      if (!(await get(ref(database, 'incidents'))).exists()) {
        await set(ref(database, 'incidents'), {
          'INC-001': { title: 'Multi-vehicle accident on Ring Road', description: 'Reported 3-car pileup near Gate 5. Ambulance dispatched.', zone: 'Zone-C', severity: 'high', status: 'resolved', createdAt: Date.now() - 3600000, closedAt: Date.now() - 1800000, ambulanceId: 'AMB-104', hospitalId: 'HSP-01' },
        });
      }
    } catch (e) { console.error('Seed error:', e); }
  }

  /* ═══ Actions ═══ */
  const handleEmergency = async (state: boolean) => {
    setSystemStatus(state ? 'Activating...' : 'Deactivating...');
    try {
      await set(ref(database, 'signal/emergency'), state);
      if (state) {
        const snap = await get(ref(database, 'stats'));
        await update(ref(database, 'stats'), { totalActivations: (snap.val()?.totalActivations ?? 0) + 1, avgResponseTime: Math.floor(Math.random() * 15 + 8) });
        for (const sig of trafficSignals) await update(ref(database, `trafficSignals/${sig.id}`), { state: 'emergency' });

        // ── Find nearest hospital & build emergency route ──
        const routeAmb = selectedAmbulance
          ? ambulances.find(a => a.id === selectedAmbulance)
          : ambulances.find(a => a.status === 'en-route') ?? ambulances[0];
        if (routeAmb && hospitals.length > 0) {
          const { findNearestHospital } = await import('@/components/MapSection');
          const nearest = findNearestHospital(routeAmb.lat, routeAmb.lng, hospitals);
          if (nearest) {
            setEmergencyRoute({
              ambulanceId: routeAmb.id,
              ambulanceLat: routeAmb.lat,
              ambulanceLng: routeAmb.lng,
              hospitalId: nearest.id,
              hospitalLat: nearest.lat,
              hospitalLng: nearest.lng,
              hospitalName: nearest.name,
            });
            addLog(`🗺️ Route: ${routeAmb.name} → ${nearest.name}`, 'emergency');
            setActiveTab('map'); // auto-switch to map
          }
        }
      } else {
        setEmergencyRoute(null);
        for (const sig of trafficSignals) await update(ref(database, `trafficSignals/${sig.id}`), { state: Math.random() > 0.5 ? 'green' : 'red' });
      }
      addLog(state ? '🚨 EMERGENCY — All signals overridden' : '✅ Normal traffic restored', state ? 'emergency' : 'normal');
      setSystemStatus('Operational');
    } catch { setSystemStatus('Error'); addLog('⚠️ Action failed', 'warning'); }
  };

  const updateAmbStatus = async (id: string, status: Ambulance['status']) => {
    await update(ref(database, `ambulances/${id}`), { status, lastUpdate: Date.now() }).catch(() => {});
    addLog(`🚑 ${id} → ${status.toUpperCase()}`, status === 'en-route' ? 'emergency' : 'normal');
  };

  const toggleZone = async (id: string, active: boolean) => {
    await update(ref(database, `zones/${id}`), { active }).catch(() => {});
    addLog(`🗺️ ${id} ${active ? 'activated' : 'deactivated'}`, active ? 'emergency' : 'normal');
  };

  const trackAmbulance = (id: string | null) => {
    setTrackedAmbulanceId(prev => prev === id ? null : id);
    if (id) {
      const a = ambulances.find(a => a.id === id);
      addLog(`📡 Now tracking ${a?.name ?? id}`, 'normal');
      setActiveTab('map');
    } else {
      addLog('📡 Stopped tracking', 'normal');
    }
  };

  const createIncident = async () => {
    if (!incidentForm.title) return;
    const newRef = push(ref(database, 'incidents'));
    await set(newRef, { ...incidentForm, status: 'open', createdAt: Date.now() });
    addLog(`📝 Incident: ${incidentForm.title}`, 'warning');
    setIncidentForm({ title: '', description: '', zone: '', severity: 'medium' });
    setShowIncidentForm(false);
  };

  const updateIncidentStatus = async (id: string, status: Incident['status']) => {
    const upd: any = { status };
    if (status === 'resolved') upd.closedAt = Date.now();
    await update(ref(database, `incidents/${id}`), upd).catch(() => {});
    addLog(`📝 Incident ${id} → ${status}`, 'normal');
  };

  /* ═══ Helpers ═══ */
  const statusClr = (s: string) => s === 'en-route' ? '#ef4444' : s === 'on-scene' ? '#f59e0b' : '#22c55e';
  const sevClr = (s: string) => s === 'critical' ? '#ef4444' : s === 'high' ? '#f97316' : s === 'medium' ? '#f59e0b' : '#22c55e';
  const iotClr = (s: string) => s === 'online' ? '#22c55e' : s === 'warning' ? '#f59e0b' : '#6b7280';
  const timeAgo = (ts: number) => { const d = Math.floor((Date.now() - ts) / 1000); return d < 60 ? `${d}s` : d < 3600 ? `${Math.floor(d / 60)}m` : `${Math.floor(d / 3600)}h`; };

  const navItems: { key: Tab; icon: string; label: string }[] = [
    { key: 'overview', icon: '📊', label: 'Overview' },
    { key: 'map', icon: '🗺️', label: 'Live Map' },
    { key: 'fleet', icon: '🚑', label: 'Fleet' },
    { key: 'zones', icon: '🏗️', label: 'Zones' },
    { key: 'hospitals', icon: '🏥', label: 'Hospitals' },
    { key: 'incidents', icon: '📝', label: 'Incidents' },
    { key: 'iot', icon: '📡', label: 'IoT Devices' },
    { key: 'logs', icon: '📋', label: 'Logs' },
  ];

  /* ════════════════════════ RENDER ════════════════════════ */
  return (
    <div className={`app has-bnav ${darkMode ? 'dark' : ''}`}>
      {/* SIDEBAR BACKDROP (mobile) */}
      <div className={`sb-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* ─── SIDEBAR ─── */}
      <aside className={`sb ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sb-head">
          <div className="sb-brand">
            <span className="sb-logo">🚦</span>
            {sidebarOpen && <div className="sb-title">Traffic Control<span>Center</span></div>}
          </div>
          <button className="sb-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>{sidebarOpen ? '◂' : '▸'}</button>
        </div>
        <nav className="sb-nav">
          {navItems.map(n => (
            <button key={n.key} className={`sb-item ${activeTab === n.key ? 'on' : ''}`} onClick={() => { setActiveTab(n.key); setSidebarOpen(false); }}>
              <span className="sb-icon">{n.icon}</span>{sidebarOpen && <span>{n.label}</span>}
            </button>
          ))}
        </nav>
        <div className="sb-foot">
          <div className="sb-gps">
            <button className={`gps-btn ${gpsStatus}`} onClick={gpsStatus === 'active' ? stopGPS : startGPS}>
              {gpsStatus === 'active' ? '📍 GPS ON' : gpsStatus === 'acquiring' ? '⏳ Acquiring...' : gpsStatus === 'error' ? '❌ GPS Fail' : '📍 Start GPS'}
            </button>
          </div>
          <Link href="/ambulance" className="switch-dash-btn">🚑 Ambulance Dashboard</Link>
          <Link href="/" className="switch-dash-btn" style={{ marginTop: 4 }}>🏠 Home</Link>
          <div className="sb-conn"><span className={`dot ${connected ? 'on' : 'off'}`}></span>{sidebarOpen && <span>{connected ? 'Connected' : 'Offline'}</span>}</div>
        </div>
      </aside>

      {/* ─── MAIN ─── */}
      <main className="mn">
        {/* Top bar */}
        <header className="tb">
          <div className="tb-l">
            <button className="mob-menu" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
            <h1 className="tb-title">{navItems.find(n => n.key === activeTab)?.icon} {navItems.find(n => n.key === activeTab)?.label}</h1>
          </div>
          <div className="tb-r">
            <div className="tb-clock">{currentTime}</div>
            <div className="tb-chip"><span className="tb-chip-label">Uptime</span><span className="tb-chip-val">{uptime}</span></div>
            <div className={`tb-badge ${isEmergency ? 'em' : ''}`}>{isEmergency ? '🚨 EMERGENCY' : '✅ NORMAL'}</div>
            {trackedAmbulance && (
              <button className="tb-track" onClick={() => { setActiveTab('map'); }}>
                <span className="tb-track-dot"></span>
                📡 {trackedAmbulance.name}
              </button>
            )}
          </div>
        </header>

        {/* ════ OVERVIEW ════ */}
        {activeTab === 'overview' && (
          <div className="content fade">
            {/* alert banner */}
            <div className={`alert-bar ${isEmergency ? 'em' : ''}`}>
              <div className="alert-l"><span className="alert-ico">{isEmergency ? '🚨' : '🆘'}</span><div><div className="alert-t">{isEmergency ? 'EMERGENCY MODE ACTIVE' : 'EMERGENCY HOTLINE'}</div><div className="alert-n">{isEmergency ? 'All signals overridden — route cleared' : '911 / 102'}</div></div></div>
              <span className="live">● LIVE</span>
            </div>

            {/* status */}
            <div className={`hero ${isEmergency ? 'em' : 'ok'}`}>
              <div className="hero-ico">{isEmergency ? '🚨' : '✅'}</div>
              <div className="hero-txt">{isEmergency ? 'Emergency Route Active' : 'Normal Traffic Flow'}</div>
              <div className="hero-sub">{isEmergency ? 'All traffic signals cleared for ambulance passage' : 'All systems operational — Standing by'}</div>
            </div>

            {/* controls */}
            <div className="ctrl2">
              <button className="cbtn em" onClick={() => setShowModal(true)} disabled={isEmergency}><span className="cbtn-i">🚨</span><span className="cbtn-t">Activate Emergency</span><span className="cbtn-d">Override all signals</span></button>
              <button className="cbtn ok" onClick={() => handleEmergency(false)} disabled={!isEmergency}><span className="cbtn-i">✅</span><span className="cbtn-t">Deactivate</span><span className="cbtn-d">Resume normal flow</span></button>
            </div>

            {/* stats row */}
            <div className="sg">
              {[
                { i: '📡', v: systemStatus, l: 'System', c: 'b' },
                { i: '🚑', v: ambulances.length, l: 'Fleet Size', c: 'g' },
                { i: '🔔', v: incidents.filter(x => x.status !== 'resolved').length, l: 'Open Incidents', c: 'r' },
                { i: '📈', v: totalActivations, l: 'Activations', c: 'o' },
                { i: '⏱️', v: avgResponseTime, l: 'Avg Response', c: 'p' },
                { i: '📡', v: iotDevices.filter(d => d.status === 'online').length + '/' + iotDevices.length, l: 'IoT Online', c: 'b' },
              ].map((s, i) => (
                <div key={i} className={`sc ${s.c}`}><div className="sc-i">{s.i}</div><div className="sc-d"><div className="sc-v">{s.v}</div><div className="sc-l">{s.l}</div></div></div>
              ))}
            </div>

            {/* Quick panels */}
            <div className="panels">
              {/* Fleet summary */}
              <div className="panel">
                <div className="ph"><h3>🚑 Fleet Status</h3><button className="link" onClick={() => setActiveTab('fleet')}>View all →</button></div>
                <div className="fleet-mini">
                  {ambulances.slice(0, 4).map(a => (
                    <div key={a.id} className="fm-row"><span className="fm-name">{a.name}</span><span className="fm-zone">{a.zone}</span><span className="fm-st" style={{ color: statusClr(a.status) }}>{a.status.toUpperCase()}</span></div>
                  ))}
                </div>
              </div>
              {/* Signals summary */}
              <div className="panel">
                <div className="ph"><h3>🚦 Traffic Signals</h3><span className="badge">{trafficSignals.length}</span></div>
                <div className="sig-mini">
                  {trafficSignals.slice(0, 5).map(s => (
                    <div key={s.id} className="sm-row"><span className="sm-dot" style={{ background: s.state === 'green' ? '#22c55e' : s.state === 'emergency' ? '#ef4444' : '#ef4444' }}></span><span className="sm-name">{s.name}</span><span className={`sm-st ${s.state}`}>{s.state.toUpperCase()}</span></div>
                  ))}
                </div>
              </div>
              {/* Hospitals quick */}
              <div className="panel">
                <div className="ph"><h3>🏥 Hospitals</h3><button className="link" onClick={() => setActiveTab('hospitals')}>View all →</button></div>
                <div className="hosp-mini">
                  {hospitals.slice(0, 4).map(h => (
                    <div key={h.id} className="hm-row"><span className="hm-name">{h.name}</span><span className={`hm-er ${h.er ? 'ok' : 'full'}`}>{h.er ? 'ER ✅' : 'ER Full'}</span><span className="hm-beds">{h.beds} beds</span></div>
                  ))}
                </div>
              </div>
              {/* Recent logs */}
              <div className="panel">
                <div className="ph"><h3>📋 Recent Activity</h3><button className="link" onClick={() => setActiveTab('logs')}>View all →</button></div>
                <div className="log-mini">
                  {logEntries.slice(0, 5).map(e => (
                    <div key={e.id} className={`lm-row ${e.type}`}><span className="lm-t">{e.time}</span><span className="lm-m">{e.message}</span></div>
                  ))}
                  {logEntries.length === 0 && <div className="empty">No activity yet</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════ MAP ════ */}
        {activeTab === 'map' && (
          <div className="content fade">
            <div className="map-wrap">
              <MapSection ambulances={ambulances} trafficSignals={trafficSignals} hospitals={hospitals}
                iotDevices={iotDevices} zones={zones} isEmergency={isEmergency}
                userLocation={userLocation} activeZoneFilter={activeZoneFilter}
                onAmbulanceClick={id => setSelectedAmbulance(id)}
                emergencyRoute={emergencyRoute}
                focusAmbulanceId={trackedAmbulanceId} />
            </div>
            <div className="map-bar">
              <div className="map-filters">
                <button className={`mf-btn ${!activeZoneFilter ? 'on' : ''}`} onClick={() => setActiveZoneFilter(null)}>All Zones</button>
                {zones.map(z => (
                  <button key={z.id} className={`mf-btn ${activeZoneFilter === z.id ? 'on' : ''}`} onClick={() => setActiveZoneFilter(activeZoneFilter === z.id ? null : z.id)} style={{ borderColor: z.color }}>{z.name}</button>
                ))}
              </div>
              <div className="map-legend">
                {[['#22c55e', 'Idle'], ['#ef4444', 'En-Route'], ['#f59e0b', 'On-Scene'], ['#3b82f6', 'Hospital'], ['#6366f1', 'You']].map(([c, l]) => (
                  <span key={l} className="ml-i"><span className="ml-d" style={{ background: c }}></span>{l}</span>
                ))}
              </div>
            </div>

            {/* ── Live Tracking Panel on Map ── */}
            {trackedAmbulance && (
              <div className="track-panel">
                <div className="track-header">
                  <div className="track-title"><span className="track-dot-live"></span>📡 Tracking: {trackedAmbulance.name}</div>
                  <button className="track-close" onClick={() => setTrackedAmbulanceId(null)}>✕</button>
                </div>
                <div className="track-body">
                  <div className="track-row"><span>Status</span><span style={{ color: statusClr(trackedAmbulance.status), fontWeight: 700 }}>{trackedAmbulance.status.toUpperCase()}</span></div>
                  <div className="track-row"><span>Zone</span><span>{trackedAmbulance.zone ?? '—'}</span></div>
                  <div className="track-row"><span>Position</span><span>{trackedAmbulance.lat.toFixed(5)}, {trackedAmbulance.lng.toFixed(5)}</span></div>
                  {trackedAmbulance.destination && <div className="track-row"><span>Destination</span><span style={{ color: 'var(--accent2)' }}>{trackedAmbulance.destination}</span></div>}
                  <div className="track-row"><span>Last Update</span><span>{timeAgo(trackedAmbulance.lastUpdate)} ago</span></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════ FLEET ════ */}
        {activeTab === 'fleet' && (
          <div className="content fade">
            <div className="top-bar"><h2>Fleet Management</h2>
              <div className="fb-stats">
                <span className="fb idle">{ambulances.filter(a => a.status === 'idle').length} Idle</span>
                <span className="fb enroute">{ambulances.filter(a => a.status === 'en-route').length} En-Route</span>
                <span className="fb onscene">{ambulances.filter(a => a.status === 'on-scene').length} On-Scene</span>
              </div>
            </div>
            <div className="fleet-g">
              {ambulances.map(a => (
                <div key={a.id} className={`fc ${a.status} ${selectedAmbulance === a.id ? 'sel' : ''}`} onClick={() => setSelectedAmbulance(selectedAmbulance === a.id ? null : a.id)}>
                  <div className="fc-h"><span className="fc-n">🚑 {a.name}</span><span className="fc-dot" style={{ background: statusClr(a.status) }}></span></div>
                  <div className="fc-b">
                    <div className="fc-f"><span>Status</span><span style={{ color: statusClr(a.status), fontWeight: 700 }}>{a.status.toUpperCase()}</span></div>
                    <div className="fc-f"><span>Zone</span><span>{a.zone ?? '—'}</span></div>
                    {a.destination && <div className="fc-f"><span>Dest</span><span>{a.destination}</span></div>}
                    <div className="fc-f"><span>Updated</span><span>{timeAgo(a.lastUpdate)} ago</span></div>
                    <div className="fc-f"><span>GPS</span><span style={{ fontSize: '0.8em' }}>{a.lat.toFixed(4)}, {a.lng.toFixed(4)}</span></div>
                  </div>
                  {selectedAmbulance === a.id && (
                    <div className="fc-a">
                      <button className="fa g" onClick={e => { e.stopPropagation(); updateAmbStatus(a.id, 'idle'); }}>Idle</button>
                      <button className="fa r" onClick={e => { e.stopPropagation(); updateAmbStatus(a.id, 'en-route'); }}>Dispatch</button>
                      <button className="fa o" onClick={e => { e.stopPropagation(); updateAmbStatus(a.id, 'on-scene'); }}>On Scene</button>
                      <button className={`fa ${trackedAmbulanceId === a.id ? 'track-active' : 'track'}`} onClick={e => { e.stopPropagation(); trackAmbulance(a.id); }}>{trackedAmbulanceId === a.id ? '📡 Tracking' : '📡 Track'}</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ ZONES ════ */}
        {activeTab === 'zones' && (
          <div className="content fade">
            <div className="top-bar"><h2>Multi-Zone Management</h2><span className="badge">{zones.length} zones</span></div>
            <div className="zone-g">
              {zones.map(z => (
                <div key={z.id} className={`zc ${z.active ? 'on' : ''}`} style={{ borderColor: z.color }}>
                  <div className="zc-h"><span className="zc-dot" style={{ background: z.color }}></span><span className="zc-n">{z.name}</span></div>
                  <div className="zc-b">
                    <div className="zc-f"><span>Status</span><span style={{ color: z.active ? '#22c55e' : '#6b7280' }}>{z.active ? 'ACTIVE' : 'INACTIVE'}</span></div>
                    <div className="zc-f"><span>Ambulances</span><span>{ambulances.filter(a => a.zone === z.id).length}</span></div>
                    <div className="zc-f"><span>Signals</span><span>{trafficSignals.filter(s => s.zone === z.id).length}</span></div>
                    <div className="zc-f"><span>Hospitals</span><span>{hospitals.filter(h => h.zone === z.id).length}</span></div>
                    <div className="zc-f"><span>IoT Devices</span><span>{iotDevices.filter(d => d.zone === z.id).length}</span></div>
                  </div>
                  <button className={`zc-toggle ${z.active ? 'off' : 'on'}`} onClick={() => toggleZone(z.id, !z.active)}>
                    {z.active ? 'Deactivate Zone' : 'Activate Zone'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ HOSPITALS ════ */}
        {activeTab === 'hospitals' && (
          <div className="content fade">
            <div className="top-bar"><h2>Hospital Integration</h2><span className="badge">{hospitals.length} hospitals</span></div>
            <div className="hosp-g">
              {hospitals.map(h => (
                <div key={h.id} className="hc">
                  <div className="hc-h"><span className="hc-n">🏥 {h.name}</span><span className={`hc-er ${h.er ? 'ok' : 'full'}`}>{h.er ? '✅ ER Available' : '❌ ER Full'}</span></div>
                  <div className="hc-b">
                    <div className="hc-f"><span>Beds</span><span className="hc-beds">{h.beds}</span></div>
                    <div className="hc-f"><span>Zone</span><span>{h.zone ?? '—'}</span></div>
                    <div className="hc-f"><span>Phone</span><span className="hc-ph">{h.phone}</span></div>
                    <div className="hc-f"><span>Location</span><span style={{ fontSize: '0.8em' }}>{h.lat.toFixed(4)}, {h.lng.toFixed(4)}</span></div>
                  </div>
                  <button className="hc-map" onClick={() => { setActiveTab('map'); }}>📍 View on Map</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ INCIDENTS ════ */}
        {activeTab === 'incidents' && (
          <div className="content fade">
            <div className="top-bar"><h2>Incident Reports</h2><button className="add-btn" onClick={() => setShowIncidentForm(true)}>+ New Incident</button></div>
            {showIncidentForm && (
              <div className="inc-form">
                <h3>📝 New Incident Report</h3>
                <div className="if-grid">
                  <input placeholder="Incident title..." value={incidentForm.title} onChange={e => setIncidentForm({ ...incidentForm, title: e.target.value })} />
                  <select value={incidentForm.severity} onChange={e => setIncidentForm({ ...incidentForm, severity: e.target.value as any })}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                  </select>
                  <select value={incidentForm.zone} onChange={e => setIncidentForm({ ...incidentForm, zone: e.target.value })}>
                    <option value="">— Select Zone —</option>
                    {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                  <textarea placeholder="Description..." value={incidentForm.description} onChange={e => setIncidentForm({ ...incidentForm, description: e.target.value })} />
                </div>
                <div className="if-actions">
                  <button className="if-cancel" onClick={() => setShowIncidentForm(false)}>Cancel</button>
                  <button className="if-save" onClick={createIncident}>Create Incident</button>
                </div>
              </div>
            )}
            <div className="inc-list">
              {incidents.map(inc => (
                <div key={inc.id} className={`ic ${inc.status}`}>
                  <div className="ic-h">
                    <div className="ic-sev" style={{ background: sevClr(inc.severity) }}>{inc.severity.toUpperCase()}</div>
                    <span className="ic-title">{inc.title}</span>
                    <span className={`ic-st ${inc.status}`}>{inc.status.toUpperCase()}</span>
                  </div>
                  <p className="ic-desc">{inc.description}</p>
                  <div className="ic-meta">
                    <span>📍 {inc.zone || '—'}</span>
                    <span>🕐 {new Date(inc.createdAt).toLocaleString()}</span>
                    {inc.closedAt && <span>✅ Closed: {new Date(inc.closedAt).toLocaleString()}</span>}
                  </div>
                  {inc.status !== 'resolved' && (
                    <div className="ic-actions">
                      {inc.status === 'open' && <button className="ia y" onClick={() => updateIncidentStatus(inc.id, 'in-progress')}>▶ Start</button>}
                      <button className="ia g" onClick={() => updateIncidentStatus(inc.id, 'resolved')}>✅ Resolve</button>
                    </div>
                  )}
                </div>
              ))}
              {incidents.length === 0 && <div className="empty">No incidents reported</div>}
            </div>
          </div>
        )}

        {/* ════ IOT ════ */}
        {activeTab === 'iot' && (
          <div className="content fade">
            <div className="top-bar"><h2>Hardware IoT Integration</h2>
              <div className="fb-stats">
                <span className="fb idle">{iotDevices.filter(d => d.status === 'online').length} Online</span>
                <span className="fb onscene">{iotDevices.filter(d => d.status === 'warning').length} Warning</span>
                <span className="fb enroute">{iotDevices.filter(d => d.status === 'offline').length} Offline</span>
              </div>
            </div>
            <div className="iot-g">
              {iotDevices.map(d => (
                <div key={d.id} className={`iotc ${d.status}`}>
                  <div className="iotc-h"><span className="iotc-type">{d.type === 'camera' ? '📸' : d.type === 'gateway' ? '🌐' : d.type === 'signal_controller' ? '🚦' : '📡'} {d.type.replace('_', ' ')}</span><span className="iotc-dot" style={{ background: iotClr(d.status) }}></span></div>
                  <div className="iotc-name">{d.name}</div>
                  <div className="iotc-b">
                    <div className="iotc-f"><span>Status</span><span style={{ color: iotClr(d.status), fontWeight: 700 }}>{d.status.toUpperCase()}</span></div>
                    <div className="iotc-f"><span>Zone</span><span>{d.zone ?? '—'}</span></div>
                    <div className="iotc-f"><span>Last Ping</span><span>{timeAgo(d.lastPing)} ago</span></div>
                    <div className="iotc-f"><span>Firmware</span><span>{d.firmware}</span></div>
                    <div className="iotc-f"><span>Location</span><span style={{ fontSize: '0.78em' }}>{d.lat.toFixed(4)}, {d.lng.toFixed(4)}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ LOGS ════ */}
        {activeTab === 'logs' && (
          <div className="content fade">
            <div className="top-bar"><h2>Activity Log</h2><button className="add-btn" style={{ background: '#374151' }} onClick={() => setLogEntries([])}>Clear</button></div>
            <div className="log-tbl">
              <div className="lt-head"><span>Time</span><span>Event</span><span>Type</span></div>
              {logEntries.map(e => (
                <div key={e.id} className={`lt-row ${e.type}`}>
                  <span className="lt-time">{e.time}</span><span className="lt-ev">{e.message}</span><span className={`lt-badge ${e.type}`}>{e.type.toUpperCase()}</span>
                </div>
              ))}
              {logEntries.length === 0 && <div className="empty" style={{ padding: 40 }}>No activity recorded</div>}
            </div>
          </div>
        )}
      </main>

      {/* ─── MODAL ─── */}
      {showModal && (
        <div className="mo" onClick={() => setShowModal(false)}>
          <div className="mo-box" onClick={e => e.stopPropagation()}>
            <div className="mo-ico">⚠️</div>
            <h2 className="mo-tit">Confirm Emergency Activation</h2>
            <p className="mo-desc">This will immediately override all traffic signals across all active zones. All connected IoT controllers will be notified.</p>
            <div className="mo-btns">
              <button className="mo-c" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="mo-a" onClick={() => { setShowModal(false); handleEmergency(true); }}>🚨 Activate</button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAV */}
      <nav className="mob-bnav">
        {[
          { key: 'overview' as Tab, icon: '📊', label: 'Home' },
          { key: 'map' as Tab, icon: '🗺️', label: 'Map' },
          { key: 'fleet' as Tab, icon: '🚑', label: 'Fleet' },
          { key: 'hospitals' as Tab, icon: '🏥', label: 'Hospitals' },
          { key: 'incidents' as Tab, icon: '📝', label: 'Alerts' },
        ].map(n => (
          <button key={n.key} className={`bnav-btn ${activeTab === n.key ? 'on' : ''}`} onClick={() => { setActiveTab(n.key); setSidebarOpen(false); }}>
            <span className="bnav-ico">{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
