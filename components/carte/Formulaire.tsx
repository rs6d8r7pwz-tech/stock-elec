'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Camera, Image as ImageIcon, Keyboard, Loader2, LocateFixed, Map as MapIcon, MapPin, Save, X, AlertTriangle } from 'lucide-react'
import type { CarteClient, CartePhoto, CartePoint, Position, SourcePos } from '@/lib/carte/types'
import { adresseDe, chercherDoublons, fmtCoord, fmtDistance, parseCoords, positionPrecise, type Adresse, type Doublon } from '@/lib/carte/geo'
import { creerPoint, envoyerPhoto, modifierPoint, supprimerPhotos } from '@/lib/carte/store'
import { compresserPhoto } from '@/components/rapport/photos'

const MapView = dynamic(() => import('./MapView'), { ssr: false, loading: () => <div className="h-full grid place-items-center text-sm text-gray-400">Chargement de la carte…</div> })

interface Props {
  user: string
  client: CarteClient
  points: CartePoint[]
  existant?: CartePoint | null
  onChangerClient?: () => void
  onFini: (p: CartePoint) => void
  onAnnuler: () => void
  onVoir: (id: string) => void
}

type PhotoLoc = { kind: 'old'; ph: CartePhoto } | { kind: 'new'; data: string; id: string }

