'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  ArrowLeft, ChevronRight, List, Loader2, LocateFixed, Map as MapIcon, MapPin, Pencil, Plus, RefreshCw,
  Search, Trash2, User, X, WifiOff, Building2,
} from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { isGestion } from '@/lib/auth'
import type { CarteClient, CartePoint, Position } from '@/lib/carte/types'
import { chargerTout, creerClient, supprimerPoint } from '@/lib/carte/store'
import { couleurClient, distanceM, fmtCoord, fmtDistance, normaliser, positionPrecise } from '@/lib/carte/geo'
import Formulaire from '@/components/carte/Formulaire'
import BoutonsGps from '@/components/carte/BoutonsGps'

const MapView = dynamic(() => import('@/components/carte/MapView'), {
  ssr: false,
  loading: () => <div className="h-full grid place-items-center text-sm text-gray-400">Chargement de la carte…</div>,
})

type Vue =
  | { n: 'accueil' }
  | { n: 'choixClient' }
  | { n: 'form'; clientId: string; pointId?: string }
  | { n: 'fiche'; id: string }

const RAYONS = [
  { v: 1000, l: '1 km' }, { v: 5000, l: '5 km' }, { v: 10000, l: '10 km' }, { v: 25000, l: '25 km' }, { v: 50000, l: '50 km' }, { v: 0, l: 'Tout' },
]

function lsGet(k: string, d: string) { try { return localStorage.getItem(k) ?? d } catch { return d } }
function lsSet(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* */ } }

