'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Composant, LigneCommande } from '@/lib/types'
import SearchBar from '@/components/SearchBar'
import { FileDown, Plus, Trash2, ShoppingCart } from 'lucide-react'

export default function PageCommande() {
  const [lignes, setLignes] = useState<LigneCommande[]>([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [suggestions, setSuggestions] = useState<Composant[]>([])
  const [tousComposants, setTousComposants] = useState<Composant[]>([])
  const [generatingPdf, setGeneratingPdf] = useState(false)

  // Charger les alertes + tous les composants pour la recherche
  const charger = useCallback(async () => {
    const { data } = await supabase.from('components').select('*').order('name')
    const all = data || []
    setTousComposants(all)
    // Auto-remplir avec les articles sous seuil
    const alertes: LigneCommande[] = all
      .filter((c: Composant) => c.quantity < c.threshold)
      .map((c: Composant) => ({
        composant: c,
        quantite_a_commander: Math.max(1, c.threshold - c.quantity),
        manuel: false,
      }))
    setLignes(alertes)
    setLoading(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  // Suggestions de recherche (exclure déjà dans la liste)
  useEffect(() => {
    if (recherche.trim().length < 2) { setSuggestions([]); return }
    const idsDejaLa = new Set(lignes.map(l => l.composant.id))
    const q = recherche.toLowerCase()
    const res = tousComposants.filter(c =>
      !idsDejaLa.has(c.id) && (
        c.name.toLowerCase().includes(q) ||
        (c.component_type || '').toLowerCase().includes(q) ||
        (c.reference || '').toLowerCase().includes(q)
      )
    ).slice(0, 6)
    setSuggestions(res)
  }, [recherche, lignes, tousComposants])

  function ajouterComposant(c: Composant) {
    setLignes(prev => [...prev, { composant: c, quantite_a_commander: 1, manuel: true }])
    setRecherche('')
    setSuggestions([])
  }

  function supprimerLigne(id: string) {
    setLignes(prev => prev.filter(l => l.composant.id !== id))
  }

  function majQte(id: string, qte: number) {
    setLignes(prev => prev.map(l => l.composant.id === id ? { ...l, quantite_a_commander: Math.max(1, qte) } : l))
  }

  async function genererPdf() {
    if (lignes.length === 0) return
    setGeneratingPdf(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const now = new Date()
      const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      const pageW = doc.internal.pageSize.getWidth()

      // ── En-tête ──
      doc.setFillColor(22, 41, 74) // navy Electreau #16294a
      doc.rect(0, 0, pageW, 28, 'F')

      doc.setTextColor(255, 255, 255)
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text('⚡ ELECTREAU', 14, 12)

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text('Gestion de stock électrique', 14, 19)

      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text('BON DE COMMANDE', pageW - 14, 12, { align: 'right' })
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text(`Généré le ${dateStr}`, pageW - 14, 19, { align: 'right' })

      // ── Ligne séparatrice ──
      doc.setDrawColor(212, 45, 40) // rouge Electreau #d42d28
      doc.setLineWidth(0.5)
      doc.line(14, 31, pageW - 14, 31)

      // ── Tableau ──
      const rows = lignes.map(l => [
        l.composant.name,
        l.composant.component_type || '—',
        l.composant.reference || '—',
        String(l.composant.quantity),
        String(l.composant.threshold),
        String(l.quantite_a_commander),
        l.composant.url ? l.composant.url.replace(/^https?:\/\//, '').substring(0, 40) : '—',
      ])

      autoTable(doc, {
        startY: 35,
        head: [['Désignation', 'Type', 'Référence', 'Stock actuel', 'Seuil', 'Qté à commander', 'Lien / URL']],
        body: rows,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: {
          fillColor: [22, 41, 74],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        alternateRowStyles: { fillColor: [224, 245, 251] }, // bleu eau #e0f5fb
        columnStyles: {
          5: { fontStyle: 'bold', textColor: [212, 45, 40], halign: 'center' }, // Qté à commander (rouge)
          3: { halign: 'center' },
          4: { halign: 'center' },
        },
        // Pied de page
        didDrawPage: (data) => {
          const pageCount = doc.getNumberOfPages()
          doc.setFontSize(8)
          doc.setTextColor(107, 114, 128)
          doc.text(
            `Electreau — Bon de commande du ${dateStr} — Page ${data.pageNumber}/${pageCount}`,
            pageW / 2,
            doc.internal.pageSize.getHeight() - 8,
            { align: 'center' }
          )
        },
      })

      // ── Récap total ──
      const finalY = (doc as any).lastAutoTable.finalY + 6
      if (finalY < doc.internal.pageSize.getHeight() - 20) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(22, 41, 74)
        const total = lignes.reduce((s, l) => s + l.quantite_a_commander, 0)
        doc.text(`Total : ${lignes.length} référence${lignes.length > 1 ? 's' : ''} — ${total} pièce${total > 1 ? 's' : ''} à commander`, 14, finalY)
      }

      doc.save(`bon-commande-electreau-${now.toISOString().slice(0, 10)}.pdf`)
    } catch (e) {
      console.error('Erreur génération PDF', e)
      alert('Erreur lors de la génération du PDF.')
    }
    setGeneratingPdf(false)
  }

  const totalPieces = lignes.reduce((s, l) => s + l.quantite_a_commander, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <ShoppingCart className="w-6 h-6" style={{ color: 'var(--blue)' }} />
            Bon de commande
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--gray)' }}>
            Articles sous seuil auto-ajoutés. Modifiez les quantités ou ajoutez d&apos;autres articles manuellement.
          </p>
        </div>
        <button
          onClick={genererPdf}
          disabled={lignes.length === 0 || generatingPdf}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white text-sm disabled:opacity-50 transition-colors"
          style={{ backgroundColor: 'var(--blue)' }}
        >
          <FileDown className="w-4 h-4" />
          {generatingPdf ? 'Génération…' : 'Télécharger le PDF'}
        </button>
      </div>

      {/* Résumé */}
      {lignes.length > 0 && (
        <div className="flex gap-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--blue-light)', color: 'var(--blue)' }}>
          <span className="font-semibold">{lignes.length} référence{lignes.length > 1 ? 's' : ''}</span>
          <span>·</span>
          <span>{totalPieces} pièce{totalPieces > 1 ? 's' : ''} à commander</span>
          <span>·</span>
          <span>{lignes.filter(l => !l.manuel).length} auto (alertes)</span>
          {lignes.filter(l => l.manuel).length > 0 && (
            <><span>·</span><span>{lignes.filter(l => l.manuel).length} ajouté{lignes.filter(l => l.manuel).length > 1 ? 's' : ''} manuellement</span></>
          )}
        </div>
      )}

      {/* Liste des lignes */}
      {loading ? (
        <p className="text-center py-8" style={{ color: 'var(--gray)' }}>Chargement…</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {lignes.length === 0 ? (
            <div className="text-center py-10" style={{ color: 'var(--gray)' }}>
              <p>Aucun article dans le bon de commande.</p>
              <p className="text-sm mt-1">Utilisez la recherche ci-dessous pour ajouter des articles.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: 'var(--blue)', color: 'white' }}>
                  <th className="text-left px-4 py-3 font-semibold">Désignation</th>
                  <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Type</th>
                  <th className="text-left px-4 py-3 font-semibold hidden lg:table-cell">Référence</th>
                  <th className="text-center px-4 py-3 font-semibold">Stock</th>
                  <th className="text-center px-4 py-3 font-semibold">Seuil</th>
                  <th className="text-center px-4 py-3 font-semibold">Qté à commander</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr
                    key={l.composant.id}
                    className="border-t"
                    style={{ borderColor: 'var(--border)', backgroundColor: i % 2 === 0 ? 'white' : 'var(--bg)' }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{l.composant.name}</span>
                        {!l.manuel && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#fee2e2', color: 'var(--danger)' }}>
                            Alerte
                          </span>
                        )}
                        {l.manuel && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--blue-light)', color: 'var(--blue)' }}>
                            Manuel
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {l.composant.component_type && (
                        <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: 'var(--blue-light)', color: 'var(--blue)' }}>
                          {l.composant.component_type}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs" style={{ color: 'var(--gray)' }}>
                      {l.composant.reference || '—'}
                    </td>
                    <td className="px-4 py-3 text-center" style={{ color: l.composant.quantity < l.composant.threshold ? 'var(--danger)' : 'var(--text)' }}>
                      {l.composant.quantity}
                    </td>
                    <td className="px-4 py-3 text-center" style={{ color: 'var(--gray)' }}>{l.composant.threshold}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="1"
                        value={l.quantite_a_commander}
                        onChange={e => majQte(l.composant.id, parseInt(e.target.value) || 1)}
                        className="w-20 px-2 py-1 border rounded text-center font-bold focus:outline-none"
                        style={{ borderColor: 'var(--blue)', color: 'var(--blue)' }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => supprimerLigne(l.composant.id)}
                        className="p-1 rounded hover:bg-red-50 transition-colors"
                        style={{ color: 'var(--danger)' }}
                        title="Retirer de la commande"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Ajouter manuellement */}
      <div className="bg-white rounded-xl p-4 shadow-sm border" style={{ borderColor: 'var(--border)' }}>
        <h2 className="font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <Plus className="w-4 h-4" style={{ color: 'var(--blue)' }} />
          Ajouter un article manuellement
        </h2>
        <div className="relative">
          <SearchBar
            value={recherche}
            onChange={setRecherche}
            placeholder="Rechercher un composant à ajouter (nom, type, référence)…"
          />
          {suggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              {suggestions.map(c => (
                <button
                  key={c.id}
                  onClick={() => ajouterComposant(c)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 text-left text-sm transition-colors"
                >
                  <div>
                    <span className="font-medium">{c.name}</span>
                    {c.component_type && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--blue-light)', color: 'var(--blue)' }}>
                        {c.component_type}
                      </span>
                    )}
                    {c.reference && <span className="ml-2 text-xs" style={{ color: 'var(--gray)' }}>{c.reference}</span>}
                  </div>
                  <span className="text-xs" style={{ color: 'var(--gray)' }}>Stock: {c.quantity}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bouton PDF en bas */}
      {lignes.length > 0 && (
        <button
          onClick={genererPdf}
          disabled={generatingPdf}
          className="w-full py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ backgroundColor: 'var(--blue)' }}
        >
          <FileDown className="w-5 h-5" />
          {generatingPdf ? 'Génération du PDF…' : `Télécharger le bon de commande (${lignes.length} article${lignes.length > 1 ? 's' : ''})`}
        </button>
      )}
    </div>
  )
}
