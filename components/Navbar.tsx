'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const liens = [
  { href: '/', label: 'Tableau de bord' },
  { href: '/stock', label: 'Stock' },
  { href: '/alertes', label: 'Alertes' },
  { href: '/commande', label: 'Commande PDF' },
  { href: '/historique', label: 'Historique' },
]

export default function Navbar() {
  const pathname = usePathname()

  return (
    <nav style={{ backgroundColor: 'var(--blue)' }} className="shadow-md">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex flex-col">
            <span className="text-white font-black text-xl tracking-widest">
              ⚡ ELECTREAU
            </span>
            <span className="text-white/70 text-xs tracking-wide">Gestion de stock</span>
          </Link>

          {/* Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {liens.map((lien) => {
              const actif = pathname === lien.href
              return (
                <Link
                  key={lien.href}
                  href={lien.href}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    actif
                      ? 'bg-white/20 text-white'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {lien.label}
                </Link>
              )
            })}
            <Link
              href="/composant/nouveau"
              className="ml-3 px-4 py-2 rounded text-sm font-semibold text-white border border-white/40 hover:bg-white/10 transition-colors"
            >
              + Composant
            </Link>
          </div>

          {/* Mobile: liens simplifiés */}
          <div className="md:hidden flex gap-2">
            <Link href="/stock" className="text-white/80 hover:text-white text-sm px-2 py-1">Stock</Link>
            <Link href="/alertes" className="text-white/80 hover:text-white text-sm px-2 py-1">Alertes</Link>
            <Link href="/commande" className="text-white/80 hover:text-white text-sm px-2 py-1">PDF</Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
