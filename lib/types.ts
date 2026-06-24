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
