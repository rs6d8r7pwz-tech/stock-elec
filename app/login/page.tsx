'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/components/AuthProvider'
import { COMPTES, authStatus, authSetPassword } from '@/lib/auth'
import { LogIn, ShieldCheck, AlertCircle } from 'lucide-react'

export default function PageLogin() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: 'transparent' }} />}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const { login } = useAuth()
  const params = useSearchParams()
  const [nom, setNom] = useState('')
  const [initialise, setInitialise] = useState<boolean | null>(null)
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [erreur, setErreur] = useState('')
  const inactivite = params.get('raison') === 'inactivite'

  // Quand on choisit un compte → vérifier s'il a déjà un mot de passe
  useEffect(() => {
    if (!nom) { setInitialise(null); return }
    setChecking(true); setErreur(''); setPwd(''); setPwd2('')
    authStatus(nom)
      .then((s) => setInitialise(s.initialise))
      .catch(() => setErreur('Impossible de contacter le serveur. Réessayez.'))
      .finally(() => setChecking(false))
  }, [nom])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErreur(''); setSubmitting(true)
    try {
      if (initialise === false) {
        if (pwd.length < 4) { setErreur('Mot de passe trop court (4 caractères minimum).'); return }
        if (pwd !== pwd2) { setErreur('Les deux mots de passe ne correspondent pas.'); return }
        const ok = await authSetPassword(nom, pwd)
        if (!ok) { setErreur('Création du mot de passe impossible.'); return }
        const logged = await login(nom, pwd)
        if (!logged) setErreur('Connexion impossible après création.')
      } else {
        const ok = await login(nom, pwd)
        if (!ok) setErreur('Mot de passe incorrect.')
      }
    } catch {
      setErreur('Erreur réseau. Vérifiez votre connexion.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'transparent' }}>
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* En-tête logo */}
          <div className="px-8 pt-8 pb-6 text-center border-b" style={{ borderColor: 'var(--border)' }}>
            <Image src="/logo-electreau.png" alt="Electreau" width={260} height={54}
              style={{ height: 'auto', width: '230px', margin: '0 auto' }} priority />
            <p className="mt-3 text-sm font-semibold tracking-wide" style={{ color: 'var(--navy)' }}>
              PORTAIL ENTREPRISE
            </p>
          </div>

          <form onSubmit={onSubmit} className="px-8 py-7 space-y-4">
            {inactivite && (
              <div className="flex items-start gap-2 text-sm p-3 rounded-lg" style={{ background: '#fef3c7', color: '#92400e' }}>
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Vous avez été déconnecté après 30 minutes d&apos;inactivité. Reconnectez-vous.</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>Compte</label>
              <select
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="w-full px-3 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2"
                style={{ borderColor: 'var(--border)' }}
                required
              >
                <option value="">— Sélectionnez votre nom —</option>
                {COMPTES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {checking && <p className="text-sm" style={{ color: 'var(--gray)' }}>Vérification…</p>}

            {nom && initialise === false && !checking && (
              <div className="flex items-start gap-2 text-sm p-3 rounded-lg" style={{ background: 'var(--blue-light)', color: 'var(--navy)' }}>
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Première connexion : choisissez votre mot de passe.</span>
              </div>
            )}

            {nom && !checking && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                    {initialise === false ? 'Nouveau mot de passe' : 'Mot de passe'}
                  </label>
                  <input
                    type="password" value={pwd} onChange={(e) => setPwd(e.target.value)}
                    className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2"
                    style={{ borderColor: 'var(--border)' }} autoFocus required
                  />
                </div>
                {initialise === false && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>Confirmer le mot de passe</label>
                    <input
                      type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)}
                      className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2"
                      style={{ borderColor: 'var(--border)' }} required
                    />
                  </div>
                )}
              </>
            )}

            {erreur && (
              <div className="flex items-start gap-2 text-sm p-3 rounded-lg" style={{ background: '#fee2e2', color: 'var(--danger)' }}>
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{erreur}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={!nom || checking || submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-white disabled:opacity-50 transition-colors"
              style={{ background: 'var(--red)' }}
            >
              <LogIn className="w-4 h-4" />
              {submitting ? 'Connexion…' : initialise === false ? 'Créer et se connecter' : 'Se connecter'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs mt-4" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Electreau — Pompage et traitement de l&apos;eau
        </p>
      </div>
    </div>
  )
}
