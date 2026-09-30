'use client'
import { supabase } from '@/lib/supabase'
import type { CarteClient, CartePhoto, CartePoint } from './types'

// Cache local (lecture hors-ligne de la dernière liste connue)
const CACHE_KEY = 'electreau_carte_cache_v1'

export interface Donnees { clients: CarteClient[]; points: CartePoint[]; horsLigne?: boolean }

export async function chargerTout(): Promise<Donnees> {
  try {
    const [c, p] = await Promise.all([
      supabase.from('carte_clients').select('*').order('nom'),
      supabase.from('carte_points').select('*').order('nom'),
    ])
    if (c.error) throw c.error
    if (p.error) throw p.error
    const d: Donnees = {
      clients: (c.data || []) as CarteClient[],
      points: ((p.data || []) as CartePoint[]).map((x) => ({ ...x, photos: Array.isArray(x.photos) ? x.photos : [] })),
    }
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)) } catch { /* quota */ }
    return d
  } catch (e) {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) return { ...(JSON.parse(raw) as Donnees), horsLigne: true }
    } catch { /* */ }
    throw e
  }
}

export async function creerClient(nom: string, par: string): Promise<CarteClient> {
  const propre = nom.trim().replace(/\s+/g, ' ')
  const { data, error } = await supabase.from('carte_clients').insert({ nom: propre, created_by: par }).select().single()
  if (error) {
    if ((error as any).code === '23505') throw new Error(`Le client « ${propre} » existe déjà.`)
    throw new Error(error.message)
  }
  return data as CarteClient
}

export type PointSaisi = Omit<CartePoint, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'>

export async function creerPoint(p: PointSaisi, par: string): Promise<CartePoint> {
  const { data, error } = await supabase
    .from('carte_points')
    .insert({ ...p, created_by: par, updated_by: par })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as CartePoint
}

export async function modifierPoint(id: string, p: Partial<PointSaisi>, par: string): Promise<CartePoint> {
  const { data, error } = await supabase
    .from('carte_points')
    .update({ ...p, updated_by: par, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as CartePoint
}

export async function supprimerPoint(p: CartePoint) {
  const { error } = await supabase.from('carte_points').delete().eq('id', p.id)
  if (error) throw new Error(error.message)
  const paths = (p.photos || []).map((ph) => ph.path).filter(Boolean)
  if (paths.length) await supabase.storage.from('carte').remove(paths).catch(() => {})
}

function dataUrlToBlob(d: string): Blob {
  const [h, b] = d.split(',')
  const mime = h.match(/:(.*?);/)?.[1] || 'image/jpeg'
  const bin = atob(b)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return new Blob([u], { type: mime })
}

export async function envoyerPhoto(dataUrl: string): Promise<CartePhoto> {
  const id = (crypto as any).randomUUID ? (crypto as any).randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)
  const path = `points/${new Date().toISOString().slice(0, 7)}/${id}.jpg`
  const up = await supabase.storage.from('carte').upload(path, dataUrlToBlob(dataUrl), { contentType: 'image/jpeg', upsert: true })
  if (up.error) throw new Error('Envoi de la photo impossible : ' + up.error.message)
  return { path, url: supabase.storage.from('carte').getPublicUrl(path).data.publicUrl }
}

export async function supprimerPhotos(paths: string[]) {
  if (paths.length) await supabase.storage.from('carte').remove(paths).catch(() => {})
}
