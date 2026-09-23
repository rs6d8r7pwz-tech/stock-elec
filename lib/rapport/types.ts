// Types de l'application « Rapport » (relevés d'exploitation chez les clients)

export type FieldKind =
  | 'heures'      // compteur horaire (index cumulé)
  | 'demarrages'  // compteur de démarrages (index cumulé)
  | 'allumages'   // compteur d'allumages lampes UV (index cumulé)
  | 'index_m3'    // index compteur volume (cumulé)
  | 'intensite'   // A
  | 'isolement'   // MΩ
  | 'pression'    // bar
  | 'chlore_mgl'  // mg/l
  | 'chlore_gh'   // g/h (réglage / taux de chloration)
  | 'turbidite'   // NTU
  | 'uv_pct'      // %
  | 'uv_wm2'      // W/m²
  | 'debit'       // m³/h
  | 'javel_l'     // l
  | 'nombre'      // valeur numérique libre
  | 'texte'       // texte libre

export interface FieldDef {
  key: string
  section: string
  label: string
  kind: FieldKind
  unit: string
}

export interface SiteDef {
  id: string
  commune: string
  nom: string
  description: string
  infos: string[][] // [["Télégestion", "SOFREL S550"], ...]
  fields: FieldDef[]
}

export interface ClientDef {
  id: string
  code: string
  nom: string
  service: string
  sites: SiteDef[]
}

/** Valeur saisie : nombre, ou code texte ('INF' = isolement infini, 'HS', 'LO'), ou texte libre */
export type Valeur = number | string

export interface PhotoRef {
  id: string
  path?: string
  url?: string
}

export interface Releve {
  id: string
  tournee_id: string | null
  client: string
  site_id: string
  date_releve: string // ISO
  valeurs: Record<string, Valeur>
  passes: string[]
  observations: string
  photos: PhotoRef[]
  saisi_par: string
  saved_at: string
  source?: string
  _dirty?: boolean
  _rang?: number // position chronologique (calculée localement, jamais envoyée)
}

export interface Tournee {
  id: string
  client: string
  statut: 'en_cours' | 'cloturee'
  created_by: string
  created_at: string
  cloturee_by?: string | null
  cloturee_at?: string | null
  pdf_path?: string | null
  pdf_url?: string | null
  pdf_at?: string | null     // date de la dernière génération du PDF
  modifie_at?: string | null // dernière modification après clôture
  _dirty?: boolean
  _new?: boolean // jamais encore envoyée au serveur
}

export type Niveau = 'ok' | 'info' | 'warn' | 'crit'

export interface Evaluation {
  niveau: Niveau
  messages: string[]
  diff?: number
  parJour?: number
  precedent?: { valeur: Valeur; date: string }
}

export interface Brouillon {
  site_id: string
  date_releve: string
  valeurs: Record<string, Valeur>
  passes: string[]
  observations: string
  photos: PhotoRef[]
  step: number
  fromRecap?: boolean
  releve_id?: string
}
