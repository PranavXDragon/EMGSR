import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Traffic Control Center — Emergency Management System',
  description: 'Professional Traffic Control Center with GPS Live Tracking, Multi-Zone Support, Hospital Integration, Incident Reports, IoT Hardware Integration, and Real-Time Emergency Management.',
  keywords: ['ambulance', 'emergency', 'traffic control', 'EMS', 'GPS tracking', 'IoT', 'hospital', 'incident reports'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
