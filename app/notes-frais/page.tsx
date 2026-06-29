'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { NoteFrais } from '@/lib/types'
import { useAuth } from '@/components/AuthProvider'
import { COMPTES, COMPTE_GESTION } from '@/lib/auth'
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
  return new Promise((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = rej
    i.src = src
  })
}

// Transforme une ou plusieurs photos en un PDF (1 page par photo)
async function photosToPdf(files: File[]): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const PW = 210, PH = 297, M = 8
  for (let i = 0; i < files.length; i++) {
    const dataUrl = await fileToDataUrl(files[i])
    const img = await loadImg(dataUrl)
    if (i > 0) doc.addPage()
    const maxW = PW - M * 2, maxH = PH - M * 2
    let w = maxW, h = (w * img.height) / img.width
    if (h > maxH) { h = maxH; w = (h * img.width) / img.height }
    const fmt = dataUrl.includes('image/png') ? 'PNG' : 'JPEG'
    doc.addImage(dataUrl, fmt, (PW - w) / 2, (PH - h) / 2, w, h)
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

  // Formulaire d'envoi
  const [ouvert, setOuvert] = useState(false)
  const [concerned, setConcerned] = useState<string[]>(user ? [user] : [])
  const [montant, setMontant] = useState('')
  const [objet, setObjet] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const charger = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('notes_frais').select('*').order('created_at', { ascending: false })
    if (!gestion && user) q = q.eq('sender', user) // chacun voit les siennes ; Gestion voit tout
    const { data } = await q
    setNotes((data as NoteFrais[]) || [])
    setLoading(false)
  }, [gestion, user])

  useEffect(() => { charger() }, [charger])

  function toggleConcerned(nom: string) {
    setConcerned((p) => p.includes(nom) ? p.filter((n) => n !== nom) : [...p, nom])
  }
  function onPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const f = Array.from(e.target.files || [])
    if (f.length) setPhotos((p) => [...p, ...f])
    e.target.value = ''
  }

  async function envoyer() {
    setErreur('')
    if (concerned.length === 0) { setErreur('Sélectionnez au moins une personne concernée.'); return }
    if (photos.length === 0) { setErreur('Prenez au moins une photo du justificatif.'); return }
    setEnvoi(true)
    try {
      const blob = await photosToPdf(photos)
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`
      const { error: upErr } = await supabase.storage.from('notes-frais').upload(path, blob, { contentType: 'application/pdf' })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('notes-frais').getPublicUrl(path)
      const { error: insErr } = await supabase.from('notes_frais').insert({
        sender: user,
        concerned,
        montant: montant ? parseFloat(montant.replace(',', '.')) : null,
        objet: objet || null,
        pdf_path: path,
        pdf_url: pub.publicUrl,
        status: 'en_attente',
      })
      if (insErr) throw insErr
      // reset
      setPhotos([]); setMontant(''); setObjet(''); setConcerned(user ? [user] : []); setOuvert(false)
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
      status,
      reviewed_by: status === 'classee' ? user : null,
      reviewed_at: status === 'classee' ? new Date().toISOString() : null,
    }).eq('id', n.id)
    charger()
  }

  const liste = notes.filter((n) => filtre === 'toutes' || n.status === filtre)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Receipt className="w-6 h-6" style={{ color: 'var(--navy)' }} />
            Notes de frais
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--gray)' }}>
            {gestion ? 'Toutes les notes de frais — à classer ou laisser en attente.' : 'Envoyez vos notes et suivez leur validation.'}
          </p>
        </div>
        {!ouvert && (
          <button onClick={() => setOuvert(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-white" style={{ background: 'var(--red)' }}>
            <Plus className="w-4 h-4" /> Envoyer une note de frais
          </button>
        )}
      </div>

      {/* Formulaire d'envoi */}
      {ouvert && (
        <div className="bg-white rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold" style={{ color: 'var(--navy)' }}>Nouvelle note de frais</h2>
            <button onClick={() => { setOuvert(false); setPhotos([]); setErreur('') }}><X className="w-5 h-5" style={{ color: 'var(--gray)' }} /></button>
          </div>

          {/* Personnes concernées */}
          <div>
            <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Personnes concernées</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {COMPTES.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg border cursor-pointer"
                  style={{ borderColor: concerned.includes(c) ? 'var(--red)' : 'var(--border)', background: concerned.includes(c) ? '#fee2e2' : 'white' }}>
                  <input type="checkbox" checked={concerned.includes(c)} onChange={() => toggleConcerned(c)} />
                  {c}
                </label>
              ))}
            </div>
          </div>

          {/* Montant + objet (optionnels) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Montant € (optionnel)</label>
              <input value={montant} onChange={(e) => setMontant(e.target.value)} inputMode="decimal" placeholder="ex: 23,50"
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" style={{ borderColor: 'var(--border)' }} />
            </div>
            <div>
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>Objet (optionnel)</label>
              <input value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="ex: Resto chantier Dupont"
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" style={{ borderColor: 'var(--border)' }} />
            </div>
          </div>

          {/* Photos -> PDF */}
          <div>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple onChange={onPhotos} className="hidden" />
            <button onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white" style={{ background: 'var(--navy)' }}>
              <Camera className="w-4 h-4" /> Prendre une photo du justificatif
            </button>
            {photos.length > 0 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {photos.map((f, i) => (
                  <div key={i} className="relative">
                    <img src={URL.createObjectURL(f)} alt="" className="w-20 h-20 object-cover rounded-lg border" style={{ borderColor: 'var(--border)' }} />
                    <button onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-white flex items-center justify-center" style={{ background: 'var(--danger)' }}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs mt-2" style={{ color: 'var(--gray)' }}>{photos.length} photo(s) → seront regroupées en 1 PDF.</p>
          </div>

          {erreur && <p className="text-sm" style={{ color: 'var(--danger)' }}>{erreur}</p>}

          <button onClick={envoyer} disabled={envoi}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-white disabled:opacity-50" style={{ background: 'var(--red)' }}>
            <Send className="w-4 h-4" /> {envoi ? 'Envoi…' : 'Envoyer la note de frais'}
          </button>
        </div>
      )}

      {/* Filtres (Gestion) */}
      {gestion && (
        <div className="flex gap-2 flex-wrap">
          {([['toutes', 'Toutes'], ['en_attente', 'En attente'], ['classee', 'Classées']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFiltre(k as any)}
              className="px-3 py-1.5 rounded-full text-sm font-medium" style={{ background: filtre === k ? 'var(--navy)' : 'white', color: filtre === k ? 'white' : 'var(--gray)', border: '1px solid var(--border)' }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {/* Liste */}
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
                  <div className="flex items-center gap-2">
                    <span className="font-semibold" style={{ color: 'var(--navy)' }}>{n.objet || 'Note de frais'}</span>
                    {n.montant != null && <span className="font-bold" style={{ color: 'var(--red)' }}>{n.montant.toFixed(2)} €</span>}
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={n.status === 'classee' ? { background: '#dcfce7', color: '#166534' } : { background: '#fef3c7', color: '#92400e' }}>
                      {n.status === 'classee' ? 'Classée' : 'En attente'}
                    </span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--gray)' }}>
                    Envoyée par {n.sender} · {fmtDate(n.created_at)}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--gray)' }}>
                    Concerne : {n.concerned.join(', ')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a href={n.pdf_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>
                    <FileText className="w-4 h-4" /> PDF
                  </a>
                  {gestion && (n.status === 'en_attente' ? (
                    <button onClick={() => setStatut(n, 'classee')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--success)' }}>
                      <Check className="w-4 h-4" /> Classer
                    </button>
                  ) : (
                    <button onClick={() => setStatut(n, 'en_attente')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--gray)' }}>
                      <Clock className="w-4 h-4" /> En attente
                    </button>
                  ))}
                  {(n.sender === user || gestion) && (
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
