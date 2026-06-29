'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Composant } from '@/lib/types'
import SearchBar from '@/components/SearchBar'
import ExportStock from '@/components/ExportStock'
import { Package, AlertTriangle, Clock, ShoppingCart } from 'lucide-react'

export default function Dashboard() {
  const [composants, setComposants] = useState<Composant[]>([])
  const [recherche, setRecherche] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function charger() {
      const { data } = await supabase
        .from('components')
        .select('*')
        .order('name')
      setComposants(data || [])
      setLoading(false)
    }
    charger()
  }, [])

  const enAlerte = composants.filter(c => c.quantity < c.threshold)
  const resultats = composants.filter(c =>
    recherche === '' ||
    c.name.toLowerCase().includes(recherche.toLowerCase()) ||
    (c.component_type || '').toLowerCase().includes(recherche.toLowerCase()) ||
    (c.reference || '').toLowerCase().includes(recherche.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Tableau de bord</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--gray)' }}>Vue d&apos;ensemble du stock de matériel électrique</p>
        </div>
        <ExportStock />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Package className="w-6 h-6" />}
          label="Références"
          value={composants.length}
          color="var(--blue)"
          href="/stock/inventaire"
        />
        <StatCard
          icon={<AlertTriangle className="w-6 h-6" />}
          label="En alerte"
          value={enAlerte.length}
          color={enAlerte.length > 0 ? 'var(--danger)' : 'var(--success)'}
          href="/stock/alertes"
        />
        <StatCard
          icon={<ShoppingCart className="w-6 h-6" />}
          label="À commander"
          value={enAlerte.length}
          color="var(--warning)"
          href="/stock/commande"
        />
        <StatCard
          icon={<Clock className="w-6 h-6" />}
          label="Historique"
          value="→"
          color="var(--gray)"
          href="/stock/historique"
        />
      </div>

      {/* Recherche rapide */}
      <div className="bg-white rounded-xl p-5 shadow-sm border" style={{ borderColor: 'var(--border)' }}>
        <h2 className="font-semibold mb-3" style={{ color: 'var(--text)' }}>Recherche rapide</h2>
        <SearchBar
          value={recherche}
          onChange={setRecherche}
          placeholder="Rechercher par nom, type (ex: disjoncteur), référence…"
        />

        {recherche && (
          <div className="mt-3 space-y-2">
            {loading ? (
              <p className="text-sm" style={{ color: 'var(--gray)' }}>Chargement…</p>
            ) : resultats.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--gray)' }}>Aucun résultat pour « {recherche} »</p>
            ) : (
              resultats.slice(0, 8).map(c => (
                <Link
                  key={c.id}
                  href={`/stock/composant/${c.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors border"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div>
                    <span className="font-medium text-sm">{c.name}</span>
                    {c.component_type && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--blue-light)', color: 'var(--blue)' }}>
                        {c.component_type}
                      </span>
                    )}
                  </div>
                  <span
                    className="font-bold text-sm"
                    style={{ color: c.quantity < c.threshold ? 'var(--danger)' : 'var(--success)' }}
                  >
                    {c.quantity} unité{c.quantity > 1 ? 's' : ''}
                  </span>
                </Link>
              ))
            )}
            {resultats.length > 8 && (
              <Link href={`/stock/inventaire?q=${encodeURIComponent(recherche)}`} className="text-sm" style={{ color: 'var(--blue)' }}>
                Voir les {resultats.length} résultats →
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Alertes rapides */}
      {enAlerte.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm border" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--danger)' }}>
              <AlertTriangle className="w-5 h-5" />
              {enAlerte.length} article{enAlerte.length > 1 ? 's' : ''} sous le seuil
            </h2>
            <Link href="/stock/alertes" className="text-sm font-medium" style={{ color: 'var(--blue)' }}>Voir tout →</Link>
          </div>
          <div className="space-y-2">
            {enAlerte.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span>{c.name}</span>
                <span style={{ color: 'var(--danger)' }} className="font-semibold">
                  {c.quantity} / seuil {c.threshold}
                </span>
              </div>
            ))}
          </div>
          <Link
            href="/stock/commande"
            className="mt-4 block w-full text-center py-2 rounded-lg font-semibold text-white text-sm transition-colors"
            style={{ backgroundColor: 'var(--blue)' }}
          >
            📄 Générer un bon de commande
          </Link>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon, label, value, color, href
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  color: string
  href: string
}) {
  return (
    <Link href={href} className="bg-white rounded-xl p-4 shadow-sm border hover:shadow-md transition-shadow" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--blue-light)', color }}>
          {icon}
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--gray)' }}>{label}</p>
          <p className="text-xl font-bold" style={{ color }}>{value}</p>
        </div>
      </div>
    </Link>
  )
}
