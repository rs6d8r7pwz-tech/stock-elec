import { COMPTE_GESTION } from './auth'

/**
 * Registre des applications du portail.
 * Pour ajouter une appli plus tard : ajouter une entrée ici + la route.
 */
export interface AppDef {
  id: string
  label: string
  description: string
  href: string
  emoji: string
  /** variable CSS de couleur d'accent */
  accent: string
  /** true = page interne au portail / false = appli encore externe */
  ready: boolean
}

export const APPS: AppDef[] = [
  {
    id: 'bon_intervention',
    label: "Bon d'intervention",
    description: 'Créer, valider et archiver les bons de fin de journée.',
    href: '/bon-intervention',
    emoji: '📋',
    accent: 'var(--blue)',
    ready: true,
  },
  {
    id: 'stock',
    label: 'Gestion de stock',
    description: 'Stock matériel élec, alertes seuil bas et bons de commande.',
    href: '/stock',
    emoji: '📦',
    accent: 'var(--red)',
    ready: true,
  },
  {
    id: 'notes_frais',
    label: 'Notes de frais',
    description: 'Envoyer une note de frais (photo → PDF) et suivre sa validation.',
    href: '/notes-frais',
    emoji: '🧾',
    accent: 'var(--navy)',
    ready: true,
  },
]

/**
 * Droits d'accès par compte.
 * - Gestion ELECTREAU (direction) voit toutes les applis.
 * - Stock : Gestion, Romain Durand, Jerome Boulud, Richard Marrel.
 * - Bon Intervention : tout le monde SAUF Richard Marrel.
 * - Un compte non listé n'a accès à rien (sécurité par défaut).
 */
// Note : 'notes_frais' est accessible à tous les comptes.
const ACCESS: Record<string, string[]> = {
  'Romain Durand':    ['bon_intervention', 'stock', 'notes_frais'],
  'Jerome Boulud':    ['bon_intervention', 'stock', 'notes_frais'],
  'Richard Marrel':   ['stock', 'notes_frais'],
  'François Armanet': ['bon_intervention', 'notes_frais'],
  'Loic Jaquet':      ['bon_intervention', 'notes_frais'],
  'Maxime Morel':     ['bon_intervention', 'notes_frais'],
  'Bastien Brochier': ['bon_intervention', 'notes_frais'],
  'Richard Besson':   ['bon_intervention', 'notes_frais'],
}

export function appsFor(nom: string | null): AppDef[] {
  if (!nom) return []
  if (nom === COMPTE_GESTION) return APPS // direction = accès complet
  const allowed = ACCESS[nom] || [] // non listé = aucun accès
  return APPS.filter((a) => allowed.includes(a.id))
}

export function canAccess(nom: string | null, appId: string): boolean {
  return appsFor(nom).some((a) => a.id === appId)
}
