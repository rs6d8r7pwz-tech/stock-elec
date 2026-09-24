'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, SkipForward, Camera, ImagePlus, X, Clock, Save, AlertTriangle,
  CheckCircle2, Info, Pencil, Trash2,
} from 'lucide-react'
import type { Brouillon, FieldDef, Niveau, Releve, SiteDef, Valeur } from '@/lib/rapport/types'
import { evaluer, fmtDate, fmtNum, fmtValeur, isIndex, parseSaisie } from '@/lib/rapport/rules'
import { getBrouillon, setBrouillon, delBrouillon, setPhoto, getPhoto, delPhoto, uid } from '@/lib/rapport/store'
import { compresserPhoto, toLocalInput, fromLocalInput } from './photos'

const SUGGESTIONS = [
  'RAS', 'Pression ballon OK', 'Appoint ballon', 'UV en défaut', 'Lampe UV HS', 'Réétalonnage sonde chlore',
  'Nettoyage chambre de mesure', 'Test inversion OK', 'Bouteille de chlore changée', 'Niveau javel bas',
  'Bruit de roulement pompe', 'Local propre', 'Intrusion OK', 'Défaut télégestion',
]

const couleur: Record<Niveau, { bg: string; fg: string; bd: string }> = {
  ok: { bg: '#f0fdf4', fg: '#15803d', bd: '#bbf7d0' },
  info: { bg: '#eff6ff', fg: '#1d4ed8', bd: '#bfdbfe' },
  warn: { bg: '#fffbeb', fg: '#b45309', bd: '#fde68a' },
  crit: { bg: '#fef2f2', fg: '#b91c1c', bd: '#fecaca' },
}

function versSaisie(v: Valeur | undefined): string {
  if (v === undefined || v === null) return ''
  if (v === 'INF') return '∞'
  if (typeof v === 'number') return String(v).replace('.', ',')
  return String(v)
}

interface Props {
  site: SiteDef
  tourneeId: string
  user: string
  hist: Releve[]
  existant?: Releve
  /** rang chronologique du rapport (les écarts se calculent sur le rapport terminé précédent) */
  rang?: number
  onAnnuler: () => void
  onSauver: (r: Omit<Releve, 'id' | 'tournee_id' | 'client' | 'saved_at'> & { id?: string }) => Promise<void>
}

