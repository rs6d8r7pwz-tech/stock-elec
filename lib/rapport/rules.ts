import type { Evaluation, FieldDef, FieldKind, Niveau, Releve, Valeur } from './types'

/**
 * Seuils d'alerte (modifiables ici).
 * Valeurs par défaut — à ajuster selon les consignes du client / de l'ARS.
 */
export const SEUILS = {
  chloreMin: 0.1,          // mg/l — en dessous : attention
  chloreMax: 0.5,          // mg/l — au-dessus : attention
  isolementAlerte: 2,      // MΩ — en dessous : attention
  isolementCritique: 0.5,  // MΩ — en dessous : critique
  turbiditeAlerte: 1,      // NTU
  turbiditeCritique: 2,    // NTU
  uvPctMin: 70,            // %
  variationIntensite: 0.2, // ±20 % par rapport au dernier passage
  ecartGroupes: 0.2,       // 20 % d'écart entre groupe 1 et groupe 2
}

export const INDEX_KINDS: FieldKind[] = ['heures', 'demarrages', 'allumages', 'index_m3']
export const isIndex = (k: FieldKind) => INDEX_KINDS.includes(k)

export function num(v: Valeur | undefined | null): number | null {
  if (typeof v === 'number' && isFinite(v)) return v
  return null
}

/** Convertit une saisie utilisateur (« 12,5 », « ∞ », « hs »…) en valeur stockée */
export function parseSaisie(raw: string, kind: FieldKind): Valeur | null {
  const s = raw.trim()
  if (!s) return null
  if (kind === 'texte') return s
  const up = s.toUpperCase()
  if (up === 'INF' || s === '∞' || up === 'INFINI') return 'INF'
  if (up === 'HS' || up === 'LO' || up === 'HI') return up
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  if (!isNaN(n) && isFinite(n)) return n
  return s
}

const nf = (d = 2) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d })
export function fmtNum(n: number, kind?: FieldKind): string {
  const d = kind && isIndex(kind) ? 0 : kind === 'chlore_mgl' || kind === 'turbidite' ? 3 : 2
  return nf(d).format(n)
}

export function fmtValeur(v: Valeur | undefined | null, f?: FieldDef, avecUnite = true): string {
  if (v === undefined || v === null || v === '') return '—'
  if (v === 'INF') return 'Infini (∞)'
  if (v === 'HS') return 'HS'
  if (v === 'LO') return 'LO (bas)'
  if (typeof v === 'number') return fmtNum(v, f?.kind) + (avecUnite && f?.unit ? ' ' + f.unit : '')
  return String(v)
}

export function fmtDate(iso: string, heure = false): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    (heure ? ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '')
}

/**
 * Rang d'un relevé dans la chronologie des rapports : un relevé appartient à une tournée,
 * et les tournées sont ordonnées par date de création. Les relevés importés (sans tournée)
 * sont rangés par leur date. `_rang` est calculé au chargement (store.getHist).
 */
export function rangDe(r: Pick<Releve, 'date_releve'> & { _rang?: number }): number {
  return typeof r._rang === 'number' ? r._rang : new Date(r.date_releve).getTime()
}

/**
 * Valeur de référence d'un point de mesure = celle du dernier rapport terminé AVANT le rapport
 * considéré (rang strictement inférieur). Si le point a été « passé » dans ce rapport, on remonte
 * au rapport terminé précédent qui l'a relevé.
 */
export function precedent(hist: Releve[], siteId: string, key: string, avant: string, numerique = false, rang?: number) {
  const limite = typeof rang === 'number' ? rang : new Date(avant).getTime()
  let best: { valeur: Valeur; date: string } | undefined
  let bestR = -Infinity, bestT = -Infinity
  for (const r of hist) {
    if (r.site_id !== siteId) continue
    const rr = rangDe(r as any)
    if (rr >= limite) continue
    const v = r.valeurs?.[key]
    if (v === undefined || v === null) continue
    if (numerique && num(v) === null) continue
    const rt = new Date(r.date_releve).getTime()
    if (rr < bestR || (rr === bestR && rt <= bestT)) continue
    best = { valeur: v, date: r.date_releve }
    bestR = rr; bestT = rt
  }
  return best
}

const pire = (a: Niveau, b: Niveau): Niveau => {
  const o: Niveau[] = ['ok', 'info', 'warn', 'crit']
  return o.indexOf(b) > o.indexOf(a) ? b : a
}

