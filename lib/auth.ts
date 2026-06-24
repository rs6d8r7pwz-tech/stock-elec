import { supabase } from './supabase'

/**
 * Authentification centralisée du Portail Electreau.
 * Réutilise les mêmes fonctions RPC Supabase que l'app bon-intervention
 * (tech_status / tech_set_password / tech_login), donc les comptes et
 * mots de passe existants continuent de fonctionner sans réinitialisation.
 */

export const SESSION_KEY = 'electreau_session_v1' // identique à bon-intervention
export const SESSION_TS_KEY = 'electreau_session_ts'
export const COMPTE_GESTION = 'Gestion ELECTREAU'

// Délai d'inactivité avant déconnexion automatique : 30 minutes
export const INACTIVITY_MS = 30 * 60 * 1000

// Liste des comptes (techniciens + compte direction)
export const TECHNICIENS = [
  'François Armanet',
  'Loic Jaquet',
  'Maxime Morel',
  'Romain Durand',
  'Jerome Boulud',
  'Bastien Brochier',
  'Richard Besson',
  'Richard Marrel',
]

export const COMPTES = [...TECHNICIENS, COMPTE_GESTION]

// ── Appels d'authentification (RPC Supabase) ───────────────────────────────

/** Le compte a-t-il déjà défini un mot de passe ? */
export async function authStatus(nom: string): Promise<{ initialise: boolean }> {
  const { data, error } = await supabase.rpc('tech_status', { p_nom: nom })
  if (error) throw new Error(error.message)
  const r = Array.isArray(data) ? data[0] : data
  return { initialise: !!(r && (r as any).initialise) }
}

/** Définit le mot de passe (1re connexion). true si OK. */
export async function authSetPassword(nom: string, pwd: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('tech_set_password', { p_nom: nom, p_pwd: pwd })
  if (error) throw new Error(error.message)
  return data === true
}

/** Vérifie le mot de passe. true si correct. */
export async function authLogin(nom: string, pwd: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('tech_login', { p_nom: nom, p_pwd: pwd })
  if (error) throw new Error(error.message)
  return data === true
}

// ── Session (localStorage, partagée sur le même domaine) ────────────────────

// Source de vérité de la session = sessionStorage : il est effacé quand l'onglet/
// le navigateur est fermé → l'utilisateur doit se reconnecter. Un rechargement de
// l'onglet conserve la session. On garde un miroir dans localStorage pour que
// l'app Bon Intervention (servie en iframe, même origine) retrouve l'utilisateur.
export function sessionLoad(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(SESSION_KEY)
}

export function sessionSave(nom: string) {
  sessionStorage.setItem(SESSION_KEY, nom)
  localStorage.setItem(SESSION_KEY, nom) // miroir pour l'iframe Bon Intervention
  touchSession()
}

export function sessionClear() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(SESSION_TS_KEY)
}

/** Met à jour l'horodatage de dernière activité. */
export function touchSession() {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_TS_KEY, String(Date.now()))
}

/** La session a-t-elle dépassé le délai d'inactivité ? */
export function sessionExpired(): boolean {
  if (typeof window === 'undefined') return false
  const ts = parseInt(localStorage.getItem(SESSION_TS_KEY) || '0', 10)
  if (!ts) return false
  return Date.now() - ts > INACTIVITY_MS
}

export function isGestion(nom: string | null): boolean {
  return nom === COMPTE_GESTION
}
