'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { HelpCircle } from 'lucide-react'

export default function NouveauComposant() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '',
    component_type: '',
    reference: '',
    quantity: '0',
    threshold: '0',
    url: '',
    storage_location: '',
    notes: '',
  })
  const [loading, setLoading] = useState(false)
  const [erreur, setErreur] = useState('')

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function sauvegarder(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setErreur('Le nom est obligatoire.'); return }
    setLoading(true)
    setErreur('')
    const { error } = await supabase.from('components').insert({
      name: form.name.trim(),
      component_type: form.component_type.trim() || null,
      reference: form.reference.trim() || null,
      quantity: parseInt(form.quantity) || 0,
      threshold: parseInt(form.threshold) || 0,
      url: form.url.trim() || null,
      storage_location: form.storage_location.trim() || null,
      notes: form.notes.trim() || null,
    })
    if (error) { setErreur(error.message); setLoading(false); return }
    router.push('/stock')
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text)' }}>Nouveau composant</h1>

      <form onSubmit={sauvegarder} className="bg-white rounded-xl shadow-sm border p-6 space-y-5" style={{ borderColor: 'var(--border)' }}>
        <Champ label="Nom *" aide="Nom complet du composant, ex: Disjoncteur bipolaire 10A Legrand">
          <input value={form.name} onChange={e => set('name', e.target.value)} required className={inp} placeholder="ex: DPN Vigi 16A" />
        </Champ>

        <Champ label="Type de composant" aide="Mot-clé de recherche : disjoncteur, contacteur, relais, câble… Sert à retrouver le composant par type.">
          <input value={form.component_type} onChange={e => set('component_type', e.target.value)} className={inp} placeholder="ex: disjoncteur" />
        </Champ>

        <Champ label="Référence fabricant" aide="Référence du fabricant ou du fournisseur (optionnel)">
          <input value={form.reference} onChange={e => set('reference', e.target.value)} className={inp} placeholder="ex: 406798" />
        </Champ>

        <div className="grid grid-cols-2 gap-4">
          <Champ label="Quantité en stock" aide="Nombre d'unités actuellement en stock">
            <input type="number" min="0" value={form.quantity} onChange={e => set('quantity', e.target.value)} className={inp} />
          </Champ>
          <Champ label="Seuil d'alerte" aide="En dessous de cette quantité, le composant apparaît dans les alertes">
            <input type="number" min="0" value={form.threshold} onChange={e => set('threshold', e.target.value)} className={inp} />
          </Champ>
        </div>

        <Champ label="URL produit" aide="Lien vers la page du produit chez le fournisseur (optionnel)">
          <input type="url" value={form.url} onChange={e => set('url', e.target.value)} className={inp} placeholder="https://www.rexel.fr/…" />
        </Champ>

        <Champ
          label={<span className="flex items-center gap-1">Emplacement de stockage <HelpCircle className="w-3.5 h-3.5" style={{ color: 'var(--gray)' }} /></span>}
          aide="Indiquer précisément où se trouve physiquement ce composant dans l'atelier (ex: Étagère B / Bac 2 / Tiroir gauche)"
        >
          <input value={form.storage_location} onChange={e => set('storage_location', e.target.value)} className={inp} placeholder="ex: Étagère A / Bac 3" />
        </Champ>

        <Champ label="Notes" aide="Informations complémentaires libres">
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} className={inp} placeholder="Ex: Compatible avec gamme XL³ uniquement" />
        </Champ>

        {erreur && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erreur}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--blue)' }}
          >
            {loading ? 'Enregistrement…' : 'Enregistrer le composant'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2.5 rounded-lg font-medium border"
            style={{ borderColor: 'var(--border)', color: 'var(--gray)' }}
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  )
}

const inp = 'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 bg-white'

function Champ({ label, aide, children }: { label: React.ReactNode; aide: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--text)' }}>
        {label}
        <span title={aide} className="cursor-help">
          <HelpCircle className="w-3.5 h-3.5" style={{ color: 'var(--gray)' }} />
        </span>
      </label>
      {children}
      <p className="text-xs" style={{ color: 'var(--gray)' }}>{aide}</p>
    </div>
  )
}
