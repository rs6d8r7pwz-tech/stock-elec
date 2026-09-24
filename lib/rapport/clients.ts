import type { ClientDef } from './types'
import { CCBE_AEP } from './ccbe'
import { CCBE_EU } from './ccbe_eu'

/**
 * Clients disposant d'un contrat de relevés.
 * Pour ajouter un client : créer un fichier de config (comme ccbe.ts) et l'ajouter ici.
 */
export const CLIENTS: ClientDef[] = [CCBE_AEP, CCBE_EU]

export function getClient(id: string): ClientDef | undefined {
  return CLIENTS.find((c) => c.id === id)
}