export default function Formulaire({ user, client, points, existant, onChangerClient, onFini, onAnnuler, onVoir }: Props) {
  const [nom, setNom] = useState(existant?.nom || '')
  const [pos, setPos] = useState<Position | null>(existant ? { lat: existant.lat, lng: existant.lng, precision: existant.precision_m } : null)
  const [source, setSource] = useState<SourcePos>(existant?.source || 'gps')
  const [mode, setMode] = useState<'gps' | 'saisie' | 'carte' | null>(existant ? 'carte' : null)
  const [gpsEnCours, setGpsEnCours] = useState(false)
  const [gpsErr, setGpsErr] = useState<string | null>(null)
  const [texteCoord, setTexteCoord] = useState('')
  const [coordErr, setCoordErr] = useState<string | null>(null)
  const [adr, setAdr] = useState<Adresse | null>(existant ? { adresse: existant.adresse || null, commune: existant.commune || null, code_postal: existant.code_postal || null } : null)
  const [adrEnCours, setAdrEnCours] = useState(false)
  const [commentaire, setCommentaire] = useState(existant?.commentaire || '')
  const [photos, setPhotos] = useState<PhotoLoc[]>((existant?.photos || []).map((ph) => ({ kind: 'old', ph })))
  const [doublons, setDoublons] = useState<Doublon[] | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [fitKey, setFitKey] = useState(0)
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)
  const posInitiale = useRef(existant ? `${existant.lat},${existant.lng}` : '')

  // Adresse automatique à chaque changement de position (avec délai)
  useEffect(() => {
    if (!pos) return
    const k = `${pos.lat},${pos.lng}`
    if (k === posInitiale.current && adr) return
    let annule = false
    setAdrEnCours(true)
    const t = setTimeout(async () => {
      const a = await adresseDe(pos.lat, pos.lng)
      if (!annule) { setAdr(a); setAdrEnCours(false) }
    }, 700)
    return () => { annule = true; clearTimeout(t) }
  }, [pos?.lat, pos?.lng]) // eslint-disable-line

  const positionActuelle = async () => {
    setMode('gps'); setGpsErr(null); setGpsEnCours(true)
    try {
      const p = await positionPrecise((cur) => { setPos(cur); setSource('gps') })
      setPos(p); setSource('gps'); setFitKey((k) => k + 1)
    } catch (e: any) {
      setGpsErr(e?.message || 'Position introuvable')
    } finally { setGpsEnCours(false) }
  }

  const validerCoord = () => {
    const p = parseCoords(texteCoord)
    if (!p) { setCoordErr('Format non reconnu. Exemple : 45.856123, 3.547891'); return }
    setCoordErr(null); setPos(p); setSource('saisie'); setFitKey((k) => k + 1)
  }

  const ajouterPhotos = async (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) {
      try {
        const data = await compresserPhoto(f)
        setPhotos((ps) => [...ps, { kind: 'new', data, id: Math.random().toString(36).slice(2) }])
      } catch { setErr('Photo illisible') }
    }
  }

  const verifier = () => {
    setErr(null)
    if (!nom.trim()) { setErr('Indiquez le nom du site.'); return }
    if (!pos) { setErr('Indiquez la position du point.'); return }
    const d = chercherDoublons({ nom: nom.trim(), lat: pos.lat, lng: pos.lng, client_id: client.id }, points, existant?.id)
    if (d.length) { setDoublons(d); return }
    enregistrer()
  }

  const enregistrer = async () => {
    if (!pos) return
    setDoublons(null); setEnvoi(true); setErr(null)
    try {
      const finales: CartePhoto[] = []
      for (const p of photos) finales.push(p.kind === 'old' ? p.ph : await envoyerPhoto(p.data))
      const a = adr || (await adresseDe(pos.lat, pos.lng))
      const data = {
        client_id: client.id,
        nom: nom.trim().replace(/\s+/g, ' '),
        lat: Math.round(pos.lat * 1e7) / 1e7,
        lng: Math.round(pos.lng * 1e7) / 1e7,
        precision_m: source === 'gps' && pos.precision ? Math.round(pos.precision) : null,
        source,
        commentaire: commentaire.trim() || null,
        photos: finales,
        adresse: a.adresse, commune: a.commune, code_postal: a.code_postal,
      }
      const res = existant ? await modifierPoint(existant.id, data, user) : await creerPoint(data, user)
      if (existant) {
        const gardees = new Set(finales.map((f) => f.path))
        await supprimerPhotos((existant.photos || []).map((p) => p.path).filter((p) => !gardees.has(p)))
      }
      onFini(res)
    } catch (e: any) {
      setErr('Enregistrement impossible : ' + (e?.message || 'erreur réseau'))
    } finally { setEnvoi(false) }
  }

  const precisionTxt = pos?.precision != null && source === 'gps' ? `± ${Math.round(pos.precision)} m` : null
  const precisionMauvaise = source === 'gps' && (pos?.precision ?? 0) > 30

  const btn = (actif: boolean) =>
    `flex flex-col items-center justify-center gap-1 rounded-xl border py-3 text-xs font-semibold transition ${actif ? 'text-white' : 'bg-white'}`

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold" style={{ color: 'var(--navy)' }}>{existant ? 'Modifier le point' : 'Nouveau point'}</h1>
        <button onClick={onAnnuler} className="text-sm px-3 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--gray)' }}>Annuler</button>
      </div>

      {/* Client */}
      <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: 'var(--blue-light)' }}>
        <div>
          <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--gray)' }}>Client</div>
          <div className="font-bold" style={{ color: 'var(--navy)' }}>{client.nom}</div>
        </div>
        {onChangerClient && <button onClick={onChangerClient} className="text-sm font-semibold underline" style={{ color: 'var(--navy)' }}>Changer</button>}
      </div>

      {/* Nom */}
      <label className="block">
        <span className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>Nom du site *</span>
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="ex. Réservoir des Garniers"
          className="mt-1 w-full rounded-xl border px-4 py-3 text-base outline-none focus:ring-2" style={{ borderColor: 'var(--border)' }} />
      </label>

      {/* Position */}
      <div>
        <span className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>Position du point *</span>
        <div className="mt-1 grid grid-cols-3 gap-2">
          <button onClick={positionActuelle} className={btn(mode === 'gps')} style={mode === 'gps' ? { background: 'var(--navy)', borderColor: 'var(--navy)' } : { borderColor: 'var(--border)', color: 'var(--navy)' }}>
            {gpsEnCours ? <Loader2 className="w-5 h-5 animate-spin" /> : <LocateFixed className="w-5 h-5" />}
            Position actuelle
          </button>
          <button onClick={() => { setMode('saisie'); setCoordErr(null); if (pos && !texteCoord) setTexteCoord(`${fmtCoord(pos.lat)}, ${fmtCoord(pos.lng)}`) }} className={btn(mode === 'saisie')} style={mode === 'saisie' ? { background: 'var(--navy)', borderColor: 'var(--navy)' } : { borderColor: 'var(--border)', color: 'var(--navy)' }}>
            <Keyboard className="w-5 h-5" /> Saisir les coordonnées
          </button>
          <button onClick={() => setMode('carte')} className={btn(mode === 'carte')} style={mode === 'carte' ? { background: 'var(--navy)', borderColor: 'var(--navy)' } : { borderColor: 'var(--border)', color: 'var(--navy)' }}>
            <MapIcon className="w-5 h-5" /> Placer sur la carte
          </button>
        </div>

        {mode === 'gps' && (gpsEnCours || gpsErr) && (
          <p className={`mt-2 text-sm ${gpsErr ? 'text-red-600' : ''}`} style={gpsErr ? {} : { color: 'var(--gray)' }}>
            {gpsErr || `Recherche du signal GPS… ${precisionTxt ? `(${precisionTxt})` : ''} — restez immobile quelques secondes.`}
          </p>
        )}

        {mode === 'saisie' && (
          <div className="mt-2 space-y-1">
            <div className="flex gap-2">
              <input value={texteCoord} onChange={(e) => setTexteCoord(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && validerCoord()}
                inputMode="text" placeholder="45.856123, 3.547891" className="flex-1 rounded-xl border px-3 py-2.5 font-mono text-sm" style={{ borderColor: 'var(--border)' }} />
              <button onClick={validerCoord} className="rounded-xl px-4 text-sm font-semibold text-white" style={{ background: 'var(--navy)' }}>OK</button>
            </div>
            <p className="text-xs" style={{ color: 'var(--gray)' }}>Latitude, longitude en degrés décimaux (copier-coller depuis Google Maps accepté) ou en degrés/minutes/secondes : 45°51&apos;22&quot;N 3°32&apos;52&quot;E</p>
            {coordErr && <p className="text-sm text-red-600">{coordErr}</p>}
          </div>
        )}

        {mode === 'carte' && !pos && <p className="mt-2 text-sm" style={{ color: 'var(--gray)' }}>Touchez la carte à l&apos;emplacement du site.</p>}

        {(mode === 'carte' || pos) && (
          <div className="mt-3 rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            <MapView className="h-72 w-full"
              points={points.filter((p) => p.id !== existant?.id).map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, nom: p.nom, couleur: '#94a3b8' }))}
              pick={{ pos, onChange: (p) => { setPos(p); setSource('carte'); if (mode !== 'carte') setMode('carte') } }}
              fitKey={pos ? fitKey : undefined} />
          </div>
        )}

        {pos && (
          <div className="mt-2 rounded-xl border bg-white px-4 py-3 text-sm space-y-1" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 font-mono" style={{ color: 'var(--navy)' }}>
              <MapPin className="w-4 h-4 shrink-0" /> {fmtCoord(pos.lat)}, {fmtCoord(pos.lng)}
              {precisionTxt && <span className={`ml-auto font-sans text-xs px-2 py-0.5 rounded-full ${precisionMauvaise ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>{precisionTxt}</span>}
            </div>
            <div style={{ color: 'var(--gray)' }}>
              {adrEnCours ? 'Recherche de l’adresse…' : adr && (adr.adresse || adr.commune)
                ? [adr.adresse, [adr.code_postal, adr.commune].filter(Boolean).join(' ')].filter(Boolean).join(', ')
                : 'Adresse non trouvée (sera complétée plus tard si possible)'}
            </div>
            {precisionMauvaise && <p className="text-xs text-amber-700">Précision faible : attendez un peu ou ajustez le repère en le faisant glisser sur la carte.</p>}
            <p className="text-xs" style={{ color: 'var(--gray)' }}>Astuce : faites glisser le repère pour ajuster.</p>
          </div>
        )}
      </div>

      {/* Commentaire */}
      <label className="block">
        <span className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>Commentaire <span className="font-normal" style={{ color: 'var(--gray)' }}>(optionnel)</span></span>
        <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} rows={3}
          placeholder="Accès, code portail, emplacement de la clé…" className="mt-1 w-full rounded-xl border px-4 py-3 text-base" style={{ borderColor: 'var(--border)' }} />
      </label>

      {/* Photos */}
      <div>
        <span className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>Photo <span className="font-normal" style={{ color: 'var(--gray)' }}>(optionnel)</span></span>
        <div className="mt-1 flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={p.kind === 'old' ? p.ph.path : p.id} className="relative w-24 h-24 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.kind === 'old' ? p.ph.url : p.data} alt="" className="w-full h-full object-cover" />
              <button onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5"><X className="w-4 h-4" /></button>
            </div>
          ))}
          <button onClick={() => camRef.current?.click()} className="w-24 h-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-xs gap-1" style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>
            <Camera className="w-6 h-6" /> Prendre
          </button>
          <button onClick={() => galRef.current?.click()} className="w-24 h-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-xs gap-1" style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>
            <ImageIcon className="w-6 h-6" /> Galerie
          </button>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { ajouterPhotos(e.target.files); e.target.value = '' }} />
          <input ref={galRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { ajouterPhotos(e.target.files); e.target.value = '' }} />
        </div>
      </div>

      {err && <p className="text-sm text-red-600 font-medium">{err}</p>}

      {/* Barre d'action */}
      <div className="fixed bottom-0 inset-x-0 z-[1000] bg-white/95 backdrop-blur border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-3xl mx-auto">
          <button onClick={verifier} disabled={envoi}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-base font-bold text-white disabled:opacity-60"
            style={{ background: 'var(--red)' }}>
            {envoi ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {envoi ? 'Enregistrement…' : existant ? 'Enregistrer les modifications' : 'Créer le point'}
          </button>
        </div>
      </div>

      {/* Alerte doublons */}
      {doublons && (
        <div className="fixed inset-0 z-[1100] bg-black/50 flex items-end sm:items-center justify-center p-3" onClick={() => setDoublons(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 grid place-items-center shrink-0"><AlertTriangle className="w-5 h-5" /></div>
              <div>
                <h2 className="font-bold text-lg" style={{ color: 'var(--navy)' }}>Ce point existe peut-être déjà</h2>
                <p className="text-sm" style={{ color: 'var(--gray)' }}>
                  {doublons.length === 1 ? 'Un point ressemblant est déjà enregistré :' : `${doublons.length} points ressemblants sont déjà enregistrés :`}
                </p>
              </div>
            </div>
            <ul className="space-y-2">
              {doublons.slice(0, 6).map((d) => (
                <li key={d.point.id} className="rounded-xl border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
                  <div className="font-semibold" style={{ color: 'var(--navy)' }}>« {d.point.nom} »</div>
                  <div className="text-xs" style={{ color: 'var(--gray)' }}>
                    {d.raison} · à {fmtDistance(d.distance)} de votre point{d.point.commune ? ` · ${d.point.commune}` : ''}{d.point.created_by ? ` · créé par ${d.point.created_by}` : ''}
                  </div>
                  <button onClick={() => onVoir(d.point.id)} className="text-xs font-semibold underline mt-1" style={{ color: 'var(--navy)' }}>Voir ce point</button>
                </li>
              ))}
            </ul>
            <p className="text-sm font-medium" style={{ color: 'var(--navy)' }}>Êtes-vous sûr de vouloir {existant ? 'enregistrer' : 'créer'} « {nom.trim()} » quand même ?</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setDoublons(null)} className="rounded-xl border py-3 font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>Non, annuler</button>
              <button onClick={enregistrer} className="rounded-xl py-3 font-semibold text-white" style={{ background: 'var(--red)' }}>Oui, {existant ? 'enregistrer' : 'créer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
