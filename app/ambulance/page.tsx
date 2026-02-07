'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback, useRef } from 'react';
import { database, ref, set, onValue, update, get, push } from '@/lib/firebase';
import type { Ambulance, TrafficSignal, Hospital, Zone, EmergencyRoute } from '../../components/MapSection';
import Link from 'next/link';

const MapSection = dynamic(() => import('../../components/MapSection'), { ssr: false });

/* ── Types ── */
interface LogEntry { id: string; time: string; message: string; type: 'normal' | 'emergency' | 'warning'; }
interface PatientInfo { name: string; age: string; condition: string; bloodType: string; notes: string; }
interface Dispatch { id: string; hospitalId: string; hospitalName: string; incidentId?: string; patientInfo?: PatientInfo; startTime: number; eta?: number; }

type AmbTab = 'status' | 'map' | 'patient' | 'dispatch' | 'vitals' | 'comms';

export default function AmbulanceDashboard() {
  /* ── Unit selection ── */
  const [allAmbulances, setAllAmbulances] = useState<Ambulance[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [myAmb, setMyAmb] = useState<Ambulance | null>(null);

  /* ── Data ── */
  const [isEmergency, setIsEmergency] = useState(false);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [trafficSignals, setTrafficSignals] = useState<TrafficSignal[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [connected, setConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  /* ── GPS ── */
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'off' | 'acquiring' | 'active' | 'error'>('off');
  const [speed, setSpeed] = useState(0);
  const [heading, setHeading] = useState(0);
  const gpsWatchRef = useRef<number | null>(null);

  /* ── Tabs ── */
  const [activeTab, setActiveTab] = useState<AmbTab>('status');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /* ── Patient ── */
  const [patient, setPatient] = useState<PatientInfo>({ name: '', age: '', condition: '', bloodType: '', notes: '' });
  const [patientSaved, setPatientSaved] = useState(false);

  /* ── Dispatch ── */
  const [activeDispatch, setActiveDispatch] = useState<Dispatch | null>(null);
  const [selectedHospital, setSelectedHospital] = useState('');

  /* ── Emergency Route ── */
  const [emergencyRoute, setEmergencyRoute] = useState<EmergencyRoute | null>(null);

  /* ── Vitals ── */
  const [vitals, setVitals] = useState({ heartRate: 78, bp: '120/80', spo2: 98, temp: 36.8, respRate: 16 });

  /* ── Logs ── */
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);

  /* ── Comms ── */
  const [messages, setMessages] = useState<{ from: string; text: string; time: string }[]>([]);
  const [newMsg, setNewMsg] = useState('');

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'normal') => {
    const entry: LogEntry = { id: crypto.randomUUID?.() ?? String(Date.now()), time: new Date().toLocaleTimeString(), message, type };
    setLogEntries(prev => [entry, ...prev].slice(0, 50));
    push(ref(database, 'logs'), { time: new Date().toISOString(), message, type }).catch(() => {});
  }, []);

  /* ═══ GPS ═══ */
  const startGPS = useCallback(() => {
    if (!navigator.geolocation) { setGpsStatus('error'); return; }
    setGpsStatus('acquiring');
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setSpeed(Math.round((pos.coords.speed ?? 0) * 3.6)); // m/s → km/h
        setHeading(Math.round(pos.coords.heading ?? 0));
        setGpsStatus('active');
        if (selectedUnit) {
          update(ref(database, `ambulances/${selectedUnit}`), {
            lat: loc.lat, lng: loc.lng, lastUpdate: Date.now(),
          }).catch(() => {});
        }
      },
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
    addLog('📍 GPS tracking started', 'normal');
  }, [addLog, selectedUnit]);

  const stopGPS = useCallback(() => {
    if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
    gpsWatchRef.current = null;
    setGpsStatus('off');
    addLog('📍 GPS tracking stopped', 'normal');
  }, [addLog]);

  /* ═══ Firebase ═══ */
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(onValue(ref(database, 'signal/emergency'), s => {
      const v = s.val(); if (v !== null) setIsEmergency(v);
      setConnected(true);
    }, () => setConnected(false)));

    unsubs.push(onValue(ref(database, 'ambulances'), s => {
      const d = s.val(); if (d) {
        const list = Object.entries(d).map(([k, v]: [string, any]) => ({
          id: k, name: v.name ?? k, lat: v.lat ?? 0, lng: v.lng ?? 0, status: v.status ?? 'idle',
          destination: v.destination, zone: v.zone, lastUpdate: v.lastUpdate ?? Date.now(),
        }));
        setAllAmbulances(list);
        if (selectedUnit) setMyAmb(list.find(a => a.id === selectedUnit) ?? null);
      }
    }));

    unsubs.push(onValue(ref(database, 'hospitals'), s => {
      const d = s.val(); if (d) setHospitals(Object.entries(d).map(([k, v]: [string, any]) => ({
        id: k, name: v.name ?? k, lat: v.lat ?? 0, lng: v.lng ?? 0, beds: v.beds ?? 0,
        er: v.er ?? false, phone: v.phone ?? '', zone: v.zone,
      })));
    }));

    unsubs.push(onValue(ref(database, 'trafficSignals'), s => {
      const d = s.val(); if (d) setTrafficSignals(Object.entries(d).map(([k, v]: [string, any]) => ({
        id: k, name: v.name ?? k, lat: v.lat ?? 0, lng: v.lng ?? 0, state: v.state ?? 'red', zone: v.zone,
      })));
    }));

    unsubs.push(onValue(ref(database, 'zones'), s => {
      const d = s.val(); if (d) setZones(Object.entries(d).map(([k, v]: [string, any]) => ({
        id: k, name: v.name ?? k, color: v.color ?? '#6366f1', active: v.active ?? false,
        lat: v.lat, lng: v.lng, radius: v.radius,
      })));
    }));

    // Listen for dispatch messages
    unsubs.push(onValue(ref(database, `comms/${selectedUnit || '_'}`), s => {
      const d = s.val();
      if (d) setMessages(Object.values(d).sort((a: any, b: any) => (a.ts ?? 0) - (b.ts ?? 0)).map((m: any) => ({ from: m.from, text: m.text, time: new Date(m.ts).toLocaleTimeString() })));
    }));

    return () => unsubs.forEach(u => u());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnit]);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-start GPS when unit is selected
  useEffect(() => {
    if (selectedUnit && gpsStatus === 'off') startGPS();
    return () => {
      if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnit]);

  // Simulate vitals changes
  useEffect(() => {
    const t = setInterval(() => {
      setVitals(v => ({
        heartRate: v.heartRate + Math.floor(Math.random() * 5 - 2),
        bp: `${118 + Math.floor(Math.random() * 8)}/${78 + Math.floor(Math.random() * 6)}`,
        spo2: Math.min(100, Math.max(92, v.spo2 + Math.floor(Math.random() * 3 - 1))),
        temp: +(v.temp + (Math.random() * 0.2 - 0.1)).toFixed(1),
        respRate: v.respRate + Math.floor(Math.random() * 3 - 1),
      }));
    }, 3000);
    return () => clearInterval(t);
  }, []);

  /* ═══ Actions ═══ */
  const updateStatus = async (status: Ambulance['status']) => {
    if (!selectedUnit) return;
    await update(ref(database, `ambulances/${selectedUnit}`), { status, lastUpdate: Date.now() }).catch(() => {});
    addLog(`🚑 Status → ${status.toUpperCase()}`, status === 'en-route' ? 'emergency' : 'normal');
  };

  const requestEmergency = async () => {
    await set(ref(database, 'signal/emergency'), true).catch(() => {});
    addLog('🚨 Emergency signal sent to Traffic Control', 'emergency');

    // Auto-find nearest hospital & show route
    if (myAmb && hospitals.length > 0) {
      const { findNearestHospital } = await import('../../components/MapSection');
      const nearest = findNearestHospital(myAmb.lat, myAmb.lng, hospitals);
      if (nearest) {
        setEmergencyRoute({
          ambulanceId: myAmb.id,
          ambulanceLat: myAmb.lat,
          ambulanceLng: myAmb.lng,
          hospitalId: nearest.id,
          hospitalLat: nearest.lat,
          hospitalLng: nearest.lng,
          hospitalName: nearest.name,
        });
        addLog(`🗺️ Route: ${myAmb.name} → ${nearest.name}`, 'emergency');
        setActiveTab('map'); // auto-switch to map
      }
    }
  };

  const cancelEmergency = async () => {
    await set(ref(database, 'signal/emergency'), false).catch(() => {});
    setEmergencyRoute(null);
    addLog('✅ Emergency signal cancelled', 'normal');
  };

  const savePatient = async () => {
    if (!selectedUnit) return;
    await update(ref(database, `ambulances/${selectedUnit}`), { patient }).catch(() => {});
    setPatientSaved(true);
    addLog(`👤 Patient info saved: ${patient.name}`, 'normal');
    setTimeout(() => setPatientSaved(false), 2000);
  };

  const startDispatch = async () => {
    if (!selectedUnit || !selectedHospital) return;
    const hosp = hospitals.find(h => h.id === selectedHospital);
    if (!hosp) return;
    const dispatch: Dispatch = { id: `DSP-${Date.now()}`, hospitalId: hosp.id, hospitalName: hosp.name, startTime: Date.now(), eta: Math.floor(Math.random() * 10 + 5) };
    setActiveDispatch(dispatch);
    await update(ref(database, `ambulances/${selectedUnit}`), { status: 'en-route', destination: hosp.name, lastUpdate: Date.now() }).catch(() => {});
    addLog(`🏥 Dispatched to ${hosp.name}`, 'emergency');

    // Show route to dispatched hospital
    if (myAmb) {
      setEmergencyRoute({
        ambulanceId: myAmb.id,
        ambulanceLat: myAmb.lat,
        ambulanceLng: myAmb.lng,
        hospitalId: hosp.id,
        hospitalLat: hosp.lat,
        hospitalLng: hosp.lng,
        hospitalName: hosp.name,
      });
      setActiveTab('map');
    }
  };

  const completeDispatch = async () => {
    if (!selectedUnit) return;
    setActiveDispatch(null);
    setEmergencyRoute(null);
    await update(ref(database, `ambulances/${selectedUnit}`), { status: 'idle', destination: null, lastUpdate: Date.now() }).catch(() => {});
    addLog('✅ Dispatch completed', 'normal');
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !selectedUnit) return;
    await push(ref(database, `comms/${selectedUnit}`), { from: selectedUnit, text: newMsg, ts: Date.now() }).catch(() => {});
    setNewMsg('');
    addLog(`💬 Message sent`, 'normal');
  };

  const statusClr = (s: string) => s === 'en-route' ? '#ef4444' : s === 'on-scene' ? '#f59e0b' : '#22c55e';
  const timeAgo = (ts: number) => { const d = Math.floor((Date.now() - ts) / 1000); return d < 60 ? `${d}s` : d < 3600 ? `${Math.floor(d / 60)}m` : `${Math.floor(d / 3600)}h`; };

  const navItems: { key: AmbTab; icon: string; label: string }[] = [
    { key: 'status', icon: '📊', label: 'Status' },
    { key: 'map', icon: '🗺️', label: 'Navigation' },
    { key: 'dispatch', icon: '🏥', label: 'Dispatch' },
    { key: 'patient', icon: '👤', label: 'Patient' },
    { key: 'vitals', icon: '💓', label: 'Vitals' },
    { key: 'comms', icon: '💬', label: 'Comms' },
  ];

  /* ═══ UNIT SELECT SCREEN ═══ */
  if (!selectedUnit) {
    return (
      <div className="amb-select">
        <div className="amb-select-box">
          <Link href="/" className="back-home">← Back to Home</Link>
          <div className="amb-select-ico">🚑</div>
          <h1>Ambulance Dashboard</h1>
          <p>Select your ambulance unit to begin</p>
          <div className="amb-select-list">
            {allAmbulances.map(a => (
              <button key={a.id} className="amb-select-item" onClick={() => setSelectedUnit(a.id)}>
                <span className="amb-si-name">🚑 {a.name}</span>
                <span className="amb-si-st" style={{ color: statusClr(a.status) }}>{a.status.toUpperCase()}</span>
                <span className="amb-si-zone">{a.zone ?? '—'}</span>
              </button>
            ))}
            {allAmbulances.length === 0 && <div className="empty">Loading units...</div>}
          </div>
        </div>
      </div>
    );
  }

  /* ═══ RENDER ═══ */
  return (
    <div className="app dark has-bnav">
      {/* SIDEBAR BACKDROP (mobile) */}
      <div className={`sb-backdrop ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* SIDEBAR */}
      <aside className={`sb amb-sb ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sb-head">
          <div className="sb-brand">
            <span className="sb-logo">🚑</span>
            {sidebarOpen && <div className="sb-title">{myAmb?.name ?? selectedUnit}<span>Ambulance Unit</span></div>}
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
          <Link href="/" className="switch-dash-btn">🚦 Traffic Control</Link>
          <button className="switch-unit-btn" onClick={() => setSelectedUnit('')}>↩ Switch Unit</button>
          <div className="sb-conn"><span className={`dot ${connected ? 'on' : 'off'}`}></span>{sidebarOpen && <span>{connected ? 'Connected' : 'Offline'}</span>}</div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="mn">
        <header className="tb amb-tb">
          <div className="tb-l">
            <button className="mob-menu" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
            <h1 className="tb-title">{navItems.find(n => n.key === activeTab)?.icon} {navItems.find(n => n.key === activeTab)?.label}</h1>
          </div>
          <div className="tb-r">
            <div className="tb-clock">{currentTime}</div>
            {myAmb && <div className="tb-chip"><span className="tb-chip-label">Status</span><span className="tb-chip-val" style={{ color: statusClr(myAmb.status) }}>{myAmb.status.toUpperCase()}</span></div>}
            <div className={`tb-badge ${isEmergency ? 'em' : ''}`}>{isEmergency ? '🚨 EMERGENCY' : '✅ NORMAL'}</div>
          </div>
        </header>

        {/* ═══ STATUS TAB ═══ */}
        {activeTab === 'status' && (
          <div className="content fade">
            {/* Emergency banner */}
            <div className={`alert-bar ${isEmergency ? 'em' : ''}`}>
              <div className="alert-l"><span className="alert-ico">{isEmergency ? '🚨' : '🚑'}</span><div><div className="alert-t">{isEmergency ? 'EMERGENCY ROUTE ACTIVE' : `Unit: ${myAmb?.name ?? selectedUnit}`}</div><div className="alert-n">{isEmergency ? 'Traffic signals cleared ahead' : myAmb?.destination ? `En route to ${myAmb.destination}` : 'Standing by'}</div></div></div>
              <span className="live">● LIVE</span>
            </div>

            {/* Quick status */}
            <div className="sg">
              <div className="sc b"><div className="sc-i">🚑</div><div className="sc-d"><div className="sc-v" style={{ color: statusClr(myAmb?.status ?? 'idle') }}>{(myAmb?.status ?? 'idle').toUpperCase()}</div><div className="sc-l">Unit Status</div></div></div>
              <div className="sc g"><div className="sc-i">📍</div><div className="sc-d"><div className="sc-v">{gpsStatus === 'active' ? `${speed} km/h` : 'OFF'}</div><div className="sc-l">Speed</div></div></div>
              <div className="sc o"><div className="sc-i">🧭</div><div className="sc-d"><div className="sc-v">{heading}°</div><div className="sc-l">Heading</div></div></div>
              <div className="sc p"><div className="sc-i">🏥</div><div className="sc-d"><div className="sc-v">{myAmb?.destination ?? '—'}</div><div className="sc-l">Destination</div></div></div>
              <div className="sc b"><div className="sc-i">📡</div><div className="sc-d"><div className="sc-v">{connected ? 'Online' : 'Offline'}</div><div className="sc-l">Connection</div></div></div>
              <div className="sc g"><div className="sc-i">🗺️</div><div className="sc-d"><div className="sc-v">{myAmb?.zone ?? '—'}</div><div className="sc-l">Zone</div></div></div>
            </div>

            {/* Status controls */}
            <h3 style={{ margin: '20px 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--text2)' }}>Quick Actions</h3>
            <div className="amb-actions">
              <button className="abtn idle" onClick={() => updateStatus('idle')}><span>🟢</span>Set Idle</button>
              <button className="abtn enroute" onClick={() => updateStatus('en-route')}><span>🔴</span>En Route</button>
              <button className="abtn onscene" onClick={() => updateStatus('on-scene')}><span>🟡</span>On Scene</button>
            </div>

            {/* Emergency controls */}
            <h3 style={{ margin: '20px 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--text2)' }}>Emergency Signal</h3>
            <div className="ctrl2">
              <button className="cbtn em" onClick={requestEmergency} disabled={isEmergency}><span className="cbtn-i">🚨</span><span className="cbtn-t">Request Emergency</span><span className="cbtn-d">Clear traffic signals ahead</span></button>
              <button className="cbtn ok" onClick={cancelEmergency} disabled={!isEmergency}><span className="cbtn-i">✅</span><span className="cbtn-t">Cancel Emergency</span><span className="cbtn-d">Release signals</span></button>
            </div>

            {/* Recent activity */}
            <div className="panel" style={{ marginTop: 20 }}>
              <div className="ph"><h3>📋 Activity Log</h3></div>
              <div className="log-mini">
                {logEntries.slice(0, 8).map(e => (
                  <div key={e.id} className={`lm-row ${e.type}`}><span className="lm-t">{e.time}</span><span className="lm-m">{e.message}</span></div>
                ))}
                {logEntries.length === 0 && <div className="empty">No activity yet</div>}
              </div>
            </div>
          </div>
        )}

        {/* ═══ MAP TAB ═══ */}
        {activeTab === 'map' && (
          <div className="content fade">
            <div className="map-wrap">
              <MapSection ambulances={allAmbulances} trafficSignals={trafficSignals} hospitals={hospitals}
                iotDevices={[]} zones={zones} isEmergency={isEmergency}
                userLocation={userLocation} activeZoneFilter={myAmb?.zone ?? null}
                onAmbulanceClick={() => {}}
                emergencyRoute={emergencyRoute} />
            </div>
            <div className="map-bar">
              <div className="map-legend">
                {[['#22c55e', 'Idle'], ['#ef4444', 'En-Route'], ['#f59e0b', 'On-Scene'], ['#3b82f6', 'Hospital'], ['#6366f1', 'You']].map(([c, l]) => (
                  <span key={l} className="ml-i"><span className="ml-d" style={{ background: c }}></span>{l}</span>
                ))}
              </div>
              {gpsStatus === 'active' && userLocation && (
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>📍 {userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)} | {speed} km/h | {heading}°</div>
              )}
            </div>
          </div>
        )}

        {/* ═══ DISPATCH TAB ═══ */}
        {activeTab === 'dispatch' && (
          <div className="content fade">
            <div className="top-bar"><h2>Dispatch Management</h2></div>

            {activeDispatch ? (
              <div className="dispatch-active">
                <div className="da-header">
                  <span className="da-pulse"></span>
                  <h3>🏥 Active Dispatch</h3>
                </div>
                <div className="da-body">
                  <div className="da-f"><span>Hospital</span><span>{activeDispatch.hospitalName}</span></div>
                  <div className="da-f"><span>ETA</span><span style={{ color: 'var(--yellow)', fontWeight: 700 }}>{activeDispatch.eta} min</span></div>
                  <div className="da-f"><span>Dispatch ID</span><span>{activeDispatch.id}</span></div>
                  <div className="da-f"><span>Started</span><span>{new Date(activeDispatch.startTime).toLocaleTimeString()}</span></div>
                </div>
                <button className="da-complete" onClick={completeDispatch}>✅ Complete Dispatch</button>
              </div>
            ) : (
              <div className="dispatch-new">
                <h3 style={{ marginBottom: 12 }}>📋 New Dispatch</h3>
                <label style={{ fontSize: 13, color: 'var(--text2)', display: 'block', marginBottom: 6 }}>Select destination hospital:</label>
                <div className="hosp-g">
                  {hospitals.map(h => (
                    <div key={h.id} className={`hc ${selectedHospital === h.id ? 'hc-sel' : ''}`} onClick={() => setSelectedHospital(h.id)} style={{ cursor: 'pointer' }}>
                      <div className="hc-h"><span className="hc-n">🏥 {h.name}</span><span className={`hc-er ${h.er ? 'ok' : 'full'}`}>{h.er ? '✅ ER' : '❌ Full'}</span></div>
                      <div className="hc-b">
                        <div className="hc-f"><span>Beds</span><span className="hc-beds">{h.beds}</span></div>
                        <div className="hc-f"><span>Phone</span><span className="hc-ph">{h.phone}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="add-btn" style={{ marginTop: 16, width: '100%', padding: 12 }} onClick={startDispatch} disabled={!selectedHospital}>🚑 Start Dispatch</button>
              </div>
            )}
          </div>
        )}

        {/* ═══ PATIENT TAB ═══ */}
        {activeTab === 'patient' && (
          <div className="content fade">
            <div className="top-bar"><h2>Patient Information</h2></div>
            <div className="inc-form" style={{ borderColor: 'var(--border)' }}>
              <h3>👤 Patient Details</h3>
              <div className="if-grid">
                <input placeholder="Patient name" value={patient.name} onChange={e => setPatient({ ...patient, name: e.target.value })} />
                <input placeholder="Age" value={patient.age} onChange={e => setPatient({ ...patient, age: e.target.value })} />
                <select value={patient.condition} onChange={e => setPatient({ ...patient, condition: e.target.value })}>
                  <option value="">— Condition —</option>
                  <option value="stable">Stable</option>
                  <option value="moderate">Moderate</option>
                  <option value="critical">Critical</option>
                  <option value="trauma">Trauma</option>
                  <option value="cardiac">Cardiac</option>
                  <option value="respiratory">Respiratory</option>
                </select>
                <select value={patient.bloodType} onChange={e => setPatient({ ...patient, bloodType: e.target.value })}>
                  <option value="">— Blood Type —</option>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <textarea placeholder="Notes / additional info..." value={patient.notes} onChange={e => setPatient({ ...patient, notes: e.target.value })} />
              </div>
              <div className="if-actions">
                <button className="if-cancel" onClick={() => setPatient({ name: '', age: '', condition: '', bloodType: '', notes: '' })}>Clear</button>
                <button className="if-save" onClick={savePatient}>{patientSaved ? '✅ Saved!' : '💾 Save Patient Info'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ VITALS TAB ═══ */}
        {activeTab === 'vitals' && (
          <div className="content fade">
            <div className="top-bar"><h2>Patient Vitals Monitor</h2><span className="live">● LIVE</span></div>
            <div className="vitals-g">
              <div className="vcard hr"><div className="vcard-ico">💓</div><div className="vcard-val">{vitals.heartRate}</div><div className="vcard-unit">bpm</div><div className="vcard-label">Heart Rate</div></div>
              <div className="vcard bp"><div className="vcard-ico">🩸</div><div className="vcard-val">{vitals.bp}</div><div className="vcard-unit">mmHg</div><div className="vcard-label">Blood Pressure</div></div>
              <div className="vcard spo2"><div className="vcard-ico">🫁</div><div className="vcard-val">{vitals.spo2}</div><div className="vcard-unit">%</div><div className="vcard-label">SpO₂</div></div>
              <div className="vcard temp"><div className="vcard-ico">🌡️</div><div className="vcard-val">{vitals.temp}</div><div className="vcard-unit">°C</div><div className="vcard-label">Temperature</div></div>
              <div className="vcard resp"><div className="vcard-ico">🌬️</div><div className="vcard-val">{vitals.respRate}</div><div className="vcard-unit">/min</div><div className="vcard-label">Resp Rate</div></div>
            </div>
            <div className="panel" style={{ marginTop: 20 }}>
              <div className="ph"><h3>📊 Status</h3></div>
              <div className="vitals-status">
                <div className="vs-row"><span>Heart Rate</span><span style={{ color: vitals.heartRate > 100 || vitals.heartRate < 60 ? '#ef4444' : '#22c55e' }}>{vitals.heartRate > 100 ? '⚠️ Tachycardia' : vitals.heartRate < 60 ? '⚠️ Bradycardia' : '✅ Normal'}</span></div>
                <div className="vs-row"><span>SpO₂</span><span style={{ color: vitals.spo2 < 95 ? '#ef4444' : '#22c55e' }}>{vitals.spo2 < 95 ? '⚠️ Low' : '✅ Normal'}</span></div>
                <div className="vs-row"><span>Temperature</span><span style={{ color: vitals.temp > 37.5 ? '#f59e0b' : '#22c55e' }}>{vitals.temp > 37.5 ? '⚠️ Elevated' : '✅ Normal'}</span></div>
                <div className="vs-row"><span>Resp Rate</span><span style={{ color: vitals.respRate > 20 || vitals.respRate < 12 ? '#f59e0b' : '#22c55e' }}>{vitals.respRate > 20 ? '⚠️ High' : vitals.respRate < 12 ? '⚠️ Low' : '✅ Normal'}</span></div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ COMMS TAB ═══ */}
        {activeTab === 'comms' && (
          <div className="content fade">
            <div className="top-bar"><h2>Communications</h2></div>
            <div className="comms-box">
              <div className="comms-msgs">
                {messages.map((m, i) => (
                  <div key={i} className={`cm-msg ${m.from === selectedUnit ? 'mine' : ''}`}>
                    <div className="cm-from">{m.from === selectedUnit ? 'You' : m.from}</div>
                    <div className="cm-text">{m.text}</div>
                    <div className="cm-time">{m.time}</div>
                  </div>
                ))}
                {messages.length === 0 && <div className="empty" style={{ padding: 40 }}>No messages yet. Send a message to Traffic Control.</div>}
              </div>
              <div className="comms-input">
                <input placeholder="Type message to Traffic Control..." value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} />
                <button onClick={sendMessage}>Send</button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav className="mob-bnav">
        {navItems.map(n => (
          <button key={n.key} className={`bnav-btn ${activeTab === n.key ? 'on' : ''}`} onClick={() => { setActiveTab(n.key); setSidebarOpen(false); }}>
            <span className="bnav-ico">{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