export default function Saisie({ site, tourneeId, user, hist, existant, rang, onAnnuler, onSauver }: Props) {
  const fields = site.fields
  const N = fields.length
  const STEP_OBS = N + 1, STEP_RECAP = N + 2
  const [b, setB] = useState<Brouillon | null>(null)
  const [raw, setRaw] = useState('')
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)

  // Chargement : brouillon en cours > relevé existant > nouveau
  useEffect(() => {
    (async () => {
      const d = await getBrouillon(tourneeId, site.id)
      let init: Brouillon
      if (d) init = d
      else if (existant) init = {
        site_id: site.id, date_releve: existant.date_releve, valeurs: { ...existant.valeurs }, passes: [...(existant.passes || [])],
        observations: existant.observations || '', photos: [...(existant.photos || [])], step: STEP_RECAP, releve_id: existant.id,
      }
      else init = { site_id: site.id, date_releve: new Date().toISOString(), valeurs: {}, passes: [], observations: '', photos: [], step: 0 }
      setB(init)
      const ph: Record<string, string> = {}
      for (const p of init.photos) { const x = (await getPhoto(p.id)) || p.url; if (x) ph[p.id] = x }
      setPhotos(ph)
    })()
  }, [site.id, tourneeId]) // eslint-disable-line

  const maj = (patch: Partial<Brouillon>) => setB((prev) => {
    if (!prev) return prev
    const n = { ...prev, ...patch }
    setBrouillon(tourneeId, n).catch(() => {})
    return n
  })

  const f: FieldDef | undefined = b && b.step >= 1 && b.step <= N ? fields[b.step - 1] : undefined
  useEffect(() => {
    if (!b) return
    if (f) setRaw(versSaisie(b.valeurs[f.key]))
    setTimeout(() => inputRef.current?.focus(), 60)
    window.scrollTo({ top: 0 })
  }, [b?.step]) // eslint-disable-line

  const valeurCourante = f ? parseSaisie(raw, f.kind) : null
  const evalCourante = useMemo(() => {
    if (!f || !b) return null
    return evaluer(f, valeurCourante ?? undefined, site.id, b.date_releve, hist, { ...b.valeurs, ...(valeurCourante !== null ? { [f.key]: valeurCourante } : {}) }, rang)
  }, [f, raw, b?.date_releve, hist]) // eslint-disable-line

  if (!b) return <div className="py-16 text-center" style={{ color: 'var(--gray)' }}>Chargement…</div>

  const aller = (s: number) => maj({ step: Math.max(0, Math.min(STEP_RECAP, s)), fromRecap: false })
  const apres = () => (b.fromRecap ? STEP_RECAP : b.step + 1)
  const suivant = () => {
    if (f) {
      const v = parseSaisie(raw, f.kind)
      if (v === null) return
      const valeurs = { ...b.valeurs, [f.key]: v }
      maj({ valeurs, passes: b.passes.filter((k) => k !== f.key), step: apres(), fromRecap: false })
    } else maj({ step: apres(), fromRecap: false })
  }
  const passer = () => {
    if (!f) return aller(b.step + 1)
    const valeurs = { ...b.valeurs }; delete valeurs[f.key]
    maj({ valeurs, passes: Array.from(new Set([...b.passes, f.key])), step: apres(), fromRecap: false })
  }
  const editer = (idx: number) => maj({ step: idx, fromRecap: true })

  const ajouterPhotos = async (files: FileList | null) => {
    if (!files) return
    const nouvelles = [...b.photos]
    const ph = { ...photos }
    for (const file of Array.from(files)) {
      try {
        const d = await compresserPhoto(file)
        const id = uid()
        await setPhoto(id, d)
        nouvelles.push({ id }); ph[id] = d
      } catch { /* ignore */ }
    }
    setPhotos(ph); maj({ photos: nouvelles })
  }
  const retirerPhoto = async (id: string) => {
    await delPhoto(id).catch(() => {})
    maj({ photos: b.photos.filter((p) => p.id !== id) })
  }

  const sauver = async () => {
    setSaving(true)
    try {
      await onSauver({
        id: b.releve_id, site_id: site.id, date_releve: b.date_releve, valeurs: b.valeurs,
        passes: fields.filter((x) => b.valeurs[x.key] === undefined).map((x) => x.key),
        observations: b.observations.trim(), photos: b.photos, saisi_par: user, source: 'app',
      })
      await delBrouillon(tourneeId, site.id)
    } finally { setSaving(false) }
  }

  const progression = Math.round((b.step / STEP_RECAP) * 100)
  const nbSaisis = fields.filter((x) => b.valeurs[x.key] !== undefined).length
  const nbPasses = N - nbSaisis
  const alertes = fields.map((x) => ({ x, ev: evaluer(x, b.valeurs[x.key], site.id, b.date_releve, hist, b.valeurs, rang) }))
    .filter(({ ev }) => ev.niveau === 'warn' || ev.niveau === 'crit')

  const chips = f ? [
    ...(f.kind === 'isolement' ? [{ l: '∞ Infini', v: '∞' }] : []),
    ...(f.kind === 'chlore_mgl' ? [{ l: 'LO (bas)', v: 'LO' }] : []),
    ...(f.kind !== 'texte' ? [{ l: 'HS', v: 'HS' }] : []),
  ] : []

  return (
    <div className="max-w-xl mx-auto pb-28">
      {/* En-tête */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={onAnnuler} className="p-2 -ml-2 rounded-lg hover:bg-gray-100" aria-label="Retour à la liste des sites">
          <X className="w-5 h-5" style={{ color: 'var(--navy)' }} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--red)' }}>{site.commune}</div>
          <h1 className="text-lg font-bold truncate" style={{ color: 'var(--navy)' }}>{site.nom}</h1>
        </div>
        <div className="text-xs font-medium tabular-nums" style={{ color: 'var(--gray)' }}>
          {b.step <= N ? `${b.step} / ${N}` : b.step === STEP_OBS ? 'Observations' : 'Récap'}
        </div>
      </div>
      <div className="h-1.5 rounded-full mb-6 overflow-hidden" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${progression}%`, background: 'var(--navy)' }} />
      </div>

      {/* Étape 0 : date / heure */}
      {b.step === 0 && (
        <div className="space-y-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--gray)' }}>Début du relevé</div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>Date et heure du relevé</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--gray)' }}>Pré-rempli avec l’heure actuelle — modifiez si besoin.</p>
          </div>
          <input type="datetime-local" value={toLocalInput(b.date_releve)}
            onChange={(e) => maj({ date_releve: fromLocalInput(e.target.value) })}
            className="w-full text-xl px-4 py-4 rounded-xl border-2 bg-white focus:outline-none"
            style={{ borderColor: 'var(--navy)', color: 'var(--text)' }} />
          <button onClick={() => maj({ date_releve: new Date().toISOString() })}
            className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border bg-white"
            style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>
            <Clock className="w-4 h-4" /> Maintenant
          </button>
          {site.description && (
            <div className="text-sm rounded-xl p-4" style={{ background: 'var(--blue-light)', color: 'var(--navy)' }}>
              <div className="font-semibold mb-1">{site.nom}</div>{site.description}
              <div className="mt-2 text-xs" style={{ color: 'var(--gray)' }}>{N} point{N > 1 ? 's' : ''} de relevé</div>
            </div>
          )}
        </div>
      )}

      {/* Étapes champs */}
      {f && evalCourante && (
        <div className="space-y-4">
          <div>
            <span className="inline-block text-xs font-semibold px-2 py-1 rounded-md mb-2" style={{ background: 'var(--blue-light)', color: 'var(--navy)' }}>{f.section}</span>
            <h2 className="text-2xl font-bold leading-tight" style={{ color: 'var(--navy)' }}>{f.label}</h2>
          </div>
          {evalCourante.precedent ? (
            <div className="text-sm flex items-center gap-2" style={{ color: 'var(--gray)' }}>
              <Info className="w-4 h-4 shrink-0" />
              Rapport précédent : <b style={{ color: 'var(--text)' }}>{fmtValeur(evalCourante.precedent.valeur, f)}</b> le {fmtDate(evalCourante.precedent.date)}
            </div>
          ) : (
            <div className="text-sm" style={{ color: 'var(--gray)' }}>Pas de valeur dans le rapport précédent.</div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); suivant() }}>
            <div className="flex items-stretch rounded-xl border-2 bg-white overflow-hidden focus-within:shadow-md" style={{ borderColor: 'var(--navy)' }}>
              <input ref={inputRef} value={raw} onChange={(e) => setRaw(e.target.value)}
                inputMode={f.kind === 'texte' ? 'text' : 'decimal'} autoComplete="off" enterKeyHint="next"
                placeholder={f.kind === 'texte' ? 'ex : OK' : 'Saisir la valeur'}
                className="flex-1 min-w-0 text-3xl font-semibold px-4 py-4 focus:outline-none tabular-nums" style={{ color: 'var(--text)' }} />
              {f.unit && <span className="flex items-center px-4 text-lg font-medium" style={{ color: 'var(--gray)', background: '#f8fafc' }}>{f.unit}</span>}
            </div>
          </form>
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <button key={c.l} onClick={() => setRaw(c.v)} className="text-sm px-3 py-1.5 rounded-full border bg-white"
                  style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>{c.l}</button>
              ))}
            </div>
          )}
          {/* Écart / alertes en direct */}
          {valeurCourante !== null && (evalCourante.diff !== undefined || evalCourante.messages.length > 0) && (
            <div className="rounded-xl border p-3 text-sm space-y-1" style={{ background: couleur[evalCourante.niveau].bg, borderColor: couleur[evalCourante.niveau].bd, color: couleur[evalCourante.niveau].fg }}>
              {evalCourante.diff !== undefined && (
                <div className="font-semibold">
                  {evalCourante.diff > 0 ? '+' : ''}{fmtNum(evalCourante.diff, f.kind)} {f.unit} depuis le {fmtDate(evalCourante.precedent!.date)}
                  {evalCourante.parJour !== undefined && <span className="font-normal"> · ≈ {fmtNum(evalCourante.parJour)} {f.unit}/jour</span>}
                </div>
              )}
              {evalCourante.messages.map((m) => (
                <div key={m} className="flex gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{m}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Observations + photos */}
      {b.step === STEP_OBS && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>Observations</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--gray)' }}>Remarques, interventions réalisées, défauts constatés.</p>
          </div>
          <textarea value={b.observations} onChange={(e) => maj({ observations: e.target.value })} rows={5}
            placeholder="ex : RAS / appoint ballon 2 b / lampe UV 2 HS…"
            className="w-full text-base px-4 py-3 rounded-xl border-2 bg-white focus:outline-none" style={{ borderColor: 'var(--navy)' }} />
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => maj({ observations: b.observations ? `${b.observations.replace(/\s*$/, '')} / ${s}` : s })}
                className="text-sm px-3 py-1.5 rounded-full border bg-white" style={{ borderColor: 'var(--border)', color: 'var(--navy)' }}>+ {s}</button>
            ))}
          </div>
          <div>
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--navy)' }}>Photos ({b.photos.length})</div>
            <div className="grid grid-cols-3 gap-2">
              {b.photos.map((p) => (
                <div key={p.id} className="relative aspect-[4/3] rounded-lg overflow-hidden bg-gray-100">
                  {photos[p.id] && <img src={photos[p.id]} alt="" className="w-full h-full object-cover" />}
                  <button onClick={() => retirerPhoto(p.id)} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white" aria-label="Supprimer la photo"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => camRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed bg-white text-sm font-medium" style={{ borderColor: 'var(--blue-mid)', color: 'var(--navy)' }}>
                <Camera className="w-4 h-4" /> Prendre une photo
              </button>
              <button onClick={() => galRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed bg-white text-sm font-medium" style={{ borderColor: 'var(--blue-mid)', color: 'var(--navy)' }}>
                <ImagePlus className="w-4 h-4" /> Galerie
              </button>
            </div>
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { ajouterPhotos(e.target.files); e.target.value = '' }} />
            <input ref={galRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { ajouterPhotos(e.target.files); e.target.value = '' }} />
          </div>
        </div>
      )}

      {/* Récapitulatif */}
      {b.step === STEP_RECAP && (
        <div className="space-y-4">
          <div className="rounded-2xl p-5 text-center" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <CheckCircle2 className="w-12 h-12 mx-auto mb-2" style={{ color: 'var(--success)' }} />
            <h2 className="text-2xl font-bold" style={{ color: '#15803d' }}>Données complètes</h2>
            <p className="text-sm mt-1" style={{ color: '#166534' }}>
              {nbSaisis} valeur{nbSaisis > 1 ? 's' : ''} relevée{nbSaisis > 1 ? 's' : ''}
              {nbPasses > 0 && ` · ${nbPasses} passée${nbPasses > 1 ? 's' : ''}`}
              {b.photos.length > 0 && ` · ${b.photos.length} photo${b.photos.length > 1 ? 's' : ''}`}
            </p>
            <p className="text-xs mt-1" style={{ color: '#166534' }}>Relevé du {fmtDate(b.date_releve, true)}</p>
          </div>
          {alertes.length > 0 && (
            <div className="rounded-xl border p-3 text-sm space-y-1" style={{ background: couleur.warn.bg, borderColor: couleur.warn.bd, color: couleur.warn.fg }}>
              <div className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {alertes.length} point{alertes.length > 1 ? 's' : ''} d’attention</div>
              {alertes.map(({ x, ev }) => <div key={x.key}>• {x.section} — {x.label} : {ev.messages.join(' ; ')}</div>)}
            </div>
          )}
          <div className="rounded-xl border bg-white divide-y" style={{ borderColor: 'var(--border)' }}>
            <button onClick={() => editer(0)} className="w-full flex items-center justify-between px-4 py-3 text-left text-sm">
              <span style={{ color: 'var(--gray)' }}>Date et heure</span>
              <span className="font-semibold flex items-center gap-2">{fmtDate(b.date_releve, true)}<Pencil className="w-3.5 h-3.5" style={{ color: 'var(--gray)' }} /></span>
            </button>
            {fields.map((x, i) => {
              const v = b.valeurs[x.key]
              const ev = evaluer(x, v, site.id, b.date_releve, hist, b.valeurs, rang)
              const showSec = i === 0 || fields[i - 1].section !== x.section
              return (
                <div key={x.key}>
                  {showSec && <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--navy)', background: '#f8fafc' }}>{x.section}</div>}
                  <button onClick={() => editer(i + 1)} className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm">
                    <span style={{ color: 'var(--gray)' }}>{x.label}</span>
                    <span className="flex items-center gap-2 text-right">
                      {v === undefined
                        ? <span className="italic" style={{ color: '#9ca3af' }}>Passé</span>
                        : <span className="font-semibold tabular-nums" style={{ color: ev.niveau === 'warn' || ev.niveau === 'crit' ? couleur[ev.niveau].fg : 'var(--text)' }}>
                          {fmtValeur(v, x)}
                          {isIndex(x.kind) && ev.diff !== undefined && <span className="block text-xs font-normal" style={{ color: 'var(--gray)' }}>{ev.diff > 0 ? '+' : ''}{fmtNum(ev.diff, x.kind)} {x.unit}</span>}
                        </span>}
                      {(ev.niveau === 'warn' || ev.niveau === 'crit') && <AlertTriangle className="w-4 h-4" style={{ color: couleur[ev.niveau].fg }} />}
                      <Pencil className="w-3.5 h-3.5 shrink-0" style={{ color: '#cbd5e1' }} />
                    </span>
                  </button>
                </div>
              )
            })}
            <button onClick={() => editer(STEP_OBS)} className="w-full text-left px-4 py-3 text-sm">
              <div className="flex justify-between"><span style={{ color: 'var(--gray)' }}>Observations</span><Pencil className="w-3.5 h-3.5" style={{ color: '#cbd5e1' }} /></div>
              <div className="mt-1 font-medium">{b.observations || <span className="italic" style={{ color: '#9ca3af' }}>Aucune</span>}</div>
            </button>
          </div>
        </div>
      )}

      {/* Barre d'actions fixe */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t bg-white/95 backdrop-blur" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-xl mx-auto px-4 py-3 flex gap-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {b.step > 0 && b.step !== STEP_RECAP && (
            <button onClick={() => aller(b.step - 1)} className="px-4 py-3.5 rounded-xl border font-medium" style={{ borderColor: 'var(--border)', color: 'var(--navy)' }} aria-label="Précédent">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          {f && (
            <button onClick={passer} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--gray)' }}>
              <SkipForward className="w-4 h-4" /> Passer
            </button>
          )}
          {b.step === STEP_RECAP ? (
            <button onClick={sauver} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-white text-lg disabled:opacity-60" style={{ background: 'var(--success)' }}>
              <Save className="w-5 h-5" /> {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          ) : (
            <button onClick={suivant} disabled={!!f && valeurCourante === null}
              className="flex-[1.4] flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-white disabled:opacity-40" style={{ background: 'var(--navy)' }}>
              {b.step === STEP_OBS ? 'Terminer' : b.step === 0 ? 'Commencer' : 'Suivant'} <ArrowRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
