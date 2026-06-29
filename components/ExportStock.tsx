'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Download } from 'lucide-react'

function toCsv(rows: (string | number | null)[][]): string {
  return rows
    .map((r) => r.map((v) => {
      const s = v === null || v === undefined ? '' : String(v)
      return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }).join(';'))
    .join('\r\n')
}

function download(name: string, content: string) {
  // BOM pour qu'Excel lise correctement les accents
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

export default function ExportStock() {
  const [busy, setBusy] = useState(false)

  async function exporter() {
    setBusy(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const { data: comps } = await supabase.from('components').select('*').order('name')
      const rowsC: (string | number | null)[][] = [
        ['Nom', 'Type', 'Référence', 'Quantité', 'Seuil', 'Emplacement', 'URL', 'Notes'],
        ...(comps || []).map((c: any) => [c.name, c.component_type, c.reference, c.quantity, c.threshold, c.storage_location, c.url, c.notes]),
      ]
      download(`stock-electreau-${today}.csv`, toCsv(rowsC))

      // Historique des mouvements (sauvegarde complémentaire)
      const { data: mvts } = await supabase.from('movements').select('*, composant:components(name)').order('created_at', { ascending: false })
      if (mvts && mvts.length) {
        const rowsM: (string | number | null)[][] = [
          ['Date', 'Article', 'Type', 'Quantité', 'Personne', 'Chantier'],
          ...mvts.map((m: any) => [
            new Date(m.created_at).toLocaleString('fr-FR'),
            m.composant?.name ?? m.component_id,
            m.movement_type === 'in' ? 'Entrée' : 'Sortie',
            m.quantity, m.person_name, m.chantier_ref,
          ]),
        ]
        download(`mouvements-electreau-${today}.csv`, toCsv(rowsM))
      }
    } catch (e) {
      console.error(e); alert("Erreur lors de l'export.")
    }
    setBusy(false)
  }

  return (
    <button onClick={exporter} disabled={busy}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border disabled:opacity-50"
      style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}
      title="Télécharger une sauvegarde du stock (CSV)">
      <Download className="w-4 h-4" />
      {busy ? 'Export…' : 'Exporter (CSV)'}
    </button>
  )
}
