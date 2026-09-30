export interface CarteClient {
  id: string
  nom: string
  created_by?: string | null
  created_at?: string
}

export interface CartePhoto { path: string; url: string }

export type SourcePos = 'gps' | 'saisie' | 'carte'

export interface CartePoint {
  id: string
  client_id: string
  nom: string
  lat: number
  lng: number
  precision_m?: number | null
  source: SourcePos
  commentaire?: string | null
  photos: CartePhoto[]
  adresse?: string | null
  commune?: string | null
  code_postal?: string | null
  created_by?: string | null
  created_at?: string
  updated_by?: string | null
  updated_at?: string
}

export interface Position { lat: number; lng: number; precision?: number | null }
