# 🚑 Ambulance Emergency Traffic Control System

A real-time emergency traffic management platform built with **Next.js 16**, **Firebase Realtime Database**, and **Leaflet** maps. Enables traffic control operators and ambulance crews to coordinate emergency response through live GPS tracking, traffic signal override, hospital dispatch, and instant communications.

![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)
![Firebase](https://img.shields.io/badge/Firebase-10.8-orange?logo=firebase)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-green?logo=leaflet)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Firebase Setup](#-firebase-setup)
- [Usage Guide](#-usage-guide)
- [Real-Time Data Flow](#-real-time-data-flow)
- [Firebase Database Schema](#-firebase-database-schema)
- [Responsive Design](#-responsive-design)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

### 🚦 Traffic Control Center (`/traffic`)
- **Emergency Override** — One-click activation overrides all traffic signals across zones to clear ambulance routes
- **Live Map** — Real-time map with ambulances, traffic signals, hospitals, IoT devices, and zone overlays (CARTO dark basemap)
- **Fleet Management** — Monitor all ambulance units, update status (idle/en-route/on-scene), and dispatch from the control center
- **Ambulance Tracking** — Select any ambulance to track live on the map with real-time position, status, zone, destination, and GPS coordinates
- **Multi-Zone Control** — Activate/deactivate traffic zones with signal and ambulance counts per zone
- **Hospital Integration** — View ER availability, bed count, phone, and location for all hospitals
- **Incident Reports** — Create, track, and resolve incidents with severity levels and zone assignment
- **IoT Device Monitoring** — Monitor signal controllers, sensors, cameras, and gateways with status and firmware info
- **Activity Logs** — Full timestamped log of all system events, filterable by type
- **Emergency Route** — Animated route line from ambulance to nearest hospital with distance, ETA, and traffic signal highlighting

### 🚑 Ambulance Dashboard (`/ambulance`)
- **Unit Selection** — Choose your ambulance unit on login; all data scoped to that unit
- **Auto GPS Tracking** — GPS starts automatically on load; position pushed to Firebase in real-time
- **Speed & Heading** — Live speed (km/h) and compass heading display
- **Emergency Signal** — Request emergency mode from the ambulance; auto-finds nearest hospital and shows route
- **Dispatch System** — Select a hospital, start dispatch with ETA, and complete on arrival
- **Patient Info** — Record patient name, age, condition, blood type, and notes; saved to Firebase
- **Vitals Monitor** — Live simulated patient vitals: heart rate, BP, SpO₂, temperature, resp rate with status alerts
- **Communications** — Real-time messaging between ambulance crew and traffic control
- **Route Visualization** — Animated emergency route with distance/ETA label and traffic signal highlighting

### 🏠 Landing Page (`/`)
- System status overview (online/offline, emergency state, unit count)
- Quick links to both dashboards

---

## 🏗 Architecture

```
┌────────────────────┐         ┌──────────────────────┐
│   Traffic Control   │◄──────►│  Firebase Realtime DB │
│   /traffic          │  live   │                      │
│   (Operator View)   │  sync   │  /signal/emergency   │
└────────────────────┘         │  /ambulances/{id}    │
                                │  /trafficSignals/... │
┌────────────────────┐         │  /hospitals/...      │
│  Ambulance Dash     │◄──────►│  /zones/...          │
│  /ambulance         │  live   │  /incidents/...      │
│  (Crew View)        │  sync   │  /iot/...            │
└────────────────────┘         │  /stats              │
                                │  /logs/...           │
         ▲                      │  /comms/{unitId}     │
         │ GPS                  └──────────────────────┘
         │ watchPosition()
    ┌────┴─────┐
    │  Browser │
    │  GPS API │
    └──────────┘
```

- **Client-Side Rendering** — Both dashboards use `'use client'` with React hooks for real-time Firebase integration
- **Firebase Listeners** — `onValue()` listeners provide instant updates across all connected clients
- **Direct Leaflet API** — Uses `L.map()` directly (not react-leaflet `MapContainer`) to avoid "Map container already initialized" errors in React Strict Mode
- **Dynamic Imports** — Map component is dynamically imported with `ssr: false` to prevent server-side Leaflet issues

---

## 🛠 Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| **Next.js** | 16.1.6 | React framework with App Router, Turbopack |
| **React** | 18.2.0 | UI library |
| **TypeScript** | 5.3.3 | Type safety |
| **Firebase** | 10.8.0 | Realtime Database (modular SDK) |
| **Leaflet** | 1.9.4 | Interactive maps |
| **CARTO** | — | Dark basemap tiles |
| **Inter** | — | Google Font (UI typography) |

---

## 📁 Project Structure

```
ambulance-traffic-control/
├── app/
│   ├── layout.tsx              # Root layout (metadata, fonts, viewport)
│   ├── page.tsx                # Landing page with system status
│   ├── globals.css             # All styles (dark UI, responsive, animations)
│   ├── traffic/
│   │   ├── layout.tsx          # Traffic route metadata
│   │   └── page.tsx            # Traffic Control Center (8 tabs, ~716 lines)
│   └── ambulance/
│       └── page.tsx            # Ambulance Dashboard (6 tabs, ~539 lines)
├── components/
│   └── MapSection.tsx          # Shared Leaflet map component (~500 lines)
├── lib/
│   └── firebase.ts             # Firebase singleton + all exports
├── .env.local                  # Firebase credentials (gitignored)
├── .gitignore
├── database.rules.json         # Firebase security rules
├── next.config.js              # Next.js configuration
├── tsconfig.json               # TypeScript configuration
├── package.json
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** ≥ 18.x
- **npm** or **yarn**
- A **Firebase** project with Realtime Database enabled

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/ambulance-traffic-control.git
cd ambulance-traffic-control

# Install dependencies
npm install

# Set up environment variables (see Environment Variables section)
# Create .env.local with your Firebase credentials

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Scripts

```bash
npm run dev       # Start development server (Turbopack)
npm run build     # Production build
npm start         # Start production server
npm run lint      # Run ESLint
```

---

## 🔑 Environment Variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase project API key |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | Firebase Realtime Database URL |

> ⚠️ `.env.local` is gitignored. Never commit credentials to the repository.

---

## 🔥 Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/) → Create a new project
2. Enable **Realtime Database** (choose your preferred region)
3. Set database rules for development:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

> ⚠️ For production, implement proper authentication and restrictive security rules.

4. Copy your **API Key** and **Database URL** from Project Settings → General
5. Add them to `.env.local`

### Demo Data

The Traffic Control dashboard automatically seeds demo data on first load:
- **5 ambulances** (AMB-101 through AMB-105) across 3 zones
- **6 traffic signals** at major junctions
- **4 hospitals** with ER status and bed counts
- **5 IoT devices** (controllers, sensors, cameras, gateways)
- **3 zones** (Downtown, North District, South Corridor)
- **1 sample incident** (resolved)

---

## 📖 Usage Guide

### Traffic Control Center (`/traffic`)

| Tab | Description |
|---|---|
| **Overview** | System status, emergency controls, stats, quick panels |
| **Live Map** | Real-time map with all entities, zone filters, tracking panel |
| **Fleet** | All ambulances with status controls and **📡 Track** button |
| **Zones** | Activate/deactivate zones, view per-zone stats |
| **Hospitals** | ER availability, beds, phone, "View on Map" |
| **Incidents** | Create/manage incident reports with severity & zone |
| **IoT Devices** | Monitor hardware status, firmware, last ping |
| **Logs** | Full activity log with type badges |

**Emergency Activation Flow:**
1. Click **Activate Emergency** → Confirmation modal
2. Confirm → All traffic signals switch to emergency mode
3. Nearest hospital found → Animated route drawn on map
4. Traffic signals on route are highlighted in yellow
5. Click **Deactivate** to restore normal traffic

**Ambulance Tracking:**
1. Go to **Fleet** tab → Click an ambulance card
2. Click **📡 Track** → Map auto-centers on the ambulance
3. Live tracking panel shows status, zone, GPS, destination
4. Purple highlight ring pulsates around tracked ambulance on the map
5. Top bar shows tracking indicator (click to jump to map)

### Ambulance Dashboard (`/ambulance`)

1. **Select your unit** from the list on the login screen
2. GPS starts automatically — your position is pushed to Firebase in real-time
3. Use **Quick Actions** to set status (Idle / En-Route / On-Scene)
4. **Request Emergency** to clear traffic signals and auto-route to nearest hospital
5. Go to **Dispatch** to manually select a hospital and start dispatch
6. Record **Patient Info** and monitor **Vitals**
7. Use **Comms** to message Traffic Control

---

## 🔄 Real-Time Data Flow

```
Ambulance Crew                    Firebase                     Traffic Control
─────────────                    ────────                     ───────────────
GPS watchPosition() ──────────► /ambulances/{id}
                                 lat, lng, lastUpdate ──────► Live map markers
                                                              Tracking panel

Emergency Request ─────────────► /signal/emergency: true
                                                    ──────► All signals → EMERGENCY
                                                              Route calculated
                                                              Map updated

Status Change ─────────────────► /ambulances/{id}/status
                                                    ──────► Fleet cards update
                                                              Zone stats update

Dispatch Start ────────────────► /ambulances/{id}
                                 status: en-route
                                 destination: hospital ────► Fleet shows en-route

Message Sent ──────────────────► /comms/{unitId}
                                                    ──────► Real-time chat display
```

All data syncs in **< 100ms** via Firebase Realtime Database listeners.

---

## 🗄 Firebase Database Schema

```
/
├── signal/
│   └── emergency              # boolean — global emergency state
├── ambulances/
│   └── {id}/                  # AMB-101, AMB-102, etc.
│       ├── name               # string
│       ├── lat, lng           # number — GPS coordinates
│       ├── status             # "idle" | "en-route" | "on-scene"
│       ├── destination        # string | null
│       ├── zone               # string — zone ID
│       └── lastUpdate         # number — timestamp
├── trafficSignals/
│   └── {id}/
│       ├── name, lat, lng
│       ├── state              # "red" | "green" | "emergency"
│       └── zone
├── hospitals/
│   └── {id}/
│       ├── name, lat, lng
│       ├── beds               # number
│       ├── er                 # boolean — ER available
│       ├── phone              # string
│       └── zone
├── zones/
│   └── {id}/
│       ├── name, color
│       ├── active             # boolean
│       ├── lat, lng, radius   # zone circle geometry
├── incidents/
│   └── {id}/
│       ├── title, description
│       ├── zone, severity, status
│       ├── createdAt, closedAt
│       ├── ambulanceId, hospitalId
├── iot/
│   └── {id}/
│       ├── name, type, status
│       ├── lat, lng, zone
│       ├── lastPing, firmware
├── stats/
│   ├── totalActivations       # number
│   └── avgResponseTime        # number (seconds)
├── logs/
│   └── {pushId}/
│       ├── time, message, type
└── comms/
    └── {unitId}/
        └── {pushId}/
            ├── from, text, ts
```

---

## 📱 Responsive Design

The application is fully responsive with mobile-first breakpoints:

| Breakpoint | Behavior |
|---|---|
| **> 900px** | Full sidebar + content layout |
| **≤ 900px** | Sidebar becomes slide-over drawer, bottom tab nav appears, grids collapse |
| **≤ 600px** | Compact top bar, larger touch targets, tighter padding |
| **≤ 400px** | Ultra-compact stats, single-column cards |

**Mobile Features:**
- 📱 Slide-over sidebar with backdrop overlay
- 📱 Bottom navigation bar (5 tabs traffic, 6 tabs ambulance)
- 📱 Touch-optimized buttons (min 44px tap targets)
- 📱 iOS safe area support (`env(safe-area-inset-bottom)`)
- 📱 `100dvh` for correct mobile viewport height
- 📱 Horizontal scroll for filters and legends
- 📱 16px minimum font on inputs (prevents iOS auto-zoom)
- 📱 PWA-capable meta tags

---

## 🌐 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Add environment variables in **Vercel Dashboard → Settings → Environment Variables**.

### Other Platforms

Works on any platform supporting Next.js:
- **Netlify** — Add `@netlify/plugin-nextjs`
- **Railway** — Direct deploy from GitHub
- **Docker** — Use `next build && next start`
- **Firebase Hosting** — With Cloud Functions for SSR

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -m 'Add my feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Open a Pull Request

### Code Style
- TypeScript strict mode
- React hooks for all state management
- CSS-in-CSS (global styles in `globals.css`)
- Firebase modular SDK v10+ imports
- Short CSS class names for performance

---

## ⚠️ Important Notes

- This is a **professional medical emergency system** — test thoroughly before production use
- GPS tracking requires **HTTPS** in production (browser security requirement)
- Firebase free tier (Spark plan) supports up to 100 simultaneous connections
- For production: implement proper **authentication**, **security rules**, and **rate limiting**
- Demo data is auto-seeded only if the database paths are empty

---

## 📄 License

This project is licensed under the MIT License.

---

<p align="center">
  Built with ❤️ for emergency response teams
</p>
