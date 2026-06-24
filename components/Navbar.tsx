'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { appsFor } from '@/lib/apps'
import { LogOut } from 'lucide-react'

export default function Navbar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const apps = appsFor(user)

  return (
    <nav className="shadow-md" style={{ backgroundColor: 'var(--navy)' }}>
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo -> accueil */}
          <Link href="/" className="flex items-center shrink-0 bg-white rounded-md px-2.5 py-1.5">
            <Image src="/logo-electreau.png" alt="Electreau" width={150} height={31}
              style={{ height: '26px', width: 'auto' }} priority />
          </Link>

          {/* Applis accessibles */}
          <div className="hidden md:flex items-center gap-1 flex-1">
            {apps.map((app) => {
              const actif = pathname === app.href || pathname.startsWith(app.href + '/')
              return (
                <Link
                  key={app.id}
                  href={app.href}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    actif ? 'bg-white/20 text-white' : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span className="mr-1">{app.emoji}</span>{app.label}
                </Link>
              )
            })}
          </div>

          {/* Utilisateur + déconnexion */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:block text-white/80 text-sm">{user}</span>
            <button
              onClick={() => logout()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium text-white border border-white/30 hover:bg-white/10 transition-colors"
              title="Se déconnecter"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>

        {/* Applis accessibles — version mobile */}
        <div className="md:hidden flex gap-1 pb-2 -mt-1 overflow-x-auto">
          {apps.map((app) => (
            <Link key={app.id} href={app.href}
              className="px-2.5 py-1 rounded text-xs font-medium text-white/85 hover:text-white whitespace-nowrap"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
              {app.emoji} {app.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
