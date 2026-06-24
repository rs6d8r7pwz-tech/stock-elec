'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Composant } from '@/lib/types'
import StockAdjuster from '@/components/StockAdjuster'
import { AlertTriangle, ExternalLink, ShoppingCart } from 'lucide-react'

export default function PageAlertes() {
  const [composants, setComposants] = useState<Composant[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function charger() {
      const { data } = await supabase
        .from('components')
        .select('*')
        .order('name')
      const alertes = (data || []).filter((c: Composant) => c.quantity < c.threshold)
      setComposants(alertes)
      setLoading(false)
    }
    charger()
  }, [])

  function majQte(id: string, newQty: number) {
    setComposants(prev => prev.map(c => c.id === id ? { ...c, quantity: newQty } : c).filter(c => c.quantity < c.threshold))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--danger)' }}>
            <AlertTriangle className="w-6 h-6" />
            Alertes de stock
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--gray)' }}>
            {loading ? 'Chargement…' : `${composants.length} article${composants.length > 1 ? 's' : ''} sous le seuil minimum`}
          </p>
        </div>
        <Link
          href="/stock/commande"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--blue)' }}
        >
          <ShoppingCart className="w-4 h-4" />
          Générer un bon de commande
        </Link>
      </div>

      {loading ? (
        <p className="text-center py-8" style={{ color: 'var(--gray)' }}>Chargement…</p>
      ) : composants.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border" style={{ borderColor: 'var(--border)' }}>
          <p className="text-green-600 font-semibold">✅ Tout le stock est au-dessus des seuils !</p>
          <Link href="/stock/inventaire" className="mt-2 inline-block text-sm" style={{ color: 'var(--blue)' }}>← Retour au stock</Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: '#dc2626', color: 'white' }}>
                <th className="text-left px-4 py-3 font-semibold">Désignation</th>
                <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Type</th>
                <th className="text-center px-4 py-3 font-semibold">Stock actuel</th>
                <th className="text-center px-4 py-3 font-semibold">Seuil</th>
                <th className="text-center px-4 py-3 font-semibold">Manquant</th>
                <th className="px-4 py-3 font-semibold hidden md:table-cell">Lien produit</th>
                <th className="px-4 py-3 font-semibold">Ajuster</th>
              </tr>
            </thead>
            <tbody>
              {composants.map((c, i) => {
                const manquant = c.threshold - c.quantity
                return (
                  <tr
                    key={c.id}
                    className="border-t"
                    style={{ borderColor: 'var(--border)', backgroundColor: i % 2 === 0 ? '#fff5f5' : 'white' }}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/stock/composant/${c.id}`} className="font-medium hover:underline" style={{ color: 'var(--text)' }}>
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {c.component_type && (
                        <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: 'var(--blue-light)', color: 'var(--blue)' }}>
                          {c.component_type}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-bold" style={{ color: 'var(--danger)' }}>{c.quantity}</td>
                    <td className="px-4 py-3 text-center" style={{ color: 'var(--gray)' }}>{c.threshold}</td>
                    <td className="px-4 py-3 text-center font-bold" style={{ color: 'var(--warning)' }}>−{manquant}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs" style={{ color: 'var(--blue)' }}>
                          <ExternalLink className="w-3.5 h-3.5" />
                          Commander
                        </a>
                      ) : <span style={{ color: 'var(--border)' }}>—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StockAdjuster composant={c} onUpdate={(qty) => majQte(c.id, qty)} />
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
