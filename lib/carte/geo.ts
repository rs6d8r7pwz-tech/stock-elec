import type { CartePoint, Position } from './types'

// ── Distances ────────────────────────────────────────────────────────────────
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const toR = (d: number) => (d * Math.PI) / 180
  const dLat = toR(b.lat - a.lat)
  const dLng = toR(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

export function fmtDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`
  if (m < 10000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`
  return `${Math.round(m / 1000)} km`
}

export const fmtCoord = (v: number) => v.toFixed(6)

// ── Saisie de coordonnées ────────────────────────────────────────────────────
/**
 * Accepte : « 45.8561, 3.5478 » · « 45,8561 3,5478 » · « 45.8561;3.5478 »
 * · DMS « 45°51'22.0"N 3°32'52.1"E » · degrés-minutes « N 45 51.367 E 3 32.868 »
 */
export function parseCoords(input: string): Position | null {
  const s = input.trim().replace(/[’′]/g, "'").replace(/[”″]/g, '"')
  if (!s) return null

  // 1) Deux nombres décimaux (virgule décimale acceptée si séparateur espace/;)
  const dec = s.match(/^\s*(-?\d{1,3}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/)
  if (dec) {
    const lat = parseFloat(dec[1].replace(',', '.'))
    const lng = parseFloat(dec[2].replace(',', '.'))
    return valid(lat, lng)
  }

  // 2) DMS / DM avec hémisphères
  const re = /([NSEWO])?\s*(-?\d{1,3}(?:[.,]\d+)?)\s*[°º d]\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['m ]?\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:"|''|s)?\s*)?([NSEWO])?/gi
  const parts: { v: number; h: string }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) && parts.length < 2) {
    if (!m[2]) { re.lastIndex++; continue }
    const d = parseFloat(m[2].replace(',', '.'))
    const mi = m[3] ? parseFloat(m[3].replace(',', '.')) : 0
    const se = m[4] ? parseFloat(m[4].replace(',', '.')) : 0
    let v = Math.abs(d) + mi / 60 + se / 3600
    const h = (m[1] || m[5] || '').toUpperCase()
    if (d < 0 || h === 'S' || h === 'W' || h === 'O') v = -v
    parts.push({ v, h })
  }
  if (parts.length === 2) {
    let [a, b] = parts
    if ('EWO'.includes(a.h) && a.h && 'NS'.includes(b.h) && b.h) [a, b] = [b, a]
    return valid(a.v, b.v)
  }
  return null
}

function valid(lat: number, lng: number): Position | null {
  if (!isFinite(lat) || !isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

// ── Position GPS du téléphone ────────────────────────────────────────────────
/**
 * Écoute le GPS quelques secondes et garde la mesure la plus précise.
 * Se termine dès que la précision atteint `cible` m, ou après `timeoutMs`.
 */
export function positionPrecise(
  onProgress?: (p: Position) => void,
  cible = 10,
  timeoutMs = 15000,
): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('La géolocalisation n’est pas disponible sur cet appareil.'))
      return
    }
    let best: Position | null = null
    let fini = false
    const stop = (err?: Error) => {
      if (fini) return
      fini = true
      navigator.geolocation.clearWatch(id)
      clearTimeout(t)
      if (best) resolve(best)
      else reject(err || new Error('Position introuvable. Vérifiez que la localisation est activée.'))
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const cur = { lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }
        if (!best || (cur.precision ?? 9e9) <= (best.precision ?? 9e9)) best = cur
        onProgress?.(best)
        if ((best.precision ?? 9e9) <= cible) stop()
      },
      (e) => {
        const msg = e.code === 1
          ? 'Accès à la position refusé. Autorisez la localisation pour ce site dans le navigateur.'
          : 'Position introuvable. Vérifiez que la localisation (GPS) est activée.'
        if (!best) stop(new Error(msg))
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    )
    const t = setTimeout(() => stop(), timeoutMs)
  })
}

// ── Adresse automatique (géocodage inverse) ──────────────────────────────────
export interface Adresse { adresse: string | null; commune: string | null; code_postal: string | null }

