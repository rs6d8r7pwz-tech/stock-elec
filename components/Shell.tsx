'use client'

import { usePathname } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { useAuth } from '@/components/AuthProvider'

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, ready } = useAuth()

  // La page de connexion s'affiche en plein écran, sans navbar.
  if (pathname === '/login') return <>{children}</>

  // Évite un flash de contenu avant la vérification de session / redirection.
  if (!ready || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: 'var(--gray)' }}>
        Chargement…
      </div>
    )
  }

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </>
  )
}
