'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  sessionLoad, sessionSave, sessionClear, touchSession, sessionExpired,
  authLogin, INACTIVITY_MS,
} from '@/lib/auth'

interface AuthCtx {
  user: string | null
  ready: boolean
  login: (nom: string, pwd: string) => Promise<boolean>
  logout: (reason?: string) => void
}

const Ctx = createContext<AuthCtx>({
  user: null, ready: false,
  login: async () => false, logout: () => {},
})

export function useAuth() { return useContext(Ctx) }

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const logout = useCallback((reason?: string) => {
    sessionClear()
    setUser(null)
    if (timer.current) clearTimeout(timer.current)
    const q = reason ? `?raison=${encodeURIComponent(reason)}` : ''
    router.replace('/login' + q)
  }, [router])

  const login = useCallback(async (nom: string, pwd: string) => {
    const ok = await authLogin(nom, pwd)
    if (ok) {
      sessionSave(nom)
      setUser(nom)
    }
    return ok
  }, [])

  // Chargement initial de la session (+ contrôle d'expiration)
  useEffect(() => {
    const nom = sessionLoad()
    if (nom) {
      if (sessionExpired()) {
        sessionClear()
        setUser(null)
      } else {
        setUser(nom)
        touchSession()
      }
    }
    setReady(true)
  }, [])

  // Minuteur d'inactivité : 30 min sans action → déconnexion
  useEffect(() => {
    if (!user) return
    const reset = () => {
      touchSession()
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => logout('inactivite'), INACTIVITY_MS)
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    // Vérifie aussi au retour sur l'onglet (après mise en veille)
    const onVisible = () => { if (document.visibilityState === 'visible' && sessionExpired()) logout('inactivite') }
    document.addEventListener('visibilitychange', onVisible)
    // L'activité dans les applis embarquées (iframe Bon Intervention) réinitialise aussi le minuteur
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data && e.data.type === 'electreau-activity') reset()
    }
    window.addEventListener('message', onMsg)
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset))
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('message', onMsg)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [user, logout])

  // Garde de routes : redirige vers /login si non connecté
  useEffect(() => {
    if (!ready) return
    const publique = pathname === '/login'
    if (!user && !publique) router.replace('/login')
    if (user && publique) router.replace('/')
  }, [ready, user, pathname, router])

  return (
    <Ctx.Provider value={{ user, ready, login, logout }}>
      {children}
    </Ctx.Provider>
  )
}
