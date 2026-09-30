'use client'

import { useState } from 'react'
import { Copy, Check, Navigation } from 'lucide-react'
import { liensGps, plateforme, fmtCoord } from '@/lib/carte/geo'

/** Boutons « ouvrir dans Waze / Google Maps / Plans / autre appli » */
export default function BoutonsGps({ lat, lng, nom, compact = false }: { lat: number; lng: number; nom: string; compact?: boolean }) {
  const l = liensGps(lat, lng, nom)
  const os = plateforme()
  const [copie, setCopie] = useState(false)

  const apps = [
    { k: 'waze', label: 'Waze', href: l.waze, bg: '#33ccff', fg: '#0b2a3a' },
    { k: 'google', label: 'Google Maps', href: l.google, bg: '#1a73e8', fg: '#fff' },
    { k: 'apple', label: 'Plans', href: l.apple, bg: '#111827', fg: '#fff' },
  ]
  // Sur iPhone, Plans en premier ; ailleurs Waze / Google d'abord
  if (os === 'ios') apps.unshift(apps.splice(2, 1)[0])

  const copier = async () => {
    const t = `${fmtCoord(lat)}, ${fmtCoord(lng)}`
    try { await navigator.clipboard.writeText(t) } catch {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } catch { /* */ } ta.remove()
    }
    setCopie(true); setTimeout(() => setCopie(false), 1800)
  }

  const partager = async () => {
    const url = l.google.replace('/dir/?api=1&destination=', '/search/?api=1&query=')
    try { await (navigator as any).share({ title: nom, text: `${nom} — ${fmtCoord(lat)}, ${fmtCoord(lng)}`, url }) } catch { /* annulé */ }
  }

  return (
    <div className="space-y-2">
      <div className={`grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-3'}`}>
        {apps.map((a) => (
          <a key={a.k} href={a.href} target="_blank" rel="noopener"
            className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold shadow-sm active:scale-95 transition"
            style={{ background: a.bg, color: a.fg }}>
            <Navigation className="w-4 h-4" /> {a.label}
          </a>
        ))}
      </div>
      {!compact && (
        <div className="grid grid-cols-2 gap-2">
          {os === 'android' ? (
            <a href={l.geo} className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium border bg-white"
              style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>
              Autre appli GPS…
            </a>
          ) : (typeof navigator !== 'undefined' && (navigator as any).share) ? (
            <button onClick={partager} className="rounded-xl py-2 text-sm font-medium border bg-white"
              style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>
              Partager / autre appli…
            </button>
          ) : <span />}
          <button onClick={copier} className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium border bg-white"
            style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>
            {copie ? <><Check className="w-4 h-4 text-green-600" /> Copié</> : <><Copy className="w-4 h-4" /> Copier les coordonnées</>}
          </button>
        </div>
      )}
    </div>
  )
}
