'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Composant } from '@/lib/types'
import SearchBar from '@/components/SearchBar'
import StockAdjuster from '@/components/StockAdjuster'
import { ExternalLink, HelpCircle, Plus } from 'lucide-react'

export default function PageStock() {
  const [composants, setComposants] = useState<Composant[]>([])
  const [recherche, setRecherche] = useState('')
  const [loading, setLoading] = useState(true)

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('components')
      .select('*')
      .order('name')
    setComposants(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  const filtres = composants.filter(c =>
    recherche === '' ||
    c.name.toLowerCase().includes(recherche.toLowerCase()) ||
    (c.component_type || '').toLowerCase().includes(recherche.toLowerCase()) ||
    (c.reference || '').toLowerCase().includes(recherche.toLowerCase()) ||
    (c.storage_location || '').toLowerCase().includes(recherche.toLowerCase())
  )

  function majQte(id: string, newQty: number) {
    setComposants(prev => prev.map(c => c.id === id ? { ...c, quantity: newQty } : c))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Stock complet</h1>
          <p className="text-sm" style={{ color: 'var(--gray)' }}>{composants.length} référence{composants.length > 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/composant/nouveau"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--blue)' }}
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </Link>
      </div>

      <SearchBar
        value={recherche}
        onChange={setRecherche}
        placeholder="Rechercher par nom, type (ex: disjoncteur, contacteur), référence…"
      />

      {loading ? (
        <p className="text-center py-8" style={{ color: 'var(--gray)' }}>Chargement…</p>
      ) : filtres.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border" style={{ borderColor: 'var(--border)' }}>
          <p style={{ color: 'var(--gray)' }}>{recherche ? `Aucun résultat pour « ${recherche} »` : 'Aucun composant enregistré.'}</p>
          {!recherche && (
            <Link href="/composant/nouveau" className="mt-3 inline-block text-sm font-medium" style={{ color: 'var(--blue)' }}>
              Ajouter le premier composant →
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'var(--blue)', color: 'white' }}>
                <th className="text-left px-4 py-3 font-semibold">Désignation</th>
                <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Type</th>
                <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Référence</th>
                <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">
                  <span className="flex items-center gap-1">
                    Emplacement
                    <span title="Indiquer où le composant est physiquement stocké (ex: Étagère A / Bac 3)">
                      <HelpCircle className="w-3.5 h-3.5 opacity-70" />
                    </span>
                  </span>
                </th>
                <th className="text-center px-4 py-3 font-semibold">Seuil</th>
                <th className="text-center px-4 py-3 font-semibold">Quantité</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtres.map((c, i) => {
                const alerte = c.quantity < c.threshold
                return (
                  <tr
                    key={c.id}
                    className="border-t hover:bg-gray-50 transition-colors"
                    style={{ borderColor: 'var(--border)', backgroundColor: i % 2 === 0 ? 'white' : 'var(--bg)' }}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/composant/${c.id}`} className="font-medium hover:underline" style={{ color: 'var(--text)' }}>
                        {c.name}
                      </Link>
                      {alerte && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: '#fee2e2', color: 'var(--danger)' }}>
                          ALERTE
                        </span>
                      )}
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex" title="Voir le produit">
                          <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--blue)' }} />
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {c.component_type && (
                        <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: 'var(--blue-light)', color: 'var(--blue)' }}>
                          {c.component_type}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell" style={{ color: 'var(--gray)' }}>{c.reference || '—'}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs" style={{ color: 'var(--gray)' }}>{c.storage_location || '—'}</td>
                    <td className="px-4 py-3 text-center" style={{ color: 'var(--gray)' }}>{c.threshold}</td>
                    <td className="px-4 py-3">
                      <StockAdjuster composant={c} onUpdate={(qty) => majQte(c.id, qty)} />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/composant/${c.id}`} className="text-xs" style={{ color: 'var(--blue)' }}>Détail</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
