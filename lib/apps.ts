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
 * - Le compte de direction (Gestion ELECTREAU) voit toutes les applis.
 * - Les autres comptes : liste explicite ci-dessous.
 * Par défaut (compte non listé), accès à toutes les applis pour ne bloquer
 * personne pendant le déploiement — à restreindre une fois les rôles définis.
 *
 * NB : étape suivante prévue = stocker ces droits dans Supabase + écran admin
 * pour que la direction les gère sans toucher au code.
 */
const ACCESS: Record<string, string[]> = {
  // Exemple de restriction (à ajuster) :
  // 'Maxime Morel': ['stock'],
  // 'Loic Jaquet': ['bon_intervention'],
}

export function appsFor(nom: string | null): AppDef[] {
  if (!nom) return []
  if (nom === COMPTE_GESTION) return APPS // direction = accès complet
  const allowed = ACCESS[nom]
  if (!allowed) return APPS // défaut : tout, le temps du déploiement
  return APPS.filter((a) => allowed.includes(a.id))
}

export function canAccess(nom: string | null, appId: string): boolean {
  return appsFor(nom).some((a) => a.id === appId)
}
