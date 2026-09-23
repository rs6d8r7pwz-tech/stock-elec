'use client'
/**
 * Stockage local (IndexedDB, fonctionne hors-ligne) + synchronisation Supabase
 * pour l'application Rapport.
 *
 * Principe : tout est d'abord enregistré sur le téléphone, puis envoyé au serveur
 * dès que le réseau est disponible. Une tournée ouverte sur le serveur est reprise
 * automatiquement par un collègue (même client).
 */
import { supabase } from '@/lib/supabase'
import type { Brouillon, Releve, Tournee } from './types'
import { HIST_CCBE_2024 } from './historique'

// Historique importé de l'ancien fichier Excel (embarqué dans l'appli, pas besoin de base)
const IMPORTS: Record<string, Releve[]> = {
  ccbe_aep: HIST_CCBE_2024.map(([site_id, d, valeurs, observations]) => ({
    id: `import-${site_id}-${d}`, tournee_id: null, client: 'ccbe_aep', site_id, date_releve: `${d}T09:00:00+01:00`,
    valeurs, passes: [], observations, photos: [], saisi_par: 'Import Excel 2024', saved_at: `${d}T09:00:00+01:00`, source: 'import_excel_2024',
  })),
}

// ── Mini wrapper IndexedDB (clé/valeur) ─────────────────────────────────────
const DB_NAME = 'electreau-rapport'
let dbp: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1)
      r.onupgradeneeded = () => r.result.createObjectStore('kv')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
  }
  return dbp
}
export async function kget<T>(key: string): Promise<T | undefined> {
  const d = await db()
  return new Promise((res, rej) => {
    const q = d.transaction('kv').objectStore('kv').get(key)
    q.onsuccess = () => res(q.result as T)
    q.onerror = () => rej(q.error)
  })
}
export async function kset(key: string, val: unknown) {
  const d = await db()
  return new Promise<void>((res, rej) => {
    const tx = d.transaction('kv', 'readwrite')
    tx.objectStore('kv').put(val, key)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}
export async function kdel(key: string) {
  const d = await db()
  return new Promise<void>((res, rej) => {
    const tx = d.transaction('kv', 'readwrite')
    tx.objectStore('kv').delete(key)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) return (crypto as any).randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ── Clés ────────────────────────────────────────────────────────────────────
const K = {
  tournee: (c: string) => `tournee:${c}`,
  releves: (t: string) => `releves:${t}`,
  hist: (c: string) => `hist:${c}`,
  archives: (c: string) => `archives:${c}`,
  brouillon: (t: string, s: string) => `draft:${t}:${s}`,
  photo: (id: string) => `photo:${id}`,
  sync: (c: string) => `sync:${c}`,
  pend: (c: string) => `pendclose:${c}`,
  edits: (c: string) => `edits:${c}`,
}

// ── Accès local ─────────────────────────────────────────────────────────────
export const getTournee = (c: string) => kget<Tournee | null>(K.tournee(c)).then((t) => t || null)
export const getReleves = async (t: string) => (await kget<Record<string, Releve>>(K.releves(t))) || {}
const getPendClose = async (c: string) => (await kget<Tournee[]>(K.pend(c))) || []
const getArchivesBrutes = async (c: string) => (await kget<Tournee[]>(K.archives(c))) || []

// File des modifications faites sur des rapports déjà terminés (envoyées à la prochaine synchro)
type Edit = { type: 'releve'; data: Releve } | { type: 'tournee'; data: Tournee } | { type: 'del_tournee'; id: string }
const getEdits = async (c: string) => (await kget<Edit[]>(K.edits(c))) || []
async function ajouterEdit(c: string, e: Edit) {
  const q = await getEdits(c)
  const key = (x: Edit) => x.type === 'del_tournee' ? 'd' + x.id : x.type + x.data.id
  await kset(K.edits(c), [...q.filter((x) => key(x) !== key(e)), e])
}

/** Rapports terminés (serveur + modifications locales pas encore envoyées), du plus récent au plus ancien */
export async function getArchives(c: string): Promise<Tournee[]> {
  const arch = await getArchivesBrutes(c)
  const edits = await getEdits(c)
  const map = new Map(arch.map((a) => [a.id, a]))
  for (const e of edits) {
    if (e.type === 'tournee' && e.data.statut === 'cloturee') map.set(e.data.id, { ...map.get(e.data.id), ...e.data })
    if (e.type === 'del_tournee') map.delete(e.id)
  }
  return Array.from(map.values()).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
}

/**
 * Historique = relevés des rapports terminés (+ import Excel), chacun avec son rang chronologique :
 * rang = date de création de sa tournée (les relevés importés : leur date).
 * C'est ce rang qui définit « le rapport précédent » pour le calcul des écarts.
 */
export async function getHist(c: string): Promise<Releve[]> {
  const base = (await kget<Releve[]>(K.hist(c))) || []
  const edits = await getEdits(c)
  const byId = new Map(base.map((r) => [r.id, r]))
  for (const e of edits) if (e.type === 'releve') byId.set(e.data.id, e.data)
  const ordre: Record<string, number> = {}
  for (const t of [...(await getArchives(c)), ...(await getPendClose(c))]) ordre[t.id] = new Date(t.created_at).getTime()
  const out = [...Array.from(byId.values()), ...(IMPORTS[c] || [])]
  return out.map((r) => ({ ...r, _rang: r.tournee_id && ordre[r.tournee_id] ? ordre[r.tournee_id] : new Date(r.date_releve).getTime() }))
}
export const rangTournee = (t: Pick<Tournee, 'created_at'>) => new Date(t.created_at).getTime()
export const getBrouillon = (t: string, s: string) => kget<Brouillon>(K.brouillon(t, s))
export const setBrouillon = (t: string, b: Brouillon) => kset(K.brouillon(t, b.site_id), b)
export const delBrouillon = (t: string, s: string) => kdel(K.brouillon(t, s))
export const getPhoto = (id: string) => kget<string>(K.photo(id))
export const setPhoto = (id: string, dataUrl: string) => kset(K.photo(id), dataUrl)
export const delPhoto = (id: string) => kdel(K.photo(id))

export interface SyncInfo { lastOk?: string; error?: string }
export const getSyncInfo = async (c: string) => (await kget<SyncInfo>(K.sync(c))) || {}

/** Retourne la tournée en cours du client, ou en crée une (locale) */
export async function ouvrirTournee(client: string, user: string): Promise<Tournee> {
  const cur = await getTournee(client)
  if (cur && cur.statut === 'en_cours') return cur
  const t: Tournee = {
    id: uid(), client, statut: 'en_cours', created_by: user,
    created_at: new Date().toISOString(), _dirty: true, _new: true,
  }
  await kset(K.tournee(client), t)
  return t
}

export async function enregistrerReleve(client: string, r: Releve) {
  const all = await getReleves(r.tournee_id!)
  all[r.site_id] = { ...r, _dirty: true }
  await kset(K.releves(r.tournee_id!), all)
}

export async function brouillonsDe(t: string, siteIds: string[]) {
  const out: Record<string, boolean> = {}
  for (const s of siteIds) if (await getBrouillon(t, s)) out[s] = true
  return out
}

// ── Synchronisation ─────────────────────────────────────────────────────────
const clean = <T extends object>(o: T) => {
  const c: any = { ...o }
  Object.keys(c).forEach((k) => k.startsWith('_') && delete c[k])
  return c
}
function dataUrlToBlob(d: string): Blob {
  const [h, b] = d.split(',')
  const mime = h.match(/:(.*?);/)?.[1] || 'image/jpeg'
  const bin = atob(b)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return new Blob([u], { type: mime })
}

async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return out
}

let running: Promise<void> | null = null
/** Envoie les données locales puis récupère l'état serveur. Sans effet hors-ligne. */
export function synchroniser(client: string): Promise<void> {
  if (running) return running
  running = (async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    try {
      await pousser(client)
      await tirer(client)
      await kset(K.sync(client), { lastOk: new Date().toISOString() })
    } catch (e: any) {
      const prev = await getSyncInfo(client)
      await kset(K.sync(client), { ...prev, error: e?.message || String(e) })
      throw e
    }
  })().finally(() => { running = null })
  return running
}

/** Envoie un relevé (photos d'abord) et renvoie sa version à jour */
async function envoyerReleve(r: Releve): Promise<Releve> {
  const photos = []
  for (const p of r.photos || []) {
    if (p.url) { photos.push(p); continue }
    const d = await getPhoto(p.id)
    if (!d) continue
    const path = `photos/${r.tournee_id}/${r.site_id}/${p.id}.jpg`
    const up = await supabase.storage.from('rapport').upload(path, dataUrlToBlob(d), { upsert: true, contentType: 'image/jpeg' })
    if (up.error) throw new Error(up.error.message)
    const url = supabase.storage.from('rapport').getPublicUrl(path).data.publicUrl
    photos.push({ id: p.id, path, url })
  }
  const row = { ...clean(r), photos, updated_at: new Date().toISOString() }
  const { error } = await supabase.from('rapport_releves').upsert(row)
  if (error) throw new Error(error.message)
  return { ...r, photos, _dirty: false }
}

async function pousserTournee(t: Tournee): Promise<Tournee> {
  if (t._dirty) {
    const { error } = await supabase.from('rapport_tournees').upsert({ ...clean(t), updated_at: new Date().toISOString() })
    if (error) throw new Error(error.message)
    t = { ...t, _dirty: false, _new: false }
  }
  const rel = await getReleves(t.id)
  let changed = false
  for (const r of Object.values(rel)) {
    if (!r._dirty) continue
    rel[r.site_id] = await envoyerReleve(r)
    changed = true
  }
  if (changed) await kset(K.releves(t.id), rel)
  return t
}

async function pousserEdits(client: string) {
  for (const e of await getEdits(client)) {
    if (e.type === 'tournee') {
      const { error } = await supabase.from('rapport_tournees').upsert({ ...clean(e.data), updated_at: new Date().toISOString() })
      if (error) throw new Error(error.message)
    } else if (e.type === 'releve') {
      await envoyerReleve(e.data)
    } else {
      const { error } = await supabase.from('rapport_tournees').delete().eq('id', e.id)
      if (error) throw new Error(error.message)
    }
    const rest = (await getEdits(client)).filter((x) => x !== e && JSON.stringify(x) !== JSON.stringify(e))
    await kset(K.edits(client), rest)
  }
}

async function pousser(client: string) {
  // 1) Tournées clôturées hors-ligne en attente d'envoi
  const pend = await getPendClose(client)
  for (const pt of pend) {
    await pousserTournee(pt)
    await kset(K.pend(client), (await getPendClose(client)).filter((x) => x.id !== pt.id))
  }
  // 1 bis) Modifications de rapports terminés
  await pousserEdits(client)
  // 2) Tournée en cours
  let t = await getTournee(client)
  if (!t) return
  // Tournée créée hors-ligne alors qu'un collègue en a ouvert une : on fusionne dans la sienne
  if (t._new) {
    const { data, error } = await supabase.from('rapport_tournees').select('*')
      .eq('client', client).eq('statut', 'en_cours').order('created_at', { ascending: false }).limit(1)
    if (error) throw new Error(error.message)
    const srv = data?.[0] as Tournee | undefined
    if (srv && srv.id !== t.id) {
      const mine = await getReleves(t.id)
      const theirs = await getReleves(srv.id)
      for (const r of Object.values(mine)) theirs[r.site_id] = { ...r, tournee_id: srv.id, _dirty: true }
      await kset(K.releves(srv.id), theirs)
      await kdel(K.releves(t.id))
      for (const r of Object.values(mine)) {
        const b = await getBrouillon(t.id, r.site_id); if (b) { await setBrouillon(srv.id, b); await delBrouillon(t.id, r.site_id) }
      }
      t = { ...srv }
      await kset(K.tournee(client), t)
    }
  }
  t = await pousserTournee(t)
  await kset(K.tournee(client), t)
}

async function tirer(client: string) {
  // 1) Tournée en cours côté serveur (reprise par un collègue)
  const local = await getTournee(client)
  const { data: open, error: e1 } = await supabase.from('rapport_tournees').select('*')
    .eq('client', client).eq('statut', 'en_cours').order('created_at', { ascending: false }).limit(1)
  if (e1) throw new Error(e1.message)
  const srv = open?.[0] as Tournee | undefined
  let cur: Tournee | null = local
  if (srv && (!local || local.id === srv.id || (!Object.values(await getReleves(local.id)).some((r) => r._dirty)))) {
    cur = { ...srv, _dirty: false }
    await kset(K.tournee(client), cur)
  } else if (!srv && local && !local._new && !local._dirty) {
    // Clôturée par quelqu'un d'autre
    await kset(K.tournee(client), null)
    cur = null
  }
  // 2) Relevés de la tournée en cours
  if (cur && !cur._new) {
    const { data, error } = await supabase.from('rapport_releves').select('*').eq('tournee_id', cur.id)
    if (error) throw new Error(error.message)
    const loc = await getReleves(cur.id)
    for (const r of (data || []) as Releve[]) {
      const l = loc[r.site_id]
      if (!l || (!l._dirty && new Date(r.saved_at) >= new Date(l.saved_at)) || new Date(r.saved_at) > new Date(l.saved_at)) {
        loc[r.site_id] = { ...r, _dirty: false }
      }
    }
    await kset(K.releves(cur.id), loc)
  }
  // 3) Historique (tous les relevés hors tournée en cours) — sert aux écarts et graphiques
  const hist = await fetchAll<Releve>((from, to) => {
    let q = supabase.from('rapport_releves')
      .select('id,tournee_id,client,site_id,date_releve,valeurs,passes,observations,photos,saisi_par,saved_at,source')
      .eq('client', client).order('date_releve', { ascending: false }).range(from, to)
    return q
  })
  const ids = new Set(hist.map((h) => h.id))
  const pendRel: Releve[] = []
  for (const pt of await getPendClose(client)) pendRel.push(...Object.values(await getReleves(pt.id)).filter((r) => !ids.has(r.id)))
  await kset(K.hist(client), [...pendRel, ...hist.filter((r) => (!cur || r.tournee_id !== cur.id) && r.source !== 'import_excel_2024')])
  // 4) Archives
  const { data: arch, error: e3 } = await supabase.from('rapport_tournees').select('*')
    .eq('client', client).eq('statut', 'cloturee').order('cloturee_at', { ascending: false }).limit(100)
  if (e3) throw new Error(e3.message)
  await kset(K.archives(client), arch || [])
}

/** Nombre d'éléments en attente d'envoi */
export async function enAttente(client: string): Promise<number> {
  let n = (await getEdits(client)).length
  const ts = [...(await getPendClose(client))]
  const t = await getTournee(client)
  if (t) ts.push(t)
  for (const x of ts) {
    const rel = await getReleves(x.id)
    n += Object.values(rel).filter((r) => r._dirty).length + (x._dirty ? 1 : 0)
  }
  return n
}

/** Clôture la tournée : historique local mis à jour tout de suite (écarts OK même hors-ligne) */
export async function cloturerTournee(client: string, user: string, pdfBlob?: Blob) {
  const t = await getTournee(client)
  if (!t) return
  const now = new Date().toISOString()
  const closed: Tournee = { ...t, statut: 'cloturee', cloturee_by: user, cloturee_at: now, pdf_at: now, _dirty: true }
  if (pdfBlob && navigator.onLine) {
    try {
      const path = `rapports/${client}/${t.id}.pdf`
      const up = await supabase.storage.from('rapport').upload(path, pdfBlob, { upsert: true, contentType: 'application/pdf' })
      if (!up.error) {
        closed.pdf_path = path
        closed.pdf_url = supabase.storage.from('rapport').getPublicUrl(path).data.publicUrl
      }
    } catch { /* le PDF reste téléchargé en local */ }
  }
  await kset(K.pend(client), [...(await getPendClose(client)).filter((x) => x.id !== t.id), closed])
  await kset(K.tournee(client), null)
  const rel = Object.values(await getReleves(t.id))
  const hist = (await kget<Releve[]>(K.hist(client))) || []
  await kset(K.hist(client), [...rel.map((r) => ({ ...r, _dirty: false })), ...hist.filter((h) => h.tournee_id !== t.id)])
  const arch = await getArchivesBrutes(client)
  await kset(K.archives(client), [{ ...closed, _dirty: false }, ...arch.filter((a) => a.id !== t.id)])
  try { await synchroniser(client) } catch { /* sera renvoyé plus tard */ }
  return closed
}

/** Relevés d'une tournée archivée (depuis le cache local, sinon le serveur) */
export async function relevesDeTournee(client: string, tourneeId: string): Promise<Releve[]> {
  const hist = await getHist(client)
  const loc = hist.filter((r) => r.tournee_id === tourneeId)
  if (loc.length) return loc
  const { data } = await supabase.from('rapport_releves').select('*').eq('tournee_id', tourneeId)
  return (data as Releve[]) || []
}

/** Abandonne la tournée en cours (supprime ses saisies, localement et sur le serveur) */
export async function abandonnerTournee(client: string, siteIds: string[]) {
  const t = await getTournee(client)
  if (!t) return
  for (const s of siteIds) await delBrouillon(t.id, s).catch(() => {})
  await kdel(K.releves(t.id))
  await kset(K.tournee(client), null)
  if (!t._new) await ajouterEdit(client, { type: 'del_tournee', id: t.id })
  try { await synchroniser(client) } catch { /* plus tard */ }
}

/** Modifie (ou ajoute) un relevé dans un rapport déjà terminé */
export async function modifierReleveArchive(client: string, arch: Tournee, r: Releve) {
  const rel: Releve = { ...r, tournee_id: arch.id, _dirty: false }
  delete (rel as any)._rang
  await ajouterEdit(client, { type: 'releve', data: rel })
  const t: Tournee = { ...arch, modifie_at: new Date().toISOString() }
  await ajouterEdit(client, { type: 'tournee', data: clean(t) })
  try { await synchroniser(client) } catch { /* plus tard */ }
  return t
}

/** Enregistre le PDF regénéré d'un rapport terminé */
export async function majPdfArchive(client: string, arch: Tournee, pdfBlob: Blob) {
  const t: Tournee = { ...arch, pdf_at: new Date().toISOString() }
  if (navigator.onLine) {
    try {
      const path = `rapports/${client}/${arch.id}.pdf`
      const up = await supabase.storage.from('rapport').upload(path, pdfBlob, { upsert: true, contentType: 'application/pdf' })
      if (!up.error) { t.pdf_path = path; t.pdf_url = supabase.storage.from('rapport').getPublicUrl(path).data.publicUrl + '?v=' + Date.now() }
    } catch { /* PDF gardé en local */ }
  }
  await ajouterEdit(client, { type: 'tournee', data: clean(t) })
  try { await synchroniser(client) } catch { /* plus tard */ }
  return t
}
