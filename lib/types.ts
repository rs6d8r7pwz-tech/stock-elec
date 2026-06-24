export interface Composant {
  id: string
  name: string
  component_type: string | null
  reference: string | null
  quantity: number
  threshold: number
  url: string | null
  storage_location: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Mouvement {
  id: string
  component_id: string
  movement_type: 'in' | 'out'
  quantity: number
  person_name: string | null
  chantier_ref: string | null
  notes: string | null
  created_at: string
  composant?: Composant
}

export interface LigneCommande {
  composant: Composant
  quantite_a_commander: number
  manuel: boolean // true = ajouté manuellement, false = auto (sous seuil)
}

// Ligne d'une demande d'achat enregistrée (snapshot au moment de la commande)
export interface CommandeLine {
  component_id: string
  name: string
  component_type: string | null
  reference: string | null
  url: string | null
  quantity: number   // quantité commandée
  stock: number      // stock au moment de la commande
  threshold: number
}

export type StatutCommande = 'a_commander' | 'livraison_en_cours' | 'finalisee'

export interface PurchaseOrder {
  id: string
  reference: string
  status: StatutCommande
  lines: CommandeLine[]
  total_pieces: number
  created_at: string
  created_by: string | null
  ordered_at: string | null
  ordered_by: string | null
  finalized_at: string | null
  finalized_by: string | null
}
