'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, CheckCircle2, ChevronRight, FileText, MoreVertical, RefreshCw, Search, WifiOff,
  Cloud, CloudOff, History, AlertTriangle, PencilLine, ClipboardList, Download, X, Play, Plus,
  Pencil, Trash2, Eye,
} from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { CLIENTS, getClient } from '@/lib/rapport/clients'
import type { ClientDef, Releve, Tournee } from '@/lib/rapport/types'
import { alertesReleve, fmtDate } from '@/lib/rapport/rules'
import {
  getTournee, getReleves, getHist, getArchives, getSyncInfo, synchroniser, enAttente, ouvrirTournee,
  enregistrerReleve, brouillonsDe, cloturerTournee, getPhoto, uid, abandonnerTournee,
  modifierReleveArchive, majPdfArchive, rangTournee, type SyncInfo,
} from '@/lib/rapport/store'
import { urlToDataUrl } from '@/components/rapport/photos'
import Saisie from '@/components/rapport/Saisie'

type Vue =
  | { n: 'accueil' }
  | { n: 'clients' }
  | { n: 'sites' }
  | { n: 'saisie'; siteId: string }
  | { n: 'archives' }

/** Tournée affichée : la tournée en cours, ou un rapport terminé ouvert en modification */
type Mode = { type: 'courant' } | { type: 'archive'; t: Tournee }

interface Resume { t: Tournee | null; n: number; archives: Tournee[]; nbParTournee: Record<string, number> }

