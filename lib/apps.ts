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
]

/**
 * Droits d'accès par compte.
 * - Gestion ELECTREAU (direction) voit toutes les applis.
 * - Stock : Gestion, Romain Durand, Jerome Boulud, Richard Marrel.
 * - Bon Intervention : tout le monde SAUF Richard Marrel.
 * - Un compte non listé n'a accès à rien (sécurité par défaut).
 */
const ACCESS: Record<string, string[]> = {
  'Romain Durand':    ['bon_intervention', 'stock'],
  'Jerome Boulud':    ['bon_intervention', 'stock'],
  'Richard Marrel':   ['stock'],
  'François Armanet': ['bon_intervention'],
  'Loic Jaquet':      ['bon_intervention'],
  'Maxime Morel':     ['bon_intervention'],
  'Bastien Brochier': ['bon_intervention'],
  'Richard Besson':   ['bon_intervention'],
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
