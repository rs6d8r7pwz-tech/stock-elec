'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Composant } from '@/lib/types'

interface Props {
  composant: Composant
  onUpdate: (newQty: number) => void
}

const QTE_RAPIDES = [1, 2, 5, 10]

export default function StockAdjuster({ composant, onUpdate }: Props) {
  const [mouvement, setMouvement] = useState<'in' | 'out' | null>(null)
  const [qteChoisie, setQteChoisie] = useState(1)
  const [qteLibre, setQteLibre] = useState('')
  const [nom, setNom] = useState('')
  const [chantier, setChantier] = useState('')
  const [loading, setLoading] = useState(false)
  const [erreur, setErreur] = useState('')

  const qteFinale = qteLibre ? parseInt(qteLibre) : qteChoisie

  async function valider() {
    if (!mouvement || qteFinale <= 0) return
    if (mouvement === 'out' && qteFinale > composant.quantity) {
      setErreur('Quantité insuffisante en stock')
      return
    }
    setLoading(true)
    setErreur('')
    const nouvelleQte = mouvement === 'in'
      ? composant.quantity + qteFinale
      : composant.quantity - qteFinale

    const { error: errMvt } = await supabase.from('movements').insert({
      component_id: composant.id,
      movement_type: mouvement,
      quantity: qteFinale,
      person_name: nom || null,
      chantier_ref: chantier || null,
    })

    if (!errMvt) {
      const { error: errQte } = await supabase
        .from('components')
        .update({ quantity: nouvelleQte })
        .eq('id', composant.id)
      if (!errQte) {
        onUpdate(nouvelleQte)
        setMouvement(null)
        setQteChoisie(1)
        setQteLibre('')
        setNom('')
        setChantier('')
      }
    }
    setLoading(false)
  }

  if (!mouvement) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="font-bold text-lg"
          style={{ color: composant.quantity < composant.threshold ? 'var(--danger)' : 'var(--text)' }}
        >
          {composant.quantity}
        </span>
        <button
          onClick={() => setMouvement('out')}
          className="w-8 h-8 rounded font-bold text-white flex items-center justify-center transition-colors"
          style={{ backgroundColor: 'var(--danger)' }}
          title="Retirer du stock"
        >−</button>
        <button
          onClick={() => setMouvement('in')}
          className="w-8 h-8 rounded font-bold text-white flex items-center justify-center transition-colors"
          style={{ backgroundColor: 'var(--success)' }}
          title="Ajouter au stock"
        >+</button>
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-3 space-y-3" style={{ borderColor: mouvement === 'in' ? 'var(--success)' : 'var(--danger)', backgroundColor: 'var(--bg)' }}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm" style={{ color: mouvement === 'in' ? 'var(--success)' : 'var(--danger)' }}>
          {mouvement === 'in' ? '➕ Entrée stock' : '➖ Sortie stock'} — {composant.name}
        </span>
        <button onClick={() => { setMouvement(null); setErreur('') }} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>

      {/* Quantité rapide */}
      <div className="flex gap-2 flex-wrap">
        <span className="text-xs text-gray-500 self-center">Qté :</span>
        {QTE_RAPIDES.map(q => (
          <button
            key={q}
            onClick={() => { setQteChoisie(q); setQteLibre('') }}
            className={`px-3 py-1 rounded text-sm font-medium border transition-colors ${
              qteChoisie === q && !qteLibre
                ? 'text-white border-transparent'
                : 'bg-white'
            }`}
            style={qteChoisie === q && !qteLibre ? { backgroundColor: 'var(--blue)', borderColor: 'var(--blue)' } : { borderColor: 'var(--border)', color: 'var(--text)' }}
          >{q}</button>
        ))}
        <input
          type="number"
          min="1"
          value={qteLibre}
          onChange={e => setQteLibre(e.target.value)}
          placeholder="Autre"
          className="w-20 px-2 py-1 border rounded text-sm focus:outline-none"
          style={{ borderColor: qteLibre ? 'var(--blue)' : 'var(--border)' }}
        />
      </div>

      {/* Nom + chantier */}
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={nom}
          onChange={e => setNom(e.target.value)}
          placeholder="Prénom (optionnel)"
          className="px-2 py-1 border rounded text-sm focus:outline-none"
          style={{ borderColor: 'var(--border)' }}
        />
        <input
          type="text"
          value={chantier}
          onChange={e => setChantier(e.target.value)}
          placeholder="Réf. chantier (optionnel)"
          className="px-2 py-1 border rounded text-sm focus:outline-none"
          style={{ borderColor: 'var(--border)' }}
        />
      </div>

      {erreur && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erreur}</p>}

      <button
        onClick={valider}
        disabled={loading || qteFinale <= 0}
        className="w-full py-2 rounded font-semibold text-white text-sm disabled:opacity-50 transition-colors"
        style={{ backgroundColor: mouvement === 'in' ? 'var(--success)' : 'var(--danger)' }}
      >
        {loading ? 'Enregistrement…' : `Confirmer (${qteFinale} pièce${qteFinale > 1 ? 's' : ''})`}
      </button>
    </div>
  )
}