/**
 * Évalue une valeur : écart avec le relevé précédent, débit/jour, alertes.
 * `voisins` = autres valeurs du même relevé (pour comparer groupe 1 / groupe 2).
 */
export function evaluer(
  f: FieldDef, v: Valeur | undefined | null, siteId: string, dateReleve: string,
  hist: Releve[], voisins: Record<string, Valeur> = {}, rang?: number,
): Evaluation {
  const ev: Evaluation = { niveau: 'ok', messages: [] }
  const add = (n: Niveau, m: string) => { ev.niveau = pire(ev.niveau, n); ev.messages.push(m) }
  const prec = precedent(hist, siteId, f.key, dateReleve, isIndex(f.kind) || f.kind === 'intensite', rang)
  if (prec) ev.precedent = prec
  if (v === undefined || v === null || v === '') return ev

  if (v === 'HS') add('warn', 'Signalé hors service')
  const n = num(v)

  if (isIndex(f.kind) && n !== null && prec && num(prec.valeur) !== null) {
    const p = num(prec.valeur)!
    ev.diff = n - p
    const jours = (new Date(dateReleve).getTime() - new Date(prec.date).getTime()) / 86400000
    if (jours > 0.5) ev.parJour = ev.diff / jours
    if (ev.diff < 0) add('warn', 'Index inférieur au relevé précédent (compteur changé ou erreur de saisie ?)')
    else if (ev.diff === 0 && f.kind === 'heures') add('info', "Aucun fonctionnement depuis le dernier passage")
  }

  switch (f.kind) {
    case 'chlore_mgl':
      if (v === 'LO') add('warn', 'Chlore bas (LO)')
      else if (n !== null && n < SEUILS.chloreMin) add('warn', `Chlore faible (< ${fmtNum(SEUILS.chloreMin)} mg/l)`)
      else if (n !== null && n > SEUILS.chloreMax) add('warn', `Chlore élevé (> ${fmtNum(SEUILS.chloreMax)} mg/l)`)
      break
    case 'isolement':
      if (n !== null && n < SEUILS.isolementCritique) add('crit', `Isolement très faible (< ${fmtNum(SEUILS.isolementCritique)} MΩ)`)
      else if (n !== null && n < SEUILS.isolementAlerte) add('warn', `Isolement faible (< ${fmtNum(SEUILS.isolementAlerte)} MΩ)`)
      break
    case 'turbidite':
      if (n !== null && n > SEUILS.turbiditeCritique) add('crit', `Turbidité élevée (> ${fmtNum(SEUILS.turbiditeCritique)} NTU)`)
      else if (n !== null && n > SEUILS.turbiditeAlerte) add('warn', `Turbidité à surveiller (> ${fmtNum(SEUILS.turbiditeAlerte)} NTU)`)
      break
    case 'uv_pct':
      if (n !== null && n < SEUILS.uvPctMin) add('warn', `Intensité UV faible (< ${SEUILS.uvPctMin} %)`)
      break
    case 'intensite': {
      if (n !== null && prec && num(prec.valeur)) {
        const p = num(prec.valeur)!
        const r = (n - p) / p
        if (Math.abs(r) > SEUILS.variationIntensite)
          add('warn', `Intensité ${r > 0 ? '+' : ''}${Math.round(r * 100)} % par rapport au dernier passage (${fmtNum(p)} A)`)
      }
      // Comparaison groupe 2 vs groupe 1 (clé …g2_int ↔ …g1_int)
      const m = f.key.match(/^(.*)g2_int$/)
      if (m && n !== null) {
        const autre = num(voisins[m[1] + 'g1_int'])
        if (autre) {
          const e = Math.abs(n - autre) / Math.max(n, autre)
          if (e > SEUILS.ecartGroupes) add('warn', `Écart de ${Math.round(e * 100)} % entre groupe 1 (${fmtNum(autre)} A) et groupe 2`)
        }
      }
      break
    }
  }
  return ev
}

/** Évalue tout un relevé → liste des alertes (niveau ≥ warn) */
export function alertesReleve(fields: FieldDef[], r: Pick<Releve, 'site_id' | 'date_releve' | 'valeurs'>, hist: Releve[], rang?: number) {
  const out: { field: FieldDef; ev: Evaluation }[] = []
  for (const f of fields) {
    const ev = evaluer(f, r.valeurs[f.key], r.site_id, r.date_releve, hist, r.valeurs, rang)
    if (ev.niveau === 'warn' || ev.niveau === 'crit') out.push({ field: f, ev })
  }
  return out
}