export default function PageRapport() {
  const { user } = useAuth()
  const [vue, setVue] = useState<Vue>({ n: 'accueil' })
  const [clientId, setClientId] = useState<string>(CLIENTS[0].id)
  const [mode, setMode] = useState<Mode>({ type: 'courant' })
  const [tournee, setTournee] = useState<Tournee | null>(null)
  const [releves, setReleves] = useState<Record<string, Releve>>({})
  const [hist, setHist] = useState<Releve[]>([])
  const [brouillons, setBrouillons] = useState<Record<string, boolean>>({})
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [syncInfo, setSyncInfo] = useState<SyncInfo>({})
  const [syncing, setSyncing] = useState(false)
  const [menu, setMenu] = useState(false)
  const [modalRapport, setModalRapport] = useState(false)
  const [confirmNouveau, setConfirmNouveau] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')
  const [resume, setResume] = useState<Record<string, Resume>>({})

  const client: ClientDef = getClient(clientId) || CLIENTS[0]
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200) }

  // Navigation avec le bouton « retour » du téléphone
  const go = useCallback((v: Vue) => {
    setVue(v)
    try { window.history.pushState({ rapport: v }, '') } catch { /* */ }
  }, [])
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setVue(e.state?.rapport || { n: 'accueil' })
    window.addEventListener('popstate', onPop)
    try { window.history.replaceState({ rapport: { n: 'accueil' } }, '') } catch { /* */ }
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
    const t = setTimeout(() => { import('@/lib/rapport/pdf').catch(() => {}); import('jspdf').catch(() => {}); import('jspdf-autotable').catch(() => {}) }, 2500)
    return () => clearTimeout(t)
  }, [])

  const chargerResume = useCallback(async () => {
    const r: Record<string, Resume> = {}
    for (const c of CLIENTS) {
      const t = await getTournee(c.id)
      const nbParTournee: Record<string, number> = {}
      for (const h of await getHist(c.id)) if (h.tournee_id) nbParTournee[h.tournee_id] = (nbParTournee[h.tournee_id] || 0) + 1
      r[c.id] = { t, n: t ? Object.keys(await getReleves(t.id)).length : 0, archives: await getArchives(c.id), nbParTournee }
    }
    setResume(r)
  }, [])

  const charger = useCallback(async (cid: string, m: Mode) => {
    const c = getClient(cid)!
    const h = await getHist(cid)
    setHist(h)
    if (m.type === 'courant') {
      const t = await getTournee(cid)
      setTournee(t)
      setReleves(t ? await getReleves(t.id) : {})
      setBrouillons(t ? await brouillonsDe(t.id, c.sites.map((s) => s.id)) : {})
    } else {
      const arch = (await getArchives(cid)).find((a) => a.id === m.t.id) || m.t
      setMode({ type: 'archive', t: arch })
      const rel: Record<string, Releve> = {}
      h.filter((r) => r.tournee_id === arch.id).forEach((r) => { rel[r.site_id] = r })
      setReleves(rel)
      setBrouillons(await brouillonsDe(arch.id, c.sites.map((s) => s.id)))
    }
    setPending(await enAttente(cid))
    setSyncInfo(await getSyncInfo(cid))
  }, [])

  const rafraichir = useCallback(async () => { await charger(clientId, mode); await chargerResume() }, [charger, chargerResume, clientId, mode])

  const sync = useCallback(async (silencieux = true) => {
    if (!navigator.onLine) { if (!silencieux) flash('Hors ligne — les données seront envoyées au retour du réseau'); return }
    setSyncing(true)
    try { for (const c of CLIENTS) await synchroniser(c.id); if (!silencieux) flash('Synchronisation terminée') }
    catch (e: any) { if (!silencieux) flash('Synchronisation impossible : ' + (e?.message || 'erreur')) }
    finally { setSyncing(false) }
  }, [])

  // Rafraîchit l'affichage après chaque synchro
  useEffect(() => { if (!syncing) rafraichir() }, [syncing]) // eslint-disable-line

  useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => { setOnline(true); sync() }
    const off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    sync()
    const iv = setInterval(() => sync(), 60000)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(iv) }
  }, []) // eslint-disable-line

  // ── Actions de l'accueil ──────────────────────────────────────────────────
  const continuer = async (cid: string) => {
    const m: Mode = { type: 'courant' }
    setClientId(cid); setMode(m); await charger(cid, m); go({ n: 'sites' })
  }
  const nouveau = async (cid: string) => {
    if (!user) return
    if (await getTournee(cid)) { setConfirmNouveau(cid); return }
    await ouvrirTournee(cid, user)
    await continuer(cid)
    flash('Nouvelle tournée démarrée')
  }
  const ouvrirArchive = async (cid: string, t: Tournee) => {
    const m: Mode = { type: 'archive', t }
    setClientId(cid); setMode(m); await charger(cid, m); go({ n: 'sites' })
  }

  const ouvrirSite = async (siteId: string) => {
    if (!user) return
    if (mode.type === 'courant' && !tournee) setTournee(await ouvrirTournee(clientId, user))
    go({ n: 'saisie', siteId })
  }

  const sites = client.sites
  const faits = Object.keys(releves).filter((k) => sites.some((s) => s.id === k)).length
  const tAffichee = mode.type === 'archive' ? mode.t : tournee
  const rang = tAffichee ? rangTournee(tAffichee) : Date.now()
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

  const enCours = CLIENTS.filter((c) => resume[c.id]?.t)
  const nbArchives = CLIENTS.reduce((n, c) => n + (resume[c.id]?.archives.length || 0), 0)

  // ════════════════ ACCUEIL ════════════════
  if (vue.n === 'accueil') {
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--navy)' }}>
              <ClipboardList className="w-6 h-6" /> Rapport d’intervention
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--gray)' }}>Relevés d’exploitation sur site et rapport client.</p>
          </div>
          <EtatSync online={online} pending={pending} syncing={syncing} info={syncInfo} onClick={() => sync(false)} />
        </div>
        {!online && <BandeauHorsLigne />}

        {/* Continuer */}
        {enCours.map((c) => {
          const r = resume[c.id]!
          const pct = Math.round((r.n / c.sites.length) * 100)
          return (
            <button key={c.id} onClick={() => continuer(c.id)} className="w-full text-left rounded-2xl p-5 text-white shadow-md hover:shadow-lg transition-shadow"
              style={{ background: 'linear-gradient(135deg, var(--navy), var(--navy-light))' }}>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0"><Play className="w-6 h-6" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs uppercase tracking-wide opacity-75">Continuer la tournée non terminée</div>
                  <div className="text-lg font-bold">{c.code} — {r.n} / {c.sites.length} ouvrages</div>
                  <div className="text-xs opacity-80">Démarrée le {fmtDate(r.t!.created_at)} par {r.t!.created_by}</div>
                </div>
                <ChevronRight className="w-5 h-5 opacity-80" />
              </div>
              <div className="h-1.5 rounded-full mt-4 bg-white/20 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#99d9ef' }} /></div>
            </button>
          )
        })}

        <div className="grid sm:grid-cols-2 gap-4">
          <button onClick={() => (CLIENTS.length === 1 ? nouveau(CLIENTS[0].id) : go({ n: 'clients' }))}
            className="group text-left bg-white rounded-2xl p-5 border shadow-sm hover:shadow-lg transition-all" style={{ borderColor: 'var(--border)' }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ background: 'var(--blue-light)', color: 'var(--navy)' }}><Plus className="w-6 h-6" /></div>
            <div className="text-lg font-bold" style={{ color: 'var(--navy)' }}>Nouveau rapport</div>
            <div className="text-sm" style={{ color: 'var(--gray)' }}>Démarrer une nouvelle tournée de relevés.</div>
          </button>
          <button onClick={() => go({ n: 'archives' })}
            className="group text-left bg-white rounded-2xl p-5 border shadow-sm hover:shadow-lg transition-all" style={{ borderColor: 'var(--border)' }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ background: 'var(--blue-light)', color: 'var(--navy)' }}><History className="w-6 h-6" /></div>
            <div className="text-lg font-bold" style={{ color: 'var(--navy)' }}>Rapports terminés</div>
            <div className="text-sm" style={{ color: 'var(--gray)' }}>{nbArchives ? `${nbArchives} rapport${nbArchives > 1 ? 's' : ''} — consulter, modifier, regénérer le PDF.` : 'Aucun rapport terminé pour le moment.'}</div>
          </button>
        </div>

        {confirmNouveau && (
          <Modal onClose={() => setConfirmNouveau(null)} titre="Une tournée n’est pas terminée">
            <p className="text-sm" style={{ color: 'var(--text)' }}>
              La tournée {getClient(confirmNouveau)!.code} démarrée le {fmtDate(resume[confirmNouveau]?.t?.created_at || new Date().toISOString())} contient
              {' '}<b>{resume[confirmNouveau]?.n || 0} ouvrage(s)</b> relevé(s). Une tournée n’est terminée qu’une fois son rapport généré.
            </p>
            <button onClick={() => { const c = confirmNouveau; setConfirmNouveau(null); continuer(c) }} className="w-full py-3 rounded-xl font-semibold text-white" style={{ background: 'var(--navy)' }}>
              Continuer cette tournée
            </button>
            <button onClick={async () => {
              if (!window.confirm('Abandonner la tournée en cours ? Les saisies de cette tournée seront supprimées.')) return
              const c = confirmNouveau; setConfirmNouveau(null)
              await abandonnerTournee(c, getClient(c)!.sites.map((s) => s.id))
              await ouvrirTournee(c, user!); await continuer(c); flash('Nouvelle tournée démarrée')
            }} className="w-full py-3 rounded-xl font-semibold border flex items-center justify-center gap-2" style={{ borderColor: '#fecaca', color: 'var(--danger)' }}>
              <Trash2 className="w-4 h-4" /> Abandonner et en démarrer une nouvelle
            </button>
          </Modal>
        )}
        {toast && <Toast msg={toast} />}
      </div>
    )
  }

  // ════════════════ CHOIX DU CLIENT (nouveau rapport) ════════════════
  if (vue.n === 'clients') {
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <EnTete titre="Nouveau rapport" sous="Pour quel client ?" onBack={() => window.history.back()} />
        {CLIENTS.map((c) => (
          <button key={c.id} onClick={() => nouveau(c.id)} className="w-full text-left bg-white rounded-2xl p-5 border shadow-sm hover:shadow-lg flex items-center gap-4" style={{ borderColor: 'var(--border)' }}>
            <div className="w-14 h-14 rounded-xl flex items-center justify-center font-extrabold" style={{ background: 'var(--blue-light)', color: 'var(--navy)' }}>AEP</div>
            <div className="flex-1"><div className="text-lg font-bold" style={{ color: 'var(--navy)' }}>{c.code}</div><div className="text-sm" style={{ color: 'var(--gray)' }}>{c.nom} — {c.sites.length} ouvrages</div></div>
            <ChevronRight className="w-5 h-5" style={{ color: 'var(--navy)' }} />
          </button>
        ))}
      </div>
    )
  }

  // ════════════════ RAPPORTS TERMINÉS ════════════════
  if (vue.n === 'archives') {
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <EnTete titre="Rapports terminés" sous="Ouvrir un rapport pour le consulter, le corriger ou regénérer son PDF." onBack={() => window.history.back()} />
        {CLIENTS.map((c) => {
          const list = resume[c.id]?.archives || []
          return (
            <section key={c.id} className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider px-1" style={{ color: 'var(--red)' }}>{c.code}</h2>
              {list.length === 0 && <div className="bg-white rounded-xl border p-6 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--gray)' }}>Aucun rapport terminé.</div>}
              {list.map((t, i) => {
                const n = resume[c.id]?.nbParTournee[t.id] || 0
                const aRegenerer = !!t.modifie_at && (!t.pdf_at || t.modifie_at > t.pdf_at)
                return (
                  <button key={t.id} onClick={() => ouvrirArchive(c.id, t)} className="w-full text-left bg-white rounded-xl border px-4 py-3 flex items-center gap-3 hover:shadow-md" style={{ borderColor: 'var(--border)' }}>
                    <FileText className="w-5 h-5 shrink-0" style={{ color: 'var(--navy)' }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold flex items-center gap-2 flex-wrap" style={{ color: 'var(--navy)' }}>
                        Tournée du {fmtDate(t.created_at)}
                        {i === 0 && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'var(--blue-light)', color: 'var(--navy)' }}>Dernier</span>}
                        {aRegenerer && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: '#fef3c7', color: '#b45309' }}>PDF à regénérer</span>}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--gray)' }}>
                        Terminée le {t.cloturee_at ? fmtDate(t.cloturee_at, true) : '—'} par {t.cloturee_by || '—'}{n ? ` · ${n} ouvrage${n > 1 ? 's' : ''}` : ''}
                        {t.modifie_at && ` · modifiée le ${fmtDate(t.modifie_at, true)}`}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4" style={{ color: '#cbd5e1' }} />
                  </button>
                )
              })}
            </section>
          )
        })}
      </div>
    )
  }

  // ════════════════ SAISIE ════════════════
  if (vue.n === 'saisie') {
    const site = sites.find((s) => s.id === vue.siteId)
    const t = tAffichee
    if (!t || !site || !user) return null
    return (
      <Saisie key={site.id + t.id} site={site} tourneeId={t.id} user={user} hist={hist} existant={releves[site.id]} rang={rang}
        onAnnuler={() => { charger(clientId, mode); window.history.back() }}
        onSauver={async (r) => {
          const ancien = releves[site.id]
          if (mode.type === 'archive') {
            const rel: Releve = { ...r, id: r.id || uid(), tournee_id: t.id, client: clientId, saved_at: new Date().toISOString(),
              saisi_par: ancien?.saisi_par && ancien.saisi_par !== user ? `${ancien.saisi_par} (corrigé par ${user})` : user } as Releve
            const nt = await modifierReleveArchive(clientId, t, rel)
            const m: Mode = { type: 'archive', t: nt }
            setMode(m); await charger(clientId, m); chargerResume()
            flash(`${site.nom} corrigé — pensez à regénérer le PDF`)
          } else {
            const cur = await ouvrirTournee(clientId, user)
            const rel: Releve = { ...r, id: r.id || uid(), tournee_id: cur.id, client: clientId, saved_at: new Date().toISOString() } as Releve
            await enregistrerReleve(clientId, rel)
            await charger(clientId, mode); chargerResume()
            flash(`${site.nom} enregistré ✓`)
            sync()
          }
          window.history.back()
        }} />
    )
  }

  // ════════════════ LISTE DES OUVRAGES ════════════════
  const pct = sites.length ? Math.round((faits / sites.length) * 100) : 0
  const archive = mode.type === 'archive' ? mode.t : null
  const aRegenerer = !!archive?.modifie_at && (!archive.pdf_at || archive.modifie_at > archive.pdf_at)
  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-24">
      <div className="flex items-start gap-2">
        <button onClick={() => window.history.back()} className="p-2 -ml-2 rounded-lg hover:bg-gray-100" aria-label="Retour">
          <ArrowLeft className="w-5 h-5" style={{ color: 'var(--navy)' }} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold" style={{ color: 'var(--navy)' }}>{client.code}</h1>
          <p className="text-xs" style={{ color: 'var(--gray)' }}>{client.nom}</p>
        </div>
        <EtatSync online={online} pending={pending} syncing={syncing} info={syncInfo} onClick={() => sync(false)} />
        <div className="relative">
          <button onClick={() => setMenu((m) => !m)} className="p-2 rounded-lg border bg-white" style={{ borderColor: 'var(--border)' }} aria-label="Menu">
            <MoreVertical className="w-5 h-5" style={{ color: 'var(--navy)' }} />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
              <div className="absolute right-0 mt-2 w-72 z-50 bg-white rounded-xl shadow-xl border py-1" style={{ borderColor: 'var(--border)' }}>
                <MenuItem icon={<FileText className="w-4 h-4" />} label={archive ? 'Regénérer le rapport PDF' : 'Générer le rapport et terminer la tournée'} strong
                  onClick={() => { setMenu(false); setModalRapport(true) }} disabled={!faits} />
                <MenuItem icon={<History className="w-4 h-4" />} label="Rapports terminés" onClick={() => { setMenu(false); go({ n: 'archives' }) }} />
                <MenuItem icon={<RefreshCw className="w-4 h-4" />} label="Synchroniser maintenant" onClick={() => { setMenu(false); sync(false) }} />
                {!archive && tournee && (
                  <MenuItem icon={<Trash2 className="w-4 h-4" />} label="Abandonner cette tournée" danger onClick={async () => {
                    setMenu(false)
                    if (!window.confirm('Abandonner la tournée en cours ? Les saisies de cette tournée seront supprimées.')) return
                    await abandonnerTournee(clientId, sites.map((s) => s.id)); await chargerResume(); go({ n: 'accueil' }); flash('Tournée abandonnée')
                  }} />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {!online && <BandeauHorsLigne />}

      {archive ? (
        <div className="rounded-2xl p-4 border" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
          <div className="flex items-start gap-3">
            <Pencil className="w-5 h-5 mt-0.5 shrink-0" style={{ color: '#b45309' }} />
            <div className="text-sm" style={{ color: '#92400e' }}>
              <div className="font-bold">Rapport terminé — tournée du {fmtDate(archive.created_at)}</div>
              Touchez un ouvrage pour corriger ses valeurs. Les écarts de ce rapport et du rapport suivant seront recalculés automatiquement.
              {aRegenerer && <div className="mt-1 font-semibold">Des corrections ont été faites : regénérez le PDF.</div>}
            </div>
          </div>
        </div>
      ) : (
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
      )}

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
              const al = r ? alertesReleve(s.fields, r, hist, rang) : []
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
                      <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--gray)' }}>{archive ? 'Non relevé dans ce rapport' : `${s.fields.length} points de relevé`}</div>
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

      {faits > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 border-t bg-white/95 backdrop-blur" style={{ borderColor: 'var(--border)' }}>
          <div className="max-w-3xl mx-auto px-4 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <button onClick={() => setModalRapport(true)} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-white"
              style={{ background: archive ? (aRegenerer ? 'var(--warning)' : 'var(--navy)') : faits === sites.length ? 'var(--success)' : 'var(--navy)' }}>
              <FileText className="w-5 h-5" /> {archive ? 'Regénérer le rapport PDF' : `Générer le rapport complet (${faits}/${sites.length})`}
            </button>
          </div>
        </div>
      )}

      {modalRapport && tAffichee && (
        <ModalRapport client={client} tournee={tAffichee} archive={!!archive} releves={Object.values(releves)} hist={hist} user={user!}
          onClose={() => setModalRapport(false)}
          onDone={async (res) => {
            setModalRapport(false)
            if (res === 'termine') { await chargerResume(); go({ n: 'accueil' }); flash('Rapport généré — tournée terminée') }
            else if (res === 'regenere') { await rafraichir(); flash('PDF regénéré') }
          }} />
      )}

      {toast && <Toast msg={toast} />}
    </div>
  )
}

