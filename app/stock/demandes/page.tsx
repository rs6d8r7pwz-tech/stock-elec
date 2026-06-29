'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { PurchaseOrder, CommandeLine, StatutCommande } from '@/lib/types'
import { genererCommandePdf } from '@/lib/commandePdf'
import { useAuth } from '@/components/AuthProvider'
import { FileDown, Truck, CheckCircle, Clock, PackageCheck, X } from 'lucide-react'

const STATUTS: Record<StatutCommande, { label: string; bg: string; fg: string }> = {
  a_commander:        { label: 'À commander',       bg: '#fef3c7', fg: '#92400e' },
  livraison_en_cours: { label: 'Livraison en cours', bg: 'var(--blue-light)', fg: 'var(--navy)' },
  finalisee:          { label: 'Finalisée',          bg: '#dcfce7', fg: '#166534' },
}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function PageDemandes() {
  const { user } = useAuth()
  const [demandes, setDemandes] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState<'toutes' | StatutCommande>('toutes')
  const [busy, setBusy] = useState<string>('')           // id en cours de traitement
  const [reception, setReception] = useState<PurchaseOrder | null>(null) // commande à réceptionner
  const [recus, setRecus] = useState<Record<string, number>>({})         // qty reçues par component_id

  const charger = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('purchase_orders').select('*').order('created_at', { ascending: false })
    setDemandes((data as PurchaseOrder[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  // Passer une commande -> livraison en cours
  async function marquerCommandee(d: PurchaseOrder) {
    setBusy(d.id)
    await supabase.from('purchase_orders').update({
      status: 'livraison_en_cours', ordered_at: new Date().toISOString(), ordered_by: user || null,
    }).eq('id', d.id)
    setBusy('')
    charger()
  }

  // Ouvrir la fenêtre de réception (vérification des quantités)
  function ouvrirReception(d: PurchaseOrder) {
    const init: Record<string, number> = {}
    d.lines.forEach((l) => { init[l.component_id] = l.quantity })
    setRecus(init)
    setReception(d)
  }

  // Confirmer la réception : MAJ stock (qté reçues) + mouvements + finalisée
  async function confirmerReception() {
    if (!reception) return
    setBusy(reception.id)
    try {
      for (const l of reception.lines) {
        const recu = Math.max(0, recus[l.component_id] ?? 0)
        if (recu > 0) {
          // Ajout atomique au stock + mouvement d'entrée
          const { error } = await supabase.rpc('adjust_stock', {
            p_id: l.component_id, p_delta: recu,
            p_person: user || null, p_chantier: 'Réception ' + reception.reference,
          })
          if (error) throw error
        }
      }
      const lignesRecues: CommandeLine[] = reception.lines.map((l) => ({ ...l, quantity: l.quantity }))
      await supabase.from('purchase_orders').update({
        status: 'finalisee', finalized_at: new Date().toISOString(), finalized_by: user || null,
        lines: lignesRecues,
      }).eq('id', reception.id)
    } catch (e) {
      console.error(e); alert('Erreur lors de la réception.')
    }
    setBusy(''); setReception(null); charger()
  }

  const liste = demandes.filter((d) => filtre === 'toutes' || d.status === filtre)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <PackageCheck className="w-6 h-6" style={{ color: 'var(--red)' }} />
          Demandes d&apos;achat
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--gray)' }}>
          Suivi partagé des commandes de matériel : à commander → livraison en cours → finalisée (réception).
        </p>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {([['toutes', 'Toutes'], ['a_commander', 'À commander'], ['livraison_en_cours', 'Livraison en cours'], ['finalisee', 'Finalisées']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setFiltre(k as any)}
            className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={{ background: filtre === k ? 'var(--navy)' : 'white', color: filtre === k ? 'white' : 'var(--gray)', border: '1px solid var(--border)' }}>
            {lbl}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center py-8" style={{ color: 'var(--gray)' }}>Chargement…</p>
      ) : liste.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center border" style={{ borderColor: 'var(--border)' }}>
          <p style={{ color: 'var(--gray)' }}>Aucune demande d&apos;achat.</p>
          <p className="text-sm mt-1" style={{ color: 'var(--gray)' }}>Générez-en une depuis l&apos;onglet « Commande PDF ».</p>
        </div>
      ) : (
        <div className="space-y-3">
          {liste.map((d) => {
            const st = STATUTS[d.status]
            return (
              <div key={d.id} className="bg-white rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold" style={{ color: 'var(--navy)' }}>{d.reference}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--gray)' }}>
                      Créée le {fmt(d.created_at)}{d.created_by ? ' par ' + d.created_by : ''} · {d.lines.length} réf. · {d.total_pieces} pièce{d.total_pieces > 1 ? 's' : ''}
                    </p>
                    {d.status !== 'a_commander' && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--gray)' }}>
                        <Truck className="inline w-3 h-3" /> Commandée le {fmt(d.ordered_at)}{d.ordered_by ? ' par ' + d.ordered_by : ''}
                        {d.status === 'finalisee' && <> · <CheckCircle className="inline w-3 h-3" /> Finalisée le {fmt(d.finalized_at)}{d.finalized_by ? ' par ' + d.finalized_by : ''}</>}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => genererCommandePdf(d.lines, { reference: d.reference, date: new Date(d.created_at) })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>
                      <FileDown className="w-4 h-4" /> PDF
                    </button>
                    {d.status === 'a_commander' && (
                      <button onClick={() => marquerCommandee(d)} disabled={busy === d.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--blue)' }}>
                        <Truck className="w-4 h-4" /> {busy === d.id ? '…' : 'Commande passée'}
                      </button>
                    )}
                    {d.status === 'livraison_en_cours' && (
                      <button onClick={() => ouvrirReception(d)} disabled={busy === d.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--success)' }}>
                        <PackageCheck className="w-4 h-4" /> Réceptionner
                      </button>
                    )}
                  </div>
                </div>

                {/* Détail des articles */}
                <div className="mt-3 text-sm border-t pt-2" style={{ borderColor: 'var(--border)' }}>
                  {d.lines.map((l) => (
                    <div key={l.component_id} className="flex justify-between py-0.5" style={{ color: 'var(--text)' }}>
                      <span>{l.name}{l.reference ? <span style={{ color: 'var(--gray)' }}> · {l.reference}</span> : null}</span>
                      <span className="font-semibold" style={{ color: 'var(--red)' }}>×{l.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Fenêtre de réception */}
      {reception && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold" style={{ color: 'var(--navy)' }}>Réception — {reception.reference}</h2>
              <button onClick={() => setReception(null)}><X className="w-5 h-5" style={{ color: 'var(--gray)' }} /></button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm" style={{ color: 'var(--gray)' }}>
                Vérifiez les quantités <strong>réellement reçues</strong> avant d&apos;ajouter au stock (ajustez en cas de manque).
              </p>
              {reception.lines.map((l) => (
                <div key={l.component_id} className="flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <div className="font-medium" style={{ color: 'var(--text)' }}>{l.name}</div>
                    <div className="text-xs" style={{ color: 'var(--gray)' }}>Commandé : {l.quantity}</div>
                  </div>
                  <input type="number" min="0" value={recus[l.component_id] ?? 0}
                    onChange={(e) => setRecus((p) => ({ ...p, [l.component_id]: parseInt(e.target.value) || 0 }))}
                    className="w-24 px-2 py-1.5 border rounded text-center font-bold" style={{ borderColor: 'var(--border)', color: 'var(--success)' }} />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setReception(null)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ color: 'var(--gray)' }}>Annuler</button>
              <button onClick={confirmerReception} disabled={busy === reception.id}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--success)' }}>
                <CheckCircle className="w-4 h-4" /> {busy === reception.id ? 'Ajout au stock…' : 'Confirmer la réception'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
