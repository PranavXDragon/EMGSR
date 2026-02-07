'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { database, ref, onValue, isConfigured } from '@/lib/firebase';

export default function LandingPage() {
  const [isEmergency, setIsEmergency] = useState(false);
  const [ambCount, setAmbCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [configError, setConfigError] = useState(false);

  useEffect(() => {
    if (!isConfigured) { setConfigError(true); return; }
    try {
      const unsubs: (() => void)[] = [];
      unsubs.push(onValue(ref(database, 'signal/emergency'), s => {
        const v = s.val(); if (v !== null) setIsEmergency(v);
        setConnected(true);
      }, () => setConnected(false)));
      unsubs.push(onValue(ref(database, 'ambulances'), s => {
        const d = s.val(); if (d) setAmbCount(Object.keys(d).length);
      }));
      return () => unsubs.forEach(u => u());
    } catch { setConfigError(true); }
  }, []);

  return (
    <div className="landing">
      <div className="landing-head">
        <div className="landing-ico">🚦</div>
        <h1 className="landing-h1">Emergency Traffic Control System</h1>
        <p className="landing-sub">
          Real-time ambulance tracking, traffic signal management, hospital integration, and IoT device monitoring — all in one platform.
        </p>
        {configError && (
          <div style={{ marginTop: 16, padding: '12px 20px', borderRadius: 10, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', fontSize: 13, color: '#ef4444', maxWidth: 500, margin: '16px auto 0' }}>
            ⚠️ Firebase not configured. Set <code style={{ background: 'rgba(255,255,255,.08)', padding: '2px 6px', borderRadius: 4 }}>NEXT_PUBLIC_FIREBASE_API_KEY</code> and <code style={{ background: 'rgba(255,255,255,.08)', padding: '2px 6px', borderRadius: 4 }}>NEXT_PUBLIC_FIREBASE_DATABASE_URL</code> in your environment variables.
          </div>
        )}
        {!configError && (
          <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: connected ? '#22c55e' : '#ef4444' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? '#22c55e' : '#ef4444', display: 'inline-block' }}></span>
              {connected ? 'System Online' : 'Connecting...'}
            </span>
            {isEmergency && <span style={{ color: '#ef4444', fontWeight: 700, animation: 'pulse 2s infinite' }}>🚨 EMERGENCY ACTIVE</span>}
            <span style={{ color: '#94a3b8' }}>{ambCount} units tracked</span>
          </div>
        )}
      </div>

      <div className="landing-cards">
        <Link href="/traffic" className="landing-card">
          <div className="lc-ico">🚦</div>
          <div className="lc-title">Traffic Control Center</div>
          <div className="lc-desc">
            Command center for traffic operators. Manage traffic signals, monitor zones, oversee fleet operations, handle incidents, and control IoT devices.
          </div>
          <div className="lc-features">
            <span className="lc-feat">Fleet Management</span>
            <span className="lc-feat">Zone Control</span>
            <span className="lc-feat">IoT Devices</span>
            <span className="lc-feat">Incident Reports</span>
            <span className="lc-feat">Hospital Integration</span>
            <span className="lc-feat">Live Map</span>
          </div>
          <div className="lc-arrow">Open Dashboard →</div>
        </Link>

        <Link href="/ambulance" className="landing-card">
          <div className="lc-ico">🚑</div>
          <div className="lc-title">Ambulance Dashboard</div>
          <div className="lc-desc">
            On-board dashboard for ambulance crews. GPS tracking, patient vitals, hospital dispatch, real-time navigation, and communications with control center.
          </div>
          <div className="lc-features">
            <span className="lc-feat">GPS Tracking</span>
            <span className="lc-feat">Patient Vitals</span>
            <span className="lc-feat">Dispatch</span>
            <span className="lc-feat">Navigation</span>
            <span className="lc-feat">Comms</span>
            <span className="lc-feat">Emergency Signal</span>
          </div>
          <div className="lc-arrow">Open Dashboard →</div>
        </Link>
      </div>
    </div>
  );
}
