'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { canAccess } from '@/lib/apps'
import AccesBloque from '@/components/AccesBloque'

const onglets = [
  { href: '/stock', label: 'Tableau de bord', exact: true },
  { href: '/stock/inventaire', label: 'Stock complet' },
  { href: '/stock/alertes', label: 'Alertes' },
  { href: '/stock/commande', label: 'Commande PDF' },
  { href: '/stock/historique', label: 'Historique' },
  { href: '/stock/composant/nouveau', label: '+ Composant' },
]

export default function StockLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user } = useAuth()

  if (user && !canAccess(user, 'stock')) {
    return <AccesBloque app="Gestion de stock" />
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: 'var(--border)' }}>
        {onglets.map((o) => {
          const actif = o.exact ? pathname === o.href : pathname === o.href || pathname.startsWith(o.href + '/')
          return (
            <Link
              key={o.href}
              href={o.href}
              className="px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors"
              style={{
                color: actif ? 'var(--red)' : 'var(--gray)',
                borderColor: actif ? 'var(--red)' : 'transparent',
              }}
            >
              {o.label}
            </Link>
          )
        })}
      </div>
      {children}
    </div>
  )
}
