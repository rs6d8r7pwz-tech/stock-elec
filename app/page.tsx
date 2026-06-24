'use client'

import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { appsFor } from '@/lib/apps'
import { ArrowRight } from 'lucide-react'

export default function Accueil() {
  const { user } = useAuth()
  const apps = appsFor(user)
  const prenom = (user || '').split(' ')[0]

  return (
    <div className="space-y-8">
      <div className="pt-2">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
          Bonjour {prenom} 👋
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--gray)' }}>
          Bienvenue sur le portail Electreau. Choisissez une application.
        </p>
      </div>

      {apps.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center border" style={{ borderColor: 'var(--border)' }}>
          <p style={{ color: 'var(--gray)' }}>
            Aucune application ne vous est attribuée pour le moment.
            Contactez la direction (Gestion ELECTREAU).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {apps.map((app) => (
            <Link
              key={app.id}
              href={app.href}
              className="group bg-white rounded-2xl p-6 shadow-sm border hover:shadow-lg transition-all"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0"
                  style={{ background: 'var(--blue-light)' }}
                >
                  {app.emoji}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold" style={{ color: 'var(--navy)' }}>{app.label}</h2>
                    <ArrowRight
                      className="w-5 h-5 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all"
                      style={{ color: app.accent }}
                    />
                  </div>
                  <p className="text-sm mt-1" style={{ color: 'var(--gray)' }}>{app.description}</p>
                </div>
              </div>
              <div className="mt-4 h-1 rounded-full" style={{ background: app.accent, opacity: 0.85 }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
