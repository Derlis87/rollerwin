'use client'

import { useAppStore } from '@/store/app-store'
import { LandingPage } from '@/components/landing/LandingPage'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { DashboardLive } from '@/components/dashboard/DashboardLive'

export default function Home() {
  const { currentView } = useAppStore()

  return (
    <main className="min-h-screen">
      {currentView === 'landing' && <LandingPage />}
      {currentView === 'dashboard' && <Dashboard />}
      {currentView === 'dashboard-live' && <DashboardLive />}
    </main>
  )
}
