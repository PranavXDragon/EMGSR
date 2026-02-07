import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Traffic Control Center — Emergency Management',
  description: 'Traffic Control Center dashboard with fleet management, zones, IoT devices, and incident reports.',
}

export default function TrafficLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
