'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Composant, Mouvement } from '@/lib/types'
import StockAdjuster from '@/components/StockAdjuster'
import { formatDate } from '@/lib/utils'
import { ExternalLink, HelpCircle, Trash2, ArrowLeft } from 'lucide-react'

export default function FicheComposant() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [composant, setComposant] = useState<Composant | null>(null)
  const [mouvements, setMouvements] = useState<Mouvement[]>([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Composant>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function charger() {
      const { data: c } = await supabase.from('components').select('*').eq('id', id).single()
      const { data: m } = await supabase.from('movements').select('*').eq('component_id', id).order('created_at', { ascending: false }).limit(50)
      setComposant(c)
      setForm(c || {})
      setMouvements(m || [])
      setLoading(false)
    }
    charger()
  }, [id])

  async function sauvegarder() {
    if (!composant) return
    setSaving(true)
    await supabase.from('components').update({
      name: form.name,
      component_type: form.component_type || null,
      reference: form.reference || null,
      quantity: form.quantity,
      threshold: form.threshold,
      url: form.url || null,
      storage_location: form.storage_location || null,
      notes: form.notes || null,
    }).eq('id', composant.id)
    const { data } = await supabase.from('components').select('*').eq('id', composant.id).single()
    setComposant(data)
    setEditing(false)
    setSaving(false)
  }

  async function supprimer() {
    if (!composant) return
    if (!confirm(`Supprimer « ${composant.name} » et tout son historique ?`)) return
    await supabase.from('components').delete().eq('id', composant.id)
    router.push('/stock/inventaire')
  }

  if (loading) return <p className="text-center py-12" style={{ color: 'var(--gray)' }}>Chargement…</p>
  if (!composant) return <p className="text-center py-12" style={{ color: 'var(--danger)' }}>Composant introuvable.</p>

  const alerte = composant.quantity < composant.threshold

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Retour */}
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm" style={{ color: 'var(--blue)' }}>
        <ArrowLeft className="w-4 h-4" /> Retour
      </button>

      {/* Fiche */}
      <div className="bg-white rounded-xl shadow-sm border p-6" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{composant.name}</h1>
            {composant.component_type && (
              <span className="mt-1 inline-block px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: 'var(--blue-light)', color: 'var(--blue)' }}>
                {composant.component_type}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {!editing && (
              <button onClick={() => setEditing(true)} className="px-3 py-1.5 rounded border text-sm font-medium" style={{ borderColor: 'var(--blue)', color: 'var(--blue)' }}>
                Modifier
              </button>
            )}
            <button onClick={supprimer} className="p-1.5 rounded hover:bg-red-50" style={{ color: 'var(--danger)' }} title="Supprimer">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!editing ? (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Info label="Référence" value={composant.reference || '—'} />
            <Info label="Emplacement" value={composant.storage_location || '—'} aide="Emplacement physique dans l'atelier" />
            <Info label="Quantité en stock" value={
              <span style={{ color: alerte ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                {composant.quantity} {alerte && '⚠ ALERTE'}
              </span>
            } />
            <Info label="Seuil d'alerte" value={composant.threshold} />
            {composant.url && (
              <div className="col-span-2">
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--gray)' }}>Lien produit</p>
                <a href={composant.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm" style={{ color: 'var(--blue)' }}>
                  <ExternalLink className="w-3.5 h-3.5" />
                  {composant.url}
                </a>
              </div>
            )}
            {composant.notes && (
              <div className="col-span-2">
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--gray)' }}>Notes</p>
                <p className="text-sm">{composant.notes}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'name', label: 'Nom *', type: 'text' },
                { key: 'component_type', label: 'Type de composant', type: 'text' },
                { key: 'reference', label: 'Référence', type: 'text' },
                { key: 'url', label: 'URL produit', type: 'url' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--gray)' }}>{f.label}</label>
                  <input
                    type={f.type}
                    value={(form as any)[f.key] || ''}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none"
                    style={{ borderColor: 'var(--border)' }}
                  />
                </div>
              ))}
              {[
                { key: 'quantity', label: 'Quantité' },
                { key: 'threshold', label: 'Seuil alerte' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--gray)' }}>{f.label}</label>
                  <input
                    type="number" min="0"
                    value={(form as any)[f.key] ?? ''}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none"
                    style={{ borderColor: 'var(--border)' }}
                  />
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-xs font-medium block mb-1 flex items-center gap-1" style={{ color: 'var(--gray)' }}>
                  Emplacement <span title="Où est physiquement stocké ce composant ?"><HelpCircle className="w-3 h-3" /></span>
                </label>
                <input
                  value={form.storage_location || ''}
                  onChange={e => setForm(prev => ({ ...prev, storage_location: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)' }}
                  placeholder="ex: Étagère A / Bac 3"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--gray)' }}>Notes</label>
                <textarea
                  value={form.notes || ''}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)' }}
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={sauvegarder} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: 'var(--blue)' }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button onClick={() => { setEditing(false); setForm(composant) }} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--border)', color: 'var(--gray)' }}>
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Ajustement stock */}
        {!editing && (
          <div className="mt-5 pt-5 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>Ajuster le stock</p>
            <StockAdjuster
              composant={composant}
              onUpdate={(qty) => setComposant(prev => prev ? { ...prev, quantity: qty } : prev)}
            />
          </div>
        )}
      </div>

      {/* Historique */}
      <div className="bg-white rounded-xl shadow-sm border p-5" style={{ borderColor: 'var(--border)' }}>
        <h2 className="font-semibold mb-3" style={{ color: 'var(--text)' }}>Historique des mouvements</h2>
        {mouvements.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--gray)' }}>Aucun mouvement enregistré.</p>
        ) : (
          <div className="space-y-2">
            {mouvements.map(m => (
              <div key={m.id} className="flex items-center justify-between text-sm py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-3">
                  <span
                    className="px-2 py-0.5 rounded text-xs font-bold"
                    style={{
                      backgroundColor: m.movement_type === 'in' ? '#dcfce7' : '#fee2e2',
                      color: m.movement_type === 'in' ? 'var(--success)' : 'var(--danger)',
                    }}
                  >
                    {m.movement_type === 'in' ? `+${m.quantity}` : `-${m.quantity}`}
                  </span>
                  {m.person_name && <span>{m.person_name}</span>}
                  {m.chantier_ref && <span style={{ color: 'var(--gray)' }}>· {m.chantier_ref}</span>}
                </div>
                <span className="text-xs" style={{ color: 'var(--gray)' }}>{formatDate(m.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Info({ label, value, aide }: { label: string; value: React.ReactNode; aide?: string }) {
  return (
    <div>
      <p className="text-xs font-medium flex items-center gap-1 mb-0.5" style={{ color: 'var(--gray)' }}>
        {label}
        {aide && <span title={aide}><HelpCircle className="w-3 h-3" /></span>}
      </p>
      <p className="text-sm">{value}</p>
    </div>
  )
}