export default function PageCarte() {
  const { user } = useAuth()
  const [vue, setVue] = useState<Vue>({ n: 'accueil' })
  const [clients, setClients] = useState<CarteClient[]>([])
  const [points, setPoints] = useState<CartePoint[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [horsLigne, setHorsLigne] = useState(false)

  const [q, setQ] = useState('')
  const [filtreClient, setFiltreClient] = useState<string>('tous')
  const [onglet, setOnglet] = useState<'carte' | 'liste'>('carte')
  const [autour, setAutour] = useState(false)
  const [rayon, setRayon] = useState(10000)
  const [userPos, setUserPos] = useState<Position | null>(null)
  const [locEnCours, setLocEnCours] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ pos: Position; zoom?: number; key: number } | null>(null)
  const [fitKey, setFitKey] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmSuppr, setConfirmSuppr] = useState<CartePoint | null>(null)
  const [nouveauClient, setNouveauClient] = useState('')
  const [ajoutClientErr, setAjoutClientErr] = useState<string | null>(null)

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000) }

  // Préférences d'affichage mémorisées
  useEffect(() => {
    setOnglet(lsGet('carte_onglet', 'carte') === 'liste' ? 'liste' : 'carte')
    setRayon(parseInt(lsGet('carte_rayon', '10000'), 10) || 0)
  }, [])

  // Navigation avec le bouton « retour » du téléphone
  const go = useCallback((v: Vue) => {
    setVue(v)
    window.scrollTo({ top: 0 })
    try { window.history.pushState({ carte: v }, '') } catch { /* */ }
  }, [])
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setVue(e.state?.carte || { n: 'accueil' })
    window.addEventListener('popstate', onPop)
    try { window.history.replaceState({ carte: { n: 'accueil' } }, '') } catch { /* */ }
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  /** Remplace l'étape courante (évite que « retour » ramène au choix du client après enregistrement) */
  const remplacer = useCallback((v: Vue) => {
    setVue(v)
    window.scrollTo({ top: 0 })
    try { window.history.replaceState({ carte: v }, '') } catch { /* */ }
  }, [])
  const retour = () => { try { window.history.back() } catch { setVue({ n: 'accueil' }) } }

  const charger = useCallback(async (silencieux = false) => {
    if (!silencieux) setChargement(true)
    try {
      const d = await chargerTout()
      setClients(d.clients); setPoints(d.points); setHorsLigne(!!d.horsLigne); setErreur(null)
    } catch (e: any) {
      setErreur(e?.message || 'Chargement impossible')
    } finally { setChargement(false) }
  }, [])

  useEffect(() => {
    charger().then(() => setFitKey((k) => k + 1))
    const onFocus = () => { if (document.visibilityState === 'visible') charger(true) }
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [charger])

  const ordreClients = useMemo(() => clients.map((c) => c.id), [clients])
  const clientDe = useCallback((id: string) => clients.find((c) => c.id === id), [clients])
  const nbParClient = useMemo(() => {
    const r: Record<string, number> = {}
    points.forEach((p) => { r[p.client_id] = (r[p.client_id] || 0) + 1 })
    return r
  }, [points])

  // ── Localisation ──────────────────────────────────────────────────────────
  const localiser = useCallback(async (recentrer = true) => {
    setLocEnCours(true)
    try {
      const p = await positionPrecise((cur) => setUserPos(cur), 25, 10000)
      setUserPos(p)
      if (recentrer) setFocus({ pos: p, zoom: 14, key: Date.now() })
      return p
    } catch (e: any) {
      flash(e?.message || 'Position introuvable')
      return null
    } finally { setLocEnCours(false) }
  }, [])

  const basculerAutour = async () => {
    if (autour) { setAutour(false); return }
    const p = userPos || (await localiser(false))
    if (p) { setAutour(true); setFitKey((k) => k + 1) }
  }

  // ── Filtrage / tri ────────────────────────────────────────────────────────
  const filtres = useMemo(() => {
    const n = normaliser(q)
    const mots = n ? n.split(' ') : []
    let res = points.map((p) => ({ p, d: userPos ? distanceM(userPos, p) : null as number | null }))
    if (filtreClient !== 'tous') res = res.filter((x) => x.p.client_id === filtreClient)
    if (mots.length) {
      res = res.filter(({ p }) => {
        const txt = normaliser([p.nom, p.commune, p.adresse, p.code_postal, clientDe(p.client_id)?.nom, p.commentaire].filter(Boolean).join(' '))
        return mots.every((m) => txt.includes(m))
      })
    }
    if (autour && userPos && rayon) res = res.filter((x) => (x.d ?? 0) <= rayon)
    if (autour && userPos) res.sort((a, b) => (a.d ?? 0) - (b.d ?? 0))
    else res.sort((a, b) => a.p.nom.localeCompare(b.p.nom, 'fr', { numeric: true }))
    return res
  }, [points, q, filtreClient, autour, userPos, rayon, clientDe])

  const pointsCarte = useMemo(() => filtres.map(({ p }) => ({
    id: p.id, lat: p.lat, lng: p.lng, nom: p.nom,
    couleur: couleurClient(p.client_id, ordreClients),
    sousTitre: [clientDe(p.client_id)?.nom, p.commune].filter(Boolean).join(' · '),
  })), [filtres, ordreClients, clientDe])

  // Vue d'ensemble (par défaut) : une étiquette par client, pas de points.
  // On affiche les points dès qu'on choisit un client, qu'on cherche ou qu'on active « autour de moi ».
  const vueEnsemble = filtreClient === 'tous' && !normaliser(q) && !autour
  // Point de départ commun : le site nommé « Bureau »
  const bureau = useMemo(() => points.find((p) => normaliser(p.nom) === 'bureau') || null, [points])
  const depuisBureau = (p: CartePoint) => (bureau && p.id !== bureau.id ? distanceM(bureau, p) : null)

  const groupes = useMemo(() => clients
    .map((c) => {
      const pts = points.filter((p) => p.client_id === c.id && p.id !== bureau?.id)
      if (!pts.length) return null
      return {
        id: c.id, nom: c.nom, n: pts.length, couleur: couleurClient(c.id, ordreClients),
        lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length,
        lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length,
      }
    })
    .filter(Boolean) as { id: string; nom: string; n: number; couleur: string; lat: number; lng: number }[],
  [clients, points, ordreClients, bureau])
  const choisirClient = (id: string) => { setFiltreClient(id); setSelId(null) }

  // Recadre la carte quand le filtre change
  useEffect(() => { setFitKey((k) => k + 1) }, [filtreClient, autour, rayon]) // eslint-disable-line
  useEffect(() => { const t = setTimeout(() => setFitKey((k) => k + 1), 500); return () => clearTimeout(t) }, [q])

  const peutSupprimer = (p: CartePoint) => !!user && (isGestion(user) || p.created_by === user)

  const supprimer = async (p: CartePoint) => {
    try {
      await supprimerPoint(p)
      setPoints((ps) => ps.filter((x) => x.id !== p.id))
      setConfirmSuppr(null); setSelId(null)
      flash('Point supprimé')
      go({ n: 'accueil' })
    } catch (e: any) { flash('Suppression impossible : ' + (e?.message || 'erreur')) }
  }

  const ajouterClient = async () => {
    if (!nouveauClient.trim() || !user) return
    setAjoutClientErr(null)
    try {
      const c = await creerClient(nouveauClient, user)
      setClients((cs) => [...cs, c].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')))
      setNouveauClient('')
      remplacer({ n: 'form', clientId: c.id })
    } catch (e: any) { setAjoutClientErr(e?.message || 'Erreur') }
  }

  if (!user) return null

  // ══ Erreur de chargement (ex. tables pas encore créées) ═══════════════════
  if (erreur && !points.length && !clients.length) {
    return (
      <div className="max-w-md mx-auto mt-10 text-center space-y-3">
        <WifiOff className="w-10 h-10 mx-auto" style={{ color: 'var(--gray)' }} />
        <p className="font-semibold" style={{ color: 'var(--navy)' }}>Impossible de charger la carte</p>
        <p className="text-sm" style={{ color: 'var(--gray)' }}>{erreur}</p>
        <button onClick={() => charger()} className="px-4 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: 'var(--navy)' }}>Réessayer</button>
      </div>
    )
  }

  // ══ Choix du client (nouveau point) ═══════════════════════════════════════
  if (vue.n === 'choixClient') {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <button onClick={retour} className="flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--gray)' }}><ArrowLeft className="w-4 h-4" /> Retour</button>
        <h1 className="text-xl font-bold" style={{ color: 'var(--navy)' }}>Nouveau point — choisissez le client</h1>
        <div className="grid gap-2">
          {clients.map((c) => (
            <button key={c.id} onClick={() => remplacer({ n: 'form', clientId: c.id })}
              className="flex items-center gap-3 bg-white rounded-xl border px-4 py-4 text-left hover:shadow-md transition active:scale-[.99]"
              style={{ borderColor: 'var(--border)' }}>
              <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: couleurClient(c.id, ordreClients) }} />
              <span className="flex-1 font-semibold" style={{ color: 'var(--navy)' }}>{c.nom}</span>
              <span className="text-xs" style={{ color: 'var(--gray)' }}>{nbParClient[c.id] || 0} point{(nbParClient[c.id] || 0) > 1 ? 's' : ''}</span>
              <ChevronRight className="w-5 h-5" style={{ color: 'var(--gray)' }} />
            </button>
          ))}
        </div>
        <div className="bg-white rounded-xl border p-4 space-y-2" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--navy)' }}><Building2 className="w-4 h-4" /> Nouveau client</div>
          <div className="flex gap-2">
            <input value={nouveauClient} onChange={(e) => setNouveauClient(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ajouterClient()}
              placeholder="Nom du client (ex. SIAEP Thiers)" className="flex-1 rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--border)' }} />
            <button onClick={ajouterClient} disabled={!nouveauClient.trim()} className="rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--navy)' }}>Ajouter</button>
          </div>
          {ajoutClientErr && <p className="text-sm text-red-600">{ajoutClientErr}</p>}
        </div>
      </div>
    )
  }

  // ══ Formulaire (création / modification) ══════════════════════════════════
  if (vue.n === 'form') {
    const c = clientDe(vue.clientId)
    const existant = vue.pointId ? points.find((p) => p.id === vue.pointId) : null
    if (!c) return null
    return (
      <div className="max-w-3xl mx-auto">
        <Formulaire
          key={vue.pointId || 'nouveau-' + c.id}
          user={user}
          client={c}
          points={points}
          existant={existant}
          clients={clients}
          onChangerClient={existant ? undefined : () => remplacer({ n: 'choixClient' })}
          onAnnuler={retour}
          onVoir={(id) => go({ n: 'fiche', id })}
          onFini={(p) => {
            setPoints((ps) => [...ps.filter((x) => x.id !== p.id), p])
            flash(existant ? 'Point modifié' : 'Point créé ✔')
            setSelId(p.id)
            if (existant) retour() // revient à la fiche
            else remplacer({ n: 'fiche', id: p.id })
          }}
        />
      </div>
    )
  }

  // ══ Fiche d'un point ══════════════════════════════════════════════════════
  if (vue.n === 'fiche') {
    const p = points.find((x) => x.id === vue.id)
    if (!p) {
      return (
        <div className="text-center mt-10 space-y-3">
          <p style={{ color: 'var(--gray)' }}>Ce point n&apos;existe plus.</p>
          <button onClick={() => go({ n: 'accueil' })} className="px-4 py-2 rounded-lg text-white text-sm" style={{ background: 'var(--navy)' }}>Retour à la carte</button>
        </div>
      )
    }
    const c = clientDe(p.client_id)
    const d = userPos ? distanceM(userPos, p) : null
    return (
      <div className="max-w-3xl mx-auto space-y-4 pb-6">
        <button onClick={retour} className="flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--gray)' }}><ArrowLeft className="w-4 h-4" /> Retour</button>
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full text-white" style={{ background: couleurClient(p.client_id, ordreClients) }}>{c?.nom || 'Client inconnu'}</span>
          <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--navy)' }}>{p.nom}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--gray)' }}>
            {[p.adresse, [p.code_postal, p.commune].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'Adresse inconnue'}
            {d != null && <> · <b>{fmtDistance(d)}</b> de vous</>}
            {depuisBureau(p) != null && <> · {fmtDistance(depuisBureau(p)!)} du bureau</>}
          </p>
        </div>

        <BoutonsGps lat={p.lat} lng={p.lng} nom={p.nom} />

        <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          <MapView className="h-64 w-full" points={[{ id: p.id, lat: p.lat, lng: p.lng, nom: p.nom, couleur: couleurClient(p.client_id, ordreClients) }]}
            selectedId={p.id} userPos={userPos} fitKey={p.id} />
        </div>

        <div className="bg-white rounded-xl border divide-y text-sm" style={{ borderColor: 'var(--border)' }}>
          <Ligne label="Coordonnées"><span className="font-mono">{fmtCoord(p.lat)}, {fmtCoord(p.lng)}</span></Ligne>
          <Ligne label="Origine">{p.source === 'gps' ? `GPS sur site${p.precision_m ? ` (± ${Math.round(p.precision_m)} m)` : ''}` : p.source === 'saisie' ? 'Coordonnées saisies' : 'Placé sur la carte'}</Ligne>
          {p.commentaire && <Ligne label="Commentaire"><span className="whitespace-pre-wrap">{p.commentaire}</span></Ligne>}
          <Ligne label="Créé">{p.created_by || '—'}{p.created_at ? ` · ${new Date(p.created_at).toLocaleDateString('fr-FR')}` : ''}</Ligne>
          {p.updated_by && p.updated_at && p.updated_at !== p.created_at && (
            <Ligne label="Modifié">{p.updated_by} · {new Date(p.updated_at).toLocaleDateString('fr-FR')}</Ligne>
          )}
        </div>

        {p.photos?.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {p.photos.map((ph) => (
              <a key={ph.path} href={ph.url} target="_blank" rel="noopener" className="block aspect-square rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph.url} alt={p.nom} className="w-full h-full object-cover" loading="lazy" />
              </a>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => go({ n: 'form', clientId: p.client_id, pointId: p.id })}
            className="flex items-center justify-center gap-2 rounded-xl border py-3 font-semibold bg-white" style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>
            <Pencil className="w-4 h-4" /> Modifier
          </button>
          {peutSupprimer(p) ? (
            <button onClick={() => setConfirmSuppr(p)} className="flex items-center justify-center gap-2 rounded-xl border py-3 font-semibold bg-white text-red-600" style={{ borderColor: '#fecaca' }}>
              <Trash2 className="w-4 h-4" /> Supprimer
            </button>
          ) : <p className="text-xs self-center" style={{ color: 'var(--gray)' }}>Suppression : créateur du point ou Gestion.</p>}
        </div>

        {confirmSuppr && (
          <div className="fixed inset-0 z-[1100] bg-black/50 flex items-end sm:items-center justify-center p-3" onClick={() => setConfirmSuppr(null)}>
            <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h2 className="font-bold text-lg" style={{ color: 'var(--navy)' }}>Supprimer « {confirmSuppr.nom} » ?</h2>
              <p className="text-sm" style={{ color: 'var(--gray)' }}>Le point et ses photos seront définitivement supprimés pour tout le monde.</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setConfirmSuppr(null)} className="rounded-xl border py-3 font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>Annuler</button>
                <button onClick={() => supprimer(confirmSuppr)} className="rounded-xl py-3 font-semibold text-white bg-red-600">Supprimer</button>
              </div>
            </div>
          </div>
        )}
        {toast && <Toast m={toast} />}
      </div>
    )
  }

  // ══ Accueil : carte / liste ═══════════════════════════════════════════════
  const sel = selId ? points.find((p) => p.id === selId) : null
  const selD = sel && userPos ? distanceM(userPos, sel) : null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>🗺️ Carte ELECTReau</h1>
          <p className="text-sm" style={{ color: 'var(--gray)' }}>
            {chargement ? 'Chargement…' : `${points.length} point${points.length > 1 ? 's' : ''} · ${clients.length} client${clients.length > 1 ? 's' : ''}`}
            {horsLigne && <span className="ml-2 text-amber-700">· hors ligne (dernière liste connue)</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => charger()} title="Actualiser" className="p-2.5 rounded-xl border bg-white" style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>
            <RefreshCw className={`w-5 h-5 ${chargement ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => go({ n: 'choixClient' })} className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white shadow-sm active:scale-95 transition" style={{ background: 'var(--red)' }}>
            <Plus className="w-5 h-5" /> Nouveau point
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--border)' }}>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gray)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un site, une commune…"
            className="w-full rounded-lg border pl-9 pr-9 py-2.5 text-base" style={{ borderColor: 'var(--border)' }} />
          {q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1"><X className="w-4 h-4" style={{ color: 'var(--gray)' }} /></button>}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select value={filtreClient} onChange={(e) => choisirClient(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm bg-white flex-1 min-w-[150px]" style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>
            <option value="tous">Tous les clients ({points.length})</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.nom} ({nbParClient[c.id] || 0})</option>)}
          </select>
          <button onClick={basculerAutour}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold"
            style={autour ? { background: '#1d6fd6', color: '#fff', borderColor: '#1d6fd6' } : { borderColor: 'var(--border)', color: 'var(--navy)', background: '#fff' }}>
            {locEnCours ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />} Autour de moi
          </button>
          {autour && (
            <select value={rayon} onChange={(e) => { const v = parseInt(e.target.value, 10); setRayon(v); lsSet('carte_rayon', String(v)) }}
              className="rounded-lg border px-2 py-2 text-sm bg-white" style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>
              {RAYONS.map((r) => <option key={r.v} value={r.v}>{r.v ? `≤ ${r.l}` : r.l}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Onglets */}
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg border bg-white p-0.5" style={{ borderColor: 'var(--border)' }}>
          {(['carte', 'liste'] as const).map((o) => (
            <button key={o} onClick={() => { setOnglet(o); lsSet('carte_onglet', o) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold"
              style={onglet === o ? { background: 'var(--navy)', color: '#fff' } : { color: 'var(--navy)' }}>
              {o === 'carte' ? <MapIcon className="w-4 h-4" /> : <List className="w-4 h-4" />} {o === 'carte' ? 'Carte' : 'Liste'}
            </button>
          ))}
        </div>
        <span className="text-sm" style={{ color: 'var(--gray)' }}>
          {vueEnsemble ? `${groupes.length} client${groupes.length > 1 ? 's' : ''}` : `${filtres.length} point${filtres.length > 1 ? 's' : ''}`}
        </span>
      </div>

      {filtreClient !== 'tous' && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--blue-light)' }}>
          <button onClick={() => choisirClient('tous')} className="flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--navy)' }}>
            <ArrowLeft className="w-4 h-4" /> Tous les clients
          </button>
          <span className="ml-auto flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--navy)' }}>
            <span className="w-3 h-3 rounded-full" style={{ background: couleurClient(filtreClient, ordreClients) }} />
            {clientDe(filtreClient)?.nom}
          </span>
        </div>
      )}

      {onglet === 'carte' ? (
        <div className="relative rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          <MapView className="h-[62vh] min-h-[380px] w-full" points={vueEnsemble ? [] : pointsCarte} selectedId={selId} onSelect={setSelId}
            groupes={vueEnsemble ? groupes : []} onSelectGroupe={choisirClient}
            repere={bureau ? { id: bureau.id, lat: bureau.lat, lng: bureau.lng, nom: 'Bureau' } : null} onSelectRepere={setSelId}
            vueInitiale={vueEnsemble && bureau ? { lat: bureau.lat, lng: bureau.lng, zoom: 10 } : null}
            userPos={userPos} rayonM={autour ? rayon || null : null} fitKey={fitKey} focus={focus} />
          <button onClick={() => localiser(true)} title="Ma position"
            className="absolute z-[500] right-3 bottom-6 w-11 h-11 rounded-full bg-white shadow-lg grid place-items-center" style={{ color: '#1d6fd6' }}>
            {locEnCours ? <Loader2 className="w-5 h-5 animate-spin" /> : <LocateFixed className="w-5 h-5" />}
          </button>
          {vueEnsemble && groupes.length > 0 && (
            <div className="absolute z-[500] left-3 bottom-6 right-16 pointer-events-none">
              <span className="inline-block bg-white/90 rounded-lg px-2.5 py-1.5 text-xs font-medium shadow" style={{ color: 'var(--navy)' }}>
                Touchez un client pour voir ses points
              </span>
            </div>
          )}
          {sel && (!vueEnsemble || sel.id === bureau?.id) && (
            <div className="absolute z-[600] left-2 right-2 bottom-2 sm:left-3 sm:right-auto sm:w-96 bg-white rounded-xl shadow-xl p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold" style={{ color: couleurClient(sel.client_id, ordreClients) }}>{clientDe(sel.client_id)?.nom}</div>
                  <div className="font-bold truncate" style={{ color: 'var(--navy)' }}>{sel.nom}</div>
                  <div className="text-xs truncate" style={{ color: 'var(--gray)' }}>
                    {[sel.commune, selD != null ? `${fmtDistance(selD)} de vous` : null, depuisBureau(sel) != null ? `${fmtDistance(depuisBureau(sel)!)} du bureau` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <button onClick={() => setSelId(null)} className="p-1"><X className="w-4 h-4" style={{ color: 'var(--gray)' }} /></button>
              </div>
              <BoutonsGps lat={sel.lat} lng={sel.lng} nom={sel.nom} compact />
              <button onClick={() => go({ n: 'fiche', id: sel.id })} className="w-full text-sm font-semibold py-1.5 rounded-lg" style={{ color: 'var(--navy)', background: 'var(--blue-light)' }}>
                Voir la fiche
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-2">
          {vueEnsemble && groupes.map((g) => (
            <button key={g.id} onClick={() => choisirClient(g.id)}
              className="flex items-center gap-3 bg-white rounded-xl border px-4 py-4 text-left hover:shadow-md transition" style={{ borderColor: 'var(--border)' }}>
              <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: g.couleur }} />
              <span className="flex-1 font-semibold" style={{ color: 'var(--navy)' }}>{g.nom}</span>
              <span className="text-sm" style={{ color: 'var(--gray)' }}>{g.n} point{g.n > 1 ? 's' : ''}</span>
              <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--gray)' }} />
            </button>
          ))}
          {!vueEnsemble && filtres.length === 0 && (
            <div className="bg-white rounded-xl border p-8 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--gray)' }}>
              {points.length === 0 ? 'Aucun point pour le moment. Créez le premier avec « Nouveau point ».' : 'Aucun point ne correspond à la recherche.'}
            </div>
          )}
          {vueEnsemble && groupes.length === 0 && (
            <div className="bg-white rounded-xl border p-8 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--gray)' }}>
              Aucun point pour le moment. Créez le premier avec « Nouveau point ».
            </div>
          )}
          {!vueEnsemble && filtres.slice(0, 300).map(({ p, d }) => (
            <button key={p.id} onClick={() => go({ n: 'fiche', id: p.id })}
              className="flex items-center gap-3 bg-white rounded-xl border px-4 py-3 text-left hover:shadow-md transition" style={{ borderColor: 'var(--border)' }}>
              <MapPin className="w-5 h-5 shrink-0" style={{ color: couleurClient(p.client_id, ordreClients) }} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate" style={{ color: 'var(--navy)' }}>{p.nom}</div>
                <div className="text-xs truncate" style={{ color: 'var(--gray)' }}>
                  {[clientDe(p.client_id)?.nom, p.commune].filter(Boolean).join(' · ')}
                </div>
              </div>
              {d != null
                ? <span className="text-sm font-semibold shrink-0" style={{ color: '#1d6fd6' }}>{fmtDistance(d)}</span>
                : depuisBureau(p) != null && <span className="text-xs shrink-0 text-right leading-tight" style={{ color: 'var(--gray)' }}>{fmtDistance(depuisBureau(p)!)}<br />du bureau</span>}
              <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--gray)' }} />
            </button>
          ))}
          {!vueEnsemble && filtres.length > 300 && <p className="text-xs text-center" style={{ color: 'var(--gray)' }}>300 premiers résultats affichés — affinez la recherche.</p>}
        </div>
      )}

      {toast && <Toast m={toast} />}
    </div>
  )
}

function Ligne({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-2.5" style={{ borderColor: 'var(--border)' }}>
      <span className="w-28 shrink-0" style={{ color: 'var(--gray)' }}>{label}</span>
      <span className="flex-1 min-w-0" style={{ color: 'var(--navy)' }}>{children}</span>
    </div>
  )
}

function Toast({ m }: { m: string }) {
  return (
    <div className="fixed z-[1200] bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-medium text-white shadow-lg" style={{ background: 'var(--navy)' }}>
      {m}
    </div>
  )
}
