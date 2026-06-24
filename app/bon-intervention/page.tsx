'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { canAccess } from '@/lib/apps'

export default function PageBonIntervention() {
  const { user, ready } = useAuth()
  const router = useRouter()
  const [autorise, setAutorise] = useState(false)

  useEffect(() => {
    if (!ready) return
    if (!user) { router.replace('/login'); return }
    if (!canAccess(user, 'bon_intervention')) { router.replace('/'); return }
    setAutorise(true)
  }, [ready, user, router])

  if (!autorise) {
    return <p className="text-center py-10" style={{ color: 'var(--gray)' }}>Chargement…</p>
  }

  // L'app Bon Intervention est servie sous le même domaine (même session).
  return (
    <iframe
      src="/bon-intervention/app.html"
      title="Bon d'intervention"
      style={{ width: '100%', height: 'calc(100vh - 4rem)', border: 'none' }}
    />
  )
}
