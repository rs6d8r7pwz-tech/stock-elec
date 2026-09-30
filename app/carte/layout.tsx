'use client'

import { useAuth } from '@/components/AuthProvider'
import { canAccess } from '@/lib/apps'
import AccesBloque from '@/components/AccesBloque'

export default function CarteLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (user && !canAccess(user, 'carte')) return <AccesBloque app="Carte ELECTReau" />
  return <>{children}</>
}
