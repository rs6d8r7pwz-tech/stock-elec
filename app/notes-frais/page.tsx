'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { NoteFrais } from '@/lib/types'
import { useAuth } from '@/components/AuthProvider'
import { TECHNICIENS, COMPTE_GESTION } from '@/lib/auth'
import CropScanModal from '@/components/CropScanModal'
import { Receipt, Camera, Trash2, FileText, Check, Clock, X, Plus, Send } from 'lucide-react'

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result as string)
    fr.onerror = rej
    fr.readAsDataURL(file)
  })
}
function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
}

// Pages (dataURL JPEG déjà recadrées/scannées) -> un PDF
async function pagesToPdf(pages: string[]): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const PW = 210, PH = 297, M = 8
  for (let i = 0; i < pages.length; i++) {
    const img = await loadImg(pages[i])
    if (i > 0) doc.addPage()
    const maxW = PW - M * 2, maxH = PH - M * 2
    let w = maxW, h = (w * img.height) / img.width
    if (h > maxH) { h = maxH; w = (h * img.width) / img.height }
    doc.addImage(pages[i], 'JPEG', (PW - w) / 2, (PH - h) / 2, w, h)
  }
  return doc.output('blob')
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function PageNotesFrais() {
  const { user } = useAuth()
  const gestion = user === COMPTE_GESTION
  const [notes, setNotes] = useState<NoteFrais[]>([])
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState<'toutes' | 'en_attente' | 'classee'>('toutes')

  const [ouvert, setOuvert] = useState(false)
  const [concerned, setConcerned] = useState<string[]>(user && TECHNICIENS.includes(user) ? [user] : [])
  const [customNom, setCustomNom] = useState('')
  const [montant, setMontant] = useState('')
  const [objet, setObjet] = useState('')
  const [pages, setPages] = useState<string[]>([])     // photos traitées (prêtes PDF)
  const [queue, setQueue] = useState<string[]>([])      // photos en attente de recadrage
  const [lisible, setLisible] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const charger = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('notes_frais').select('*').order('created_at', { ascending: false })
    if (!gestion && user) q = q.eq('sender', user)
    const { data } = await q
    setNotes((data as NoteFrais[]) || [])
    setLoading(false)
  }, [gestion, user])

  useEffect(() => { charger() }, [charger])

  function toggleConcerned(nom: string) {
    setConcerned((p) => p.includes(nom) ? p.filter((n) => n !== nom) : [...p, nom])
  }
  function ajouterCustom() {
    const n = customNom.trim()
    if (n && !concerned.includes(n)) setConcerned((p) => [...p, n])
    setCustomNom('')
  }
  async function onPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    const urls = await Promise.all(files.map(fileToDataUrl))
    setQueue((q) => [...q, ...urls])
  }

  async function envoyer() {
    setErreur('')
    if (concerned.length === 0) { setErreur('Sélectionnez au moins une personne concernée.'); return }
    if (pages.length === 0) { setErreur('Ajoutez au moins une photo du justificatif.'); return }
    if (!lisible) { setErreur('Confirmez que le montant et la TVA sont lisibles.'); return }
    setEnvoi(true)
    try {
      const blob = await pagesToPdf(pages)
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`
      const { error: upErr } = await supabase.storage.from('notes-frais').upload(path, blob, { contentType: 'application/pdf' })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('notes-frais').getPublicUrl(path)
      const { error: insErr } = await supabase.from('notes_frais').insert({
        sender: user, concerned,
        montant: montant ? parseFloat(montant.replace(',', '.')) : null,
        objet: objet || null, pdf_path: path, pdf_url: pub.publicUrl, status: 'en_attente',
      })
      if (insErr) throw insErr
      setPages([]); setMontant(''); setObjet(''); setConcerned(user && TECHNICIENS.includes(user) ? [user] : []); setCustomNom(''); setLisible(false); setOuvert(false)
      charger()
    } catch (e: any) {
      console.error(e); setErreur("Échec de l'envoi : " + (e?.message || 'erreur'))
    }
    setEnvoi(false)
  }

  async function supprimer(n: NoteFrais) {
    if (!confirm('Supprimer cette note de frais ?')) return
    await supabase.storage.from('notes-frais').remove([n.pdf_path])
    await supabase.from('notes_frais').delete().eq('id', n.id)
    charger()
  }
  async function setStatut(n: NoteFrais, status: 'en_attente' | 'classee') {
    await supabase.from('notes_frais').update({
      status, reviewed_by: status === 'classee' ? user : null, reviewed_at: status === 'classee' ? new Date().toISOString() : null,
    }).eq('id', n.id)
    charger()
  }
  // Suppression autorisée : Gestion toujours ; expéditeur seulement si encore "en attente"
  function peutSupprimer(n: NoteFrais) { return gestion || (n.sender === user && n.status === 'en_attente') }

  const liste = notes.filter((n) => filtre === 'toutes' || n.status === filtre)

  return (
    <div className="space-y-5">
      {/* Modal de recadrage (une photo à la fois) */}
      {queue.length > 0 && (
        <CropScanModal
          src={queue[0]}
          onCancel={() => setQueue((q) => q.slice(1))}
          onDone={(processed) => { setPages((p) => [...p, processed]); setQueue((q) => q.slice(1)) }}
        />
      )}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Receipt className="w-6 h-6" style={{ color: 'var(--navy)' }} /> Notes de frais
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--gray)' }}>
            {gestion ? 'Toutes les notes — à classer ou laisser en attente.' : 'Envoyez vos notes et suivez leur validation.'}
          </p>
        </div>
        {!ouvert && (
          <button onClick={() => setOuvert(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-white" style={{ background: 'var(--red)' }}>
            <Plus className="w-4 h-4" /> Envoyer une note de frais
          </button>
        )}
      </div>

      {ouvert && (
        <div className="bg-white rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold" style={{ color: 'var(--navy)' }}>Nouvelle note de frais</h2>
            <button onClick={() => { setOuvert(false); setPages([]); setQueue([]); setLisible(false); setCustomNom(''); setErreur('') }}><X className="w-5 h-5" style={{ color: 'var(--gray)' }} /></button>
          </div>

          <div>
            <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Personnes concernées</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {TECHNICIENS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg border cursor-pointer"
                  style={{ borderColor: concerned.includes(c) ? 'var(--red)' : 'var(--border)', background: concerned.includes(c) ? '#fee2e2' : 'white' }}>
                  <input type="checkbox" checked={concerned.includes(c)} onChange={() => toggleConcerned(c)} /> {c}
                </label>
              ))}
            </div>

            {/* Personnes ajoutées hors liste */}
            {concerned.filter((c) => !TECHNICIENS.includes(c)).length > 0 && (
              <div className="flex gap-2 flex-wrap mt-2">
                {concerned.filter((c) => !TECHNICIENS.includes(c)).map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 text-sm px-2 py-1 rounded-full" style={{ background: '#fee2e2', color: 'var(--red)' }}>
                    {c}
                    <button type="button" onClick={() => toggleConcerned(c)}><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}

            {/* Ajouter une personne hors liste */}
            <div className="flex gap-2 mt-2">
              <input
                value={customNom}
                onChange={(e) => setCustomNom(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ajouterCustom() } }}
                placeholder="Ajouter une personne hors liste…"
                className="flex-1 px-3 py-2 border rounded-lg text-sm" style={{ borderColor: 'var(--border)' }}
              />
              <button type="button" onClick={ajouterCustom} className="px-3 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>
                Ajouter
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Montant € (optionnel)</label>
              <input value={montant} onChange={(e) => setMontant(e.target.value)} inputMode="decimal" placeholder="ex: 23,50" className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" style={{ borderColor: 'var(--border)' }} />
            </div>
            <div>
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Objet (optionnel)</label>
              <input value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="ex: Resto chantier Dupont" className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" style={{ borderColor: 'var(--border)' }} />
            </div>
          </div>

          <div>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple onChange={onPhotos} className="hidden" />
            <button onClick={() => inputRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white" style={{ background: 'var(--navy)' }}>
              <Camera className="w-4 h-4" /> Prendre une photo du justificatif
            </button>
            {pages.length > 0 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {pages.map((p, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="" className="w-20 h-20 object-cover rounded-lg border" style={{ borderColor: 'var(--border)' }} />
                    <button onClick={() => setPages((arr) => arr.filter((_, j) => j !== i))} className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-white flex items-center justify-center" style={{ background: 'var(--danger)' }}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs mt-2" style={{ color: 'var(--gray)' }}>{pages.length} page(s) — chaque photo est recadrée puis améliorée (scan).</p>
          </div>

          <label className="flex items-start gap-2 text-sm" style={{ color: 'var(--text)' }}>
            <input type="checkbox" checked={lisible} onChange={(e) => setLisible(e.target.checked)} className="mt-0.5" />
            Je confirme que le <strong>montant</strong> et la <strong>TVA</strong> sont bien lisibles sur la photo.
          </label>

          {erreur && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erreur}</p>}

          <button onClick={envoyer} disabled={envoi} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-white disabled:opacity-50" style={{ background: 'var(--red)' }}>
            <Send className="w-4 h-4" /> {envoi ? 'Envoi…' : 'Envoyer la note de frais'}
          </button>
        </div>
      )}

      {gestion && (
        <div className="flex gap-2 flex-wrap">
          {([['toutes', 'Toutes'], ['en_attente', 'En attente'], ['classee', 'Classées']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFiltre(k as any)} className="px-3 py-1.5 rounded-full text-sm font-medium" style={{ background: filtre === k ? 'var(--navy)' : 'white', color: filtre === k ? 'white' : 'var(--gray)', border: '1px solid var(--border)' }}>{l}</button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-center py-8" style={{ color: 'var(--gray)' }}>Chargement…</p>
      ) : liste.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center border" style={{ borderColor: 'var(--border)' }}>
          <p style={{ color: 'var(--gray)' }}>Aucune note de frais{filtre !== 'toutes' ? ' dans ce filtre' : ''}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {liste.map((n) => (
            <div key={n.id} className="bg-white rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold" style={{ color: 'var(--navy)' }}>{n.objet || 'Note de frais'}</span>
                    {n.montant != null && <span className="font-bold" style={{ color: 'var(--red)' }}>{n.montant.toFixed(2)} €</span>}
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={n.status === 'classee' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>
                      {n.status === 'classee' ? 'Classée' : 'En attente'}
                    </span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--gray)' }}>Envoyée par {n.sender} · {fmtDate(n.created_at)}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--gray)' }}>Concerne : {n.concerned.join(', ')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <a href={n.pdf_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>
                    <FileText className="w-4 h-4" /> PDF
                  </a>
                  {gestion && (n.status === 'en_attente' ? (
                    <button onClick={() => setStatut(n, 'classee')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--success)' }}>
                      <Check className="w-4 h-4" /> Classer
                    </button>
                  ) : (
                    <button onClick={() => setStatut(n, 'en_attente')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--gray)' }}>
                      <Clock className="w-4 h-4" /> En attente
                    </button>
                  ))}
                  {peutSupprimer(n) && (
                    <button onClick={() => supprimer(n)} className="p-1.5 rounded hover:bg-red-50" style={{ color: 'var(--danger)' }} title="Supprimer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