// ── Composants ──────────────────────────────────────────────────────────────
function EnTete({ titre, sous, onBack }: { titre: string; sous?: string; onBack: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <button onClick={onBack} className="p-2 -ml-2 rounded-lg hover:bg-gray-100" aria-label="Retour"><ArrowLeft className="w-5 h-5" style={{ color: 'var(--navy)' }} /></button>
      <div><h1 className="text-xl font-bold" style={{ color: 'var(--navy)' }}>{titre}</h1>{sous && <p className="text-sm" style={{ color: 'var(--gray)' }}>{sous}</p>}</div>
    </div>
  )
}

function MenuItem({ icon, label, onClick, strong, disabled, danger }: { icon: React.ReactNode; label: string; onClick: () => void; strong?: boolean; disabled?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-gray-50 disabled:opacity-40"
      style={{ color: danger ? 'var(--danger)' : 'var(--navy)', fontWeight: strong ? 700 : 500 }}>{icon}{label}</button>
  )
}

function Modal({ titre, children, onClose }: { titre: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--navy)' }}>{titre}</h3>
          <button onClick={onClose} aria-label="Fermer"><X className="w-5 h-5" style={{ color: 'var(--gray)' }} /></button>
        </div>
        {children}
      </div>
    </div>
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
      className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-2 rounded-lg border bg-white shrink-0" style={{ borderColor: 'var(--border)', color: col }}>
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

function ModalRapport({ client, tournee, archive, releves, hist, user, onClose, onDone }: {
  client: ClientDef; tournee: Tournee; archive: boolean; releves: Releve[]; hist: Releve[]; user: string
  onClose: () => void; onDone: (r: 'termine' | 'regenere' | 'apercu') => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const manquants = client.sites.filter((s) => !releves.some((r) => r.site_id === s.id))
  const generer = async (action: 'termine' | 'regenere' | 'apercu') => {
    setBusy(action); setErr('')
    try {
      const { genererRapportPdf, nomFichierPdf, telecharger } = await import('@/lib/rapport/pdf')
      const blob = await genererRapportPdf({ client, tournee, releves, hist, loadPhoto: chargerPhoto })
      const d = releves.map((r) => r.date_releve).sort().pop() || new Date().toISOString()
      telecharger(blob, nomFichierPdf(client, d))
      if (action === 'termine') await cloturerTournee(client.id, user, blob)
      if (action === 'regenere') await majPdfArchive(client.id, tournee, blob)
      onDone(action)
    } catch (e: any) {
      setErr(e?.message || 'Erreur lors de la génération')
    } finally { setBusy(null) }
  }
  return (
    <Modal onClose={onClose} titre={archive ? 'Regénérer le rapport' : 'Générer le rapport'}>
      <div className="text-sm" style={{ color: 'var(--text)' }}>
        <b>{releves.length} / {client.sites.length}</b> ouvrages relevés — tournée du {fmtDate(tournee.created_at)}.
      </div>
      {manquants.length > 0 && (
        <div className="text-sm rounded-xl p-3" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
          <div className="font-semibold mb-1 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {manquants.length} ouvrage{manquants.length > 1 ? 's' : ''} non relevé{manquants.length > 1 ? 's' : ''}</div>
          <div className="text-xs leading-relaxed">{manquants.map((s) => s.nom).join(' · ')}</div>
          <div className="text-xs mt-1">Ils apparaîtront comme « non relevés » dans le rapport.</div>
        </div>
      )}
      {!archive && (
        <p className="text-xs" style={{ color: 'var(--gray)' }}>
          Générer le rapport <b>termine la tournée</b> : elle passe dans « Rapports terminés » (toujours modifiable) et sert de référence pour les écarts du prochain rapport.
        </p>
      )}
      {err && <div className="text-sm" style={{ color: 'var(--danger)' }}>{err}</div>}
      <button onClick={() => generer(archive ? 'regenere' : 'termine')} disabled={!!busy} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-white disabled:opacity-60" style={{ background: 'var(--navy)' }}>
        <Download className="w-5 h-5" /> {busy && busy !== 'apercu' ? 'Génération du PDF…' : archive ? 'Regénérer le PDF' : 'Générer le PDF et terminer la tournée'}
      </button>
      {!archive && (
        <button onClick={() => generer('apercu')} disabled={!!busy} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border disabled:opacity-60" style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>
          <Eye className="w-4 h-4" /> {busy === 'apercu' ? 'Génération…' : 'Aperçu PDF sans terminer la tournée'}
        </button>
      )}
    </Modal>
  )
}
