'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { canAccess } from '@/lib/apps'
import AccesBloque from '@/components/AccesBloque'

export default function PageBonIntervention() {
  const { user, ready } = useAuth()
  const router = useRouter()
  const [etat, setEtat] = useState<'load' | 'ok' | 'bloque'>('load')

  useEffect(() => {
    if (!ready) return
    if (!user) { router.replace('/login'); return }
    setEtat(canAccess(user, 'bon_intervention') ? 'ok' : 'bloque')
  }, [ready, user, router])

  if (etat === 'load') {
    return <p className="text-center py-10" style={{ color: 'var(--gray)' }}>Chargement…</p>
  }
  if (etat === 'bloque') {
    return <AccesBloque app="Bon d'intervention" />
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
