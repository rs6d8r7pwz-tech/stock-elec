'use client'

import { useAuth } from '@/components/AuthProvider'
import { canAccess } from '@/lib/apps'
import AccesBloque from '@/components/AccesBloque'

export default function RapportLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (user && !canAccess(user, 'rapport')) return <AccesBloque app="Rapport" />
  return <>{children}</>
}