/** Base Adresse Nationale (IGN Géoplateforme), puis OpenStreetMap en secours. */
export async function adresseDe(lat: number, lng: number): Promise<Adresse> {
  try {
    const r = await fetch(`https://data.geopf.fr/geocodage/reverse?lon=${lng}&lat=${lat}&index=address&limit=1`)
    if (r.ok) {
      const j = await r.json()
      const f = j?.features?.[0]
      if (f && (f.properties?.distance ?? 0) < 1500) {
        const p = f.properties
        const rue = p.type === 'municipality' ? null : (p.name || null)
        return { adresse: rue, commune: p.city || null, code_postal: p.postcode || null }
      }
    }
  } catch { /* on tente le secours */ }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=fr`)
    if (r.ok) {
      const j = await r.json()
      const a = j?.address || {}
      const rue = [a.house_number, a.road || a.hamlet || a.locality].filter(Boolean).join(' ') || null
      return {
        adresse: rue,
        commune: a.village || a.town || a.city || a.municipality || null,
        code_postal: a.postcode || null,
      }
    }
  } catch { /* */ }
  return { adresse: null, commune: null, code_postal: null }
}

// ── Ouvrir dans une appli GPS ────────────────────────────────────────────────
export function liensGps(lat: number, lng: number, nom: string) {
  const ll = `${lat},${lng}`
  return {
    waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
    apple: `https://maps.apple.com/?daddr=${ll}&q=${encodeURIComponent(nom)}`,
    // Android : ouvre le sélecteur d'applis (Maps, Waze, Magic Earth, Organic Maps…)
    geo: `geo:${ll}?q=${ll}(${encodeURIComponent(nom)})`,
  }
}

export function plateforme(): 'ios' | 'android' | 'autre' {
  if (typeof navigator === 'undefined') return 'autre'
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'autre'
}

// ── Détection des doublons ───────────────────────────────────────────────────
const MOTS_VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'a', 'au', 'aux'])

export function normaliser(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !MOTS_VIDES.has(w))
    .join(' ')
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** Noms « quasiment identiques » : égalité, inclusion, ou ≥ 80 % de ressemblance. */
export function nomsProches(a: string, b: string): boolean {
  const x = normaliser(a)
  const y = normaliser(b)
  if (!x || !y) return false
  if (x === y) return true
  // « Forage 1 » ≠ « Forage 2 » : des numéros différents = sites différents
  const nums = (t: string) => (t.match(/\d+/g) || []).map((n) => String(parseInt(n, 10))).sort().join(',')
  if (nums(x) !== nums(y)) return false
  if (x.replace(/ /g, '') === y.replace(/ /g, '')) return true
  const [c, l] = x.length <= y.length ? [x, y] : [y, x]
  if (c.length >= 4 && (` ${l} `).includes(` ${c} `)) return true
  const ratio = 1 - levenshtein(x, y) / Math.max(x.length, y.length)
  return ratio >= 0.8
}

/** Rayon dans lequel un point existant est considéré « au même endroit » (tous clients) */
export const SEUIL_DOUBLON_M = 100

export interface Doublon { point: CartePoint; distance: number; raison: string; memeClient: boolean }

/**
 * Doublons possibles d'un nouveau point (tous clients confondus) :
 * - un point à moins de 100 m ;
 * - ou un point qui porte le même nom (ou un nom quasi identique).
 */
export function chercherDoublons(
  nouveau: { nom: string; lat: number; lng: number; client_id: string },
  points: CartePoint[],
  ignorerId?: string,
): Doublon[] {
  const res: Doublon[] = []
  const n = normaliser(nouveau.nom).replace(/ /g, '')
  for (const p of points) {
    if (p.id === ignorerId) continue
    const d = distanceM(nouveau, p)
    const memeNom = !!n && normaliser(p.nom).replace(/ /g, '') === n
    const proche = memeNom || nomsProches(nouveau.nom, p.nom)
    const ici = d <= SEUIL_DOUBLON_M
    if (!proche && !ici) continue
    const raisons = []
    if (memeNom) raisons.push('même nom')
    else if (proche) raisons.push('nom quasi identique')
    if (ici) raisons.push('au même endroit')
    res.push({ point: p, distance: d, raison: raisons.join(' · '), memeClient: p.client_id === nouveau.client_id })
  }
  // Les plus probables d'abord : même nom ET même endroit, puis même client, puis le plus proche
  const score = (x: Doublon) => (x.raison.includes('nom') ? 2 : 0) + (x.distance <= SEUIL_DOUBLON_M ? 2 : 0) + (x.memeClient ? 1 : 0)
  return res.sort((a, b) => score(b) - score(a) || a.distance - b.distance)
}

// ── Couleur par client ───────────────────────────────────────────────────────
const PALETTE = ['#d42d28', '#1d6fd6', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4d7c0f', '#b45309', '#475569']
export function couleurClient(clientId: string, ordre: string[]): string {
  const i = ordre.indexOf(clientId)
  if (i >= 0) return PALETTE[i % PALETTE.length]
  let h = 0
  for (const ch of clientId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}
