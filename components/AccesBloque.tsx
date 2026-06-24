'use client'

import Link from 'next/link'
import { Lock, ArrowLeft } from 'lucide-react'

export default function AccesBloque({ app }: { app?: string }) {
  return (
    <div className="max-w-md mx-auto mt-16 bg-white rounded-2xl shadow-sm border p-8 text-center"
      style={{ borderColor: 'var(--border)' }}>
      <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ background: '#fee2e2', color: 'var(--danger)' }}>
        <Lock className="w-7 h-7" />
      </div>
      <h1 className="text-xl font-bold" style={{ color: 'var(--navy)' }}>Accès bloqué</h1>
      <p className="text-sm mt-2" style={{ color: 'var(--gray)' }}>
        Vous n&apos;avez pas l&apos;autorisation d&apos;accéder à {app ? `« ${app} »` : 'cette application'}.
        Contactez la direction (Gestion ELECTREAU) si besoin.
      </p>
      <Link href="/" className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 rounded-lg text-sm font-semibold text-white"
        style={{ background: 'var(--navy)' }}>
        <ArrowLeft className="w-4 h-4" /> Retour à l&apos;accueil
      </Link>
    </div>
  )
}
