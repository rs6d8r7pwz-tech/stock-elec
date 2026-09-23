'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, CheckCircle2, ChevronRight, FileText, MoreVertical, RefreshCw, Search, WifiOff,
  Cloud, CloudOff, History, AlertTriangle, PencilLine, ClipboardList, Download, X,
} from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { CLIENTS, getClient } from '@/lib/rapport/clients'
import type { ClientDef, Releve, Tournee } from '@/lib/rapport/types'
import { alertesReleve, fmtDate } from '@/lib/rapport/rules'
import {
  getTournee, getReleves, getHist, getArchives, getSyncInfo, synchroniser, enAttente, ouvrirTournee,
  enregistrerReleve, brouillonsDe, cloturerTournee, relevesDeTournee, getPhoto, uid, type SyncInfo,
} from '@/lib/rapport/store'
import { urlToDataUrl } from '@/components/rapport/photos'
import Saisie from '@/components/rapport/Saisie'

type Vue = { n: 'clients' } | { n: 'sites' } | { n: 'saisie'; siteId: string } | { n: 'archives' }

export default function PageRapport() {
  const { user } = useAuth()
  const [clientId, setClientId] = useState<string | null>(null)
  const [vue, setVue] = useState<Vue>({ n: 'clients' })
  const [tournee, setTournee] = useState<Tournee | null>(null)
  const [tourneeSaisie, setTourneeSaisie] = useState<Tournee | null>(null)
  const [releves, setReleves] = useState<Record<string, Releve>>({})
  const [hist, setHist] = useState<Releve[]>([])
  const [archives, setArchives] = useState<Tournee[]>([])
  const [brouillons, setBrouillons] = useState<Record<string, boolean>>({})
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [syncInfo, setSyncInfo] = useState<SyncInfo>({})
  const [syncing, setSyncing] = useState(false)
  const [menu, setMenu] = useState(false)
  const [modalRapport, setModalRapport] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')
  const [resume, setResume] = useState<Record<string, { t: Tournee | null; n: number }>>({})

  const client: ClientDef | undefined = clientId ? getClient(clientId) : undefined

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200) }

  // Navigation avec le bouton « retour » du téléphone
  const go = useCallback((v: Vue) => {
    setVue(v)
    try { window.history.pushState({ rapport: v }, '') } catch { /* */ }
  }, [])
  useEffect(() => {
    const onPop = (e: PopStateEvent) => { if (e.state?.rapport) setVue(e.state.rapport); else setVue({ n: 'clients' }) }
    window.addEventListener('popstate', onPop)
    try { window.history.replaceState({ rapport: { n: 'clients' } }, '') } catch { /* */ }
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Service worker (mode hors-ligne) — limité à /rapport
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/rapport-sw.js', { scope: '/rapport' }).then(async (reg) => {
      await navigator.serviceWorker.ready
      const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.startsWith(location.origin))
      ;(reg.active || navigator.serviceWorker.controller)?.postMessage({ type: 'cache-urls', urls: [...urls, location.origin + '/rapport', location.origin + '/logo-electreau.png'] })
    }).catch(() => {})
    // Pré-charge le générateur PDF pour qu'il soit disponible hors-ligne
    const t = setTimeout(() => { import('@/lib/rapport/pdf').catch(() => {}); import('jspdf').catch(() => {}); import('jspdf-autotable').catch(() => {}) }, 2500)
    return () => clearTimeout(t)
  }, [])

  const charger = useCallback(async (cid: string) => {
    const c = getClient(cid)!
    const t = await getTournee(cid)
    setTournee(t)
    setReleves(t ? await getReleves(t.id) : {})
    setHist(await getHist(cid))
    setArchives(await getArchives(cid))
    setBrouillons(t ? await brouillonsDe(t.id, c.sites.map((s) => s.id)) : {})
    setPending(await enAttente(cid))
    setSyncInfo(await getSyncInfo(cid))
  }, [])

  const chargerResume = useCallback(async () => {
    const r: Record<string, { t: Tournee | null; n: number }> = {}
    for (const c of CLIENTS) {
      const t = await getTournee(c.id)
      r[c.id] = { t, n: t ? Object.keys(await getReleves(t.id)).length : 0 }
    }
    setResume(r)
  }, [])

  const sync = useCallback(async (cid: string, silencieux = true) => {
    if (!navigator.onLine) { if (!silencieux) flash('Hors ligne — les données seront envoyées au retour du réseau'); return }
    setSyncing(true)
    try { await synchroniser(cid); if (!silencieux) flash('Synchronisation terminée') }
    catch (e: any) { if (!silencieux) flash('Synchronisation impossible : ' + (e?.message || 'erreur')) }
    finally { setSyncing(false); await charger(cid); chargerResume() }
  }, [charger, chargerResume])

  useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => { setOnline(true); CLIENTS.forEach((c) => sync(c.id)) }
    const off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    chargerResume()
    CLIENTS.forEach((c) => synchroniser(c.id).catch(() => {}).finally(chargerResume))
    const iv = setInterval(() => { if (clientId) sync(clientId) }, 60000)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(iv) }
  }, [clientId]) // eslint-disable-line

  const choisirClient = async (cid: string) => {
    setClientId(cid)
    await charger(cid)
    go({ n: 'sites' })
    sync(cid)
  }

  const ouvrirSite = async (siteId: string) => {
    if (!clientId || !user) return
    const t = await ouvrirTournee(clientId, user)
    setTourneeSaisie(t)
    setTournee(t)
    go({ n: 'saisie', siteId })
  }

  const sites = client?.sites || []
  const faits = Object.keys(releves).filter((k) => sites.some((s) => s.id === k)).length
  const communes = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    const m = new Map<string, typeof sites>()
    for (const s of sites) {
      if (q && !(`${s.nom} ${s.commune}`.toLowerCase().includes(q))) continue
      if (!m.has(s.commune)) m.set(s.commune, [])
      m.get(s.commune)!.push(s)
    }
    return Array.from(m.entries())
  }, [sites, recherche])

  // ── Vue : choix du client ─────────────────────────────────────────────────
  if (vue.n === 'clients' || !client) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--navy)' }}>
            <ClipboardList className="w-6 h-6" /> Rapport d’intervention
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--gray)' }}>Choisissez le client pour lequel vous faites la tournée de relevés.</p>
        </div>
        {!online && <BandeauHorsLigne />}
        <div className="grid gap-4">
          {CLIENTS.map((c) => {
            const r = resume[c.id]
            return (
              <button key={c.id} onClick={() => choisirClient(c.id)}
                className="group text-left bg-white rounded-2xl p-5 border shadow-sm hover:shadow-lg transition-all flex items-center gap-4"
                style={{ borderColor: 'var(--border)' }}>
                <div className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-extrabold shrink-0" style={{ background: 'var(--blue-light)', color: 'var(--navy)' }}>
                  AEP
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-lg font-bold" style={{ color: 'var(--navy)' }}>{c.code}</div>
                  <div className="text-sm" style={{ color: 'var(--gray)' }}>{c.nom} — {c.service}</div>
                  <div className="text-xs mt-1.5 font-medium" style={{ color: r?.t ? 'var(--warning)' : 'var(--gray)' }}>
                    {r?.t ? `Tournée en cours : ${r.n} / ${c.sites.length} ouvrages relevés` : `${c.sites.length} ouvrages`}
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" style={{ color: 'var(--navy)' }} />
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Vue : saisie d'un ouvrage ─────────────────────────────────────────────
  if (vue.n === 'saisie') {
    const site = sites.find((s) => s.id === vue.siteId)!
    const t = tourneeSaisie || tournee
    if (!t || !site || !user) return null
    return (
      <Saisie key={site.id + t.id} site={site} tourneeId={t.id} user={user} hist={hist} existant={releves[site.id]}
        onAnnuler={() => { charger(client.id); window.history.back() }}
        onSauver={async (r) => {
          const cur = await ouvrirTournee(client.id, user)
          const rel: Releve = {
            ...r, id: r.id || uid(), tournee_id: cur.id, client: client.id, saved_at: new Date().toISOString(),
          } as Releve
          await enregistrerReleve(client.id, rel)
          await charger(client.id)
          flash(`${site.nom} enregistré ✓`)
          window.history.back()
          sync(client.id)
        }} />
    )
  }

  // ── Vue : archives ────────────────────────────────────────────────────────
  if (vue.n === 'archives') {
    return <Archives client={client} archives={archives} hist={hist} onBack={() => window.history.back()} flash={flash} />
  }

  // ── Vue : liste des ouvrages ──────────────────────────────────────────────
  const pct = sites.length ? Math.round((faits / sites.length) * 100) : 0
  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-24">
      <div className="flex items-start gap-2">
        <button onClick={() => window.history.back()} className="p-2 -ml-2 rounded-lg hover:bg-gray-100" aria-label="Retour aux clients">
          <ArrowLeft className="w-5 h-5" style={{ color: 'var(--navy)' }} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold" style={{ color: 'var(--navy)' }}>{client.code}</h1>
          <p className="text-xs" style={{ color: 'var(--gray)' }}>{client.nom}</p>
        </div>
        <EtatSync online={online} pending={pending} syncing={syncing} info={syncInfo} onClick={() => sync(client.id, false)} />
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} className="p-2 rounded-lg border bg-white" style={{ borderColor: 'var(--border)' }} aria-label="Menu">
            <MoreVertical className="w-5 h-5" style={{ color: 'var(--navy)' }} />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
              <div className="absolute right-0 mt-2 w-64 z-50 bg-white rounded-xl shadow-xl border py-1" style={{ borderColor: 'var(--border)' }}>
                <MenuItem icon={<FileText className="w-4 h-4" />} label="Générer le rapport complet" strong
                  onClick={() => { setMenu(false); setModalRapport(true) }} disabled={!faits} />
                <MenuItem icon={<History className="w-4 h-4" />} label="Rapports précédents" onClick={() => { setMenu(false); go({ n: 'archives' }) }} />
                <MenuItem icon={<RefreshCw className="w-4 h-4" />} label="Synchroniser maintenant" onClick={() => { setMenu(false); sync(client.id, false) }} />
              </div>
            </>
          )}
        </div>
      </div>

      {!online && <BandeauHorsLigne />}

      {/* Avancement de la tournée */}
      <div className="rounded-2xl p-4 text-white" style={{ background: 'linear-gradient(135deg, var(--navy), var(--navy-light))' }}>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide opacity-75">Tournée en cours</div>
            <div className="text-2xl font-bold tabular-nums">{faits} <span className="text-base font-medium opacity-75">/ {sites.length} ouvrages</span></div>
          </div>
          <div className="text-right text-xs opacity-80">
            {tournee ? <>Démarrée le {fmtDate(tournee.created_at)}<br />par {tournee.created_by}</> : 'Pas encore démarrée'}
          </div>
        </div>
        <div className="h-2 rounded-full mt-3 overflow-hidden bg-white/20">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: '#99d9ef' }} />
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gray)' }} />
        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un ouvrage ou une commune…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border bg-white text-sm focus:outline-none" style={{ borderColor: 'var(--border)' }} />
      </div>

      {communes.map(([commune, list]) => (
        <section key={commune}>
          <h2 className="text-xs font-bold uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--red)' }}>{commune}</h2>
          <div className="space-y-2">
            {list.map((s) => {
              const r = releves[s.id]
              const al = r ? alertesReleve(s.fields, r, hist) : []
              const draft = brouillons[s.id]
              return (
                <button key={s.id} onClick={() => ouvrirSite(s.id)}
                  className="w-full text-left bg-white rounded-xl border px-4 py-3 flex items-center gap-3 hover:shadow-md transition-shadow"
                  style={{ borderColor: r ? '#bbf7d0' : 'var(--border)', background: r ? '#f7fef9' : 'white' }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: r ? 'var(--success)' : draft ? '#fef3c7' : 'var(--blue-light)' }}>
                    {r ? <CheckCircle2 className="w-5 h-5 text-white" /> : draft ? <PencilLine className="w-4 h-4" style={{ color: 'var(--warning)' }} /> : <span className="text-xs font-bold" style={{ color: 'var(--navy)' }}>{s.fields.length}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate" style={{ color: 'var(--navy)' }}>{s.nom}</div>
                    {r ? (
                      <div className="text-xs mt-0.5 flex flex-wrap items-center gap-x-2" style={{ color: '#15803d' }}>
                        <span>Validé le {fmtDate(r.saved_at, true)} · {r.saisi_par}</span>
                        {r._dirty && <span className="inline-flex items-center gap-1" style={{ color: 'var(--gray)' }}><CloudOff className="w-3 h-3" /> non envoyé</span>}
                      </div>
                    ) : draft ? (
                      <div className="text-xs mt-0.5" style={{ color: 'var(--warning)' }}>Saisie commencée — reprendre</div>
                    ) : (
                      <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--gray)' }}>{s.fields.length} points de relevé</div>
                    )}
                  </div>
                  {al.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full" style={{ background: '#fef3c7', color: '#b45309' }}>
                      <AlertTriangle className="w-3.5 h-3.5" /> {al.length}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: '#cbd5e1' }} />
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {/* Bouton flottant rapport */}
      {faits > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 border-t bg-white/95 backdrop-blur" style={{ borderColor: 'var(--border)' }}>
          <div className="max-w-3xl mx-auto px-4 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <button onClick={() => setModalRapport(true)} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-white" style={{ background: faits === sites.length ? 'var(--success)' : 'var(--navy)' }}>
              <FileText className="w-5 h-5" /> Générer le rapport complet ({faits}/{sites.length})
            </button>
          </div>
        </div>
      )}

      {modalRapport && tournee && (
        <ModalRapport client={client} tournee={tournee} releves={Object.values(releves)} hist={hist} user={user!}
          onClose={() => setModalRapport(false)}
          onDone={async (cloture) => { setModalRapport(false); await charger(client.id); chargerResume(); flash(cloture ? 'Rapport généré — tournée clôturée' : 'Rapport généré') }} />
      )}

      {toast && <Toast msg={toast} />}
    </div>
  )
}

// ── Composants ──────────────────────────────────────────────────────────────
function MenuItem({ icon, label, onClick, strong, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; strong?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-gray-50 disabled:opacity-40"
      style={{ color: 'var(--navy)', fontWeight: strong ? 700 : 500 }}>{icon}{label}</button>
  )
}

function BandeauHorsLigne() {
  return (
    <div className="flex items-center gap-2 text-sm rounded-xl px-4 py-3" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
      <WifiOff className="w-4 h-4 shrink-0" /> Hors ligne — vos saisies sont gardées sur le téléphone et seront envoyées au retour du réseau.
    </div>
  )
}

function EtatSync({ online, pending, syncing, info, onClick }: { online: boolean; pending: number; syncing: boolean; info: SyncInfo; onClick: () => void }) {
  let txt = 'Synchronisé', col = 'var(--success)', Icon: any = Cloud
  if (syncing) { txt = 'Envoi…'; col = 'var(--navy)'; Icon = RefreshCw }
  else if (!online) { txt = pending ? `${pending} en attente` : 'Hors ligne'; col = 'var(--warning)'; Icon = CloudOff }
  else if (pending) { txt = `${pending} en attente`; col = 'var(--warning)'; Icon = CloudOff }
  return (
    <button onClick={onClick} title={info.error ? `Dernière erreur : ${info.error}` : info.lastOk ? `Dernière synchro : ${fmtDate(info.lastOk, true)}` : ''}
      className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-2 rounded-lg border bg-white" style={{ borderColor: 'var(--border)', color: col }}>
      <Icon className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">{txt}</span>
    </button>
  )
}

function Toast({ msg }: { msg: string }) {
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 px-4 py-2.5 rounded-xl text-sm font-medium text-white shadow-lg" style={{ background: 'var(--navy)' }}>{msg}</div>
  )
}

async function chargerPhoto(p: { id: string; url?: string }) {
  const local = await getPhoto(p.id)
  if (local) return local
  return p.url ? urlToDataUrl(p.url) : null
}

function ModalRapport({ client, tournee, releves, hist, user, onClose, onDone }: {
  client: ClientDef; tournee: Tournee; releves: Releve[]; hist: Releve[]; user: string; onClose: () => void; onDone: (c: boolean) => void
}) {
  const [cloturer, setCloturer] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const manquants = client.sites.filter((s) => !releves.some((r) => r.site_id === s.id))
  const generer = async () => {
    setBusy(true); setErr('')
    try {
      const { genererRapportPdf, nomFichierPdf, telecharger } = await import('@/lib/rapport/pdf')
      const blob = await genererRapportPdf({ client, tournee, releves, hist, loadPhoto: chargerPhoto })
      const d = releves.map((r) => r.date_releve).sort().pop() || new Date().toISOString()
      telecharger(blob, nomFichierPdf(client, d))
      if (cloturer) await cloturerTournee(client.id, user, blob)
      onDone(cloturer)
    } catch (e: any) {
      setErr(e?.message || 'Erreur lors de la génération')
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--navy)' }}><FileText className="w-5 h-5" /> Rapport complet</h3>
          <button onClick={onClose} aria-label="Fermer"><X className="w-5 h-5" style={{ color: 'var(--gray)' }} /></button>
        </div>
        <div className="text-sm" style={{ color: 'var(--text)' }}>
          <b>{releves.length} / {client.sites.length}</b> ouvrages relevés pour {client.code}.
        </div>
        {manquants.length > 0 && (
          <div className="text-sm rounded-xl p-3" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
            <div className="font-semibold mb-1 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {manquants.length} ouvrage{manquants.length > 1 ? 's' : ''} non relevé{manquants.length > 1 ? 's' : ''}</div>
            <div className="text-xs leading-relaxed">{manquants.map((s) => s.nom).join(' · ')}</div>
            <div className="text-xs mt-1">Ils apparaîtront comme « non relevés » dans le rapport.</div>
          </div>
        )}
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <input type="checkbox" checked={cloturer} onChange={(e) => setCloturer(e.target.checked)} className="mt-1 w-4 h-4" />
          <span><b>Clôturer la tournée</b><br /><span style={{ color: 'var(--gray)' }}>Le rapport est archivé et la prochaine saisie démarrera une nouvelle tournée. Décochez pour un rapport intermédiaire.</span></span>
        </label>
        {err && <div className="text-sm" style={{ color: 'var(--danger)' }}>{err}</div>}
        <button onClick={generer} disabled={busy} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white disabled:opacity-60" style={{ background: 'var(--navy)' }}>
          <Download className="w-5 h-5" /> {busy ? 'Génération du PDF…' : 'Générer le PDF'}
        </button>
      </div>
    </div>
  )
}

function Archives({ client, archives, hist, onBack, flash }: { client: ClientDef; archives: Tournee[]; hist: Releve[]; onBack: () => void; flash: (m: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const regenerer = async (t: Tournee) => {
    setBusy(t.id)
    try {
      const releves = await relevesDeTournee(client.id, t.id)
      if (!releves.length) { flash('Aucun relevé trouvé pour cette tournée'); return }
      const { genererRapportPdf, nomFichierPdf, telecharger } = await import('@/lib/rapport/pdf')
      const blob = await genererRapportPdf({ client, tournee: t, releves, hist, loadPhoto: chargerPhoto })
      telecharger(blob, nomFichierPdf(client, releves.map((r) => r.date_releve).sort().pop()!))
    } catch (e: any) { flash('Erreur : ' + (e?.message || '')) } finally { setBusy(null) }
  }
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-2 -ml-2 rounded-lg hover:bg-gray-100" aria-label="Retour"><ArrowLeft className="w-5 h-5" style={{ color: 'var(--navy)' }} /></button>
        <h1 className="text-xl font-bold" style={{ color: 'var(--navy)' }}>Rapports précédents — {client.code}</h1>
      </div>
      {archives.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--gray)' }}>Aucune tournée clôturée pour le moment.</div>
      ) : (
        <div className="space-y-2">
          {archives.map((t) => {
            const n = hist.filter((h) => h.tournee_id === t.id).length
            return (
              <div key={t.id} className="bg-white rounded-xl border px-4 py-3 flex items-center gap-3" style={{ borderColor: 'var(--border)' }}>
                <FileText className="w-5 h-5 shrink-0" style={{ color: 'var(--navy)' }} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold" style={{ color: 'var(--navy)' }}>Tournée du {fmtDate(t.created_at)}</div>
                  <div className="text-xs" style={{ color: 'var(--gray)' }}>Clôturée le {t.cloturee_at ? fmtDate(t.cloturee_at, true) : '—'} par {t.cloturee_by || '—'}{n ? ` · ${n} ouvrages` : ''}</div>
                </div>
                {t.pdf_url && <a href={t.pdf_url} target="_blank" rel="noopener" className="text-xs font-semibold px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>PDF archivé</a>}
                <button onClick={() => regenerer(t)} disabled={busy === t.id} className="text-xs font-semibold px-3 py-2 rounded-lg text-white disabled:opacity-60" style={{ background: 'var(--navy)' }}>
                  {busy === t.id ? '…' : 'Regénérer'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
