'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Mouvement } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import SearchBar from '@/components/SearchBar'

export default function PageHistorique() {
  const [mouvements, setMouvements] = useState<Mouvement[]>([])
  const [recherche, setRecherche] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function charger() {
      const { data } = await supabase
        .from('movements')
        .select('*, composant:components(id,name,component_type)')
        .order('created_at', { ascending: false })
        .limit(200)
      setMouvements(data || [])
      setLoading(false)
    }
    charger()
  }, [])

  const filtres = mouvements.filter(m => {
    if (recherche === '') return true
    const q = recherche.toLowerCase()
    return (
      (m.composant?.name || '').toLowerCase().includes(q) ||
      (m.composant?.component_type || '').toLowerCase().includes(q) ||
      (m.chantier_ref || '').toLowerCase().includes(q) ||
      (m.person_name || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Historique des mouvements</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--gray)' }}>200 derniers mouvements</p>
      </div>

      <SearchBar value={recherche} onChange={setRecherche} placeholder="Filtrer par article, chantier, prénom…" />

      {loading ? (
        <p className="text-center py-8" style={{ color: 'var(--gray)' }}>Chargement…</p>
      ) : filtres.length === 0 ? (
        <p className="text-center py-8" style={{ color: 'var(--gray)' }}>Aucun mouvement trouvé.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: 'var(--blue)', color: 'white' }}>
                <th className="text-left px-4 py-3 font-semibold">Date</th>
                <th className="text-left px-4 py-3 font-semibold">Article</th>
                <th className="text-center px-4 py-3 font-semibold">Mouvement</th>
                <th className="text-center px-4 py-3 font-semibold">Qté</th>
                <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Personne</th>
                <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Chantier</th>
              </tr>
            </thead>
            <tbody>
              {filtres.map((m, i) => (
                <tr
                  key={m.id}
                  className="border-t"
                  style={{ borderColor: 'var(--border)', backgroundColor: i % 2 === 0 ? 'white' : 'var(--bg)' }}
                >
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--gray)' }}>{formatDate(m.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{m.composant?.name || '—'}</span>
                    {m.composant?.component_type && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--blue-light)', color: 'var(--blue)' }}>
                        {m.composant.component_type}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-bold"
                      style={{
                        backgroundColor: m.movement_type === 'in' ? '#dcfce7' : '#fee2e2',
                        color: m.movement_type === 'in' ? 'var(--success)' : 'var(--danger)',
                      }}
                    >
                      {m.movement_type === 'in' ? '↑ Entrée' : '↓ Sortie'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-bold">{m.quantity}</td>
                  <td className="px-4 py-3 hidden md:table-cell" style={{ color: 'var(--gray)' }}>{m.person_name || '—'}</td>
                  <td className="px-4 py-3 hidden md:table-cell" style={{ color: 'var(--gray)' }}>{m.chantier_ref || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
