-- ============================================
-- Electreau — Gestion de stock électrique
-- Schéma Supabase
-- Exécuter dans l'éditeur SQL de Supabase
-- ============================================

-- Table des composants électriques
CREATE TABLE IF NOT EXISTS components (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  component_type text,          -- ex: "disjoncteur", "contacteur" (pour la recherche)
  reference text,               -- référence fabricant
  quantity int DEFAULT 0 CHECK (quantity >= 0),
  threshold int DEFAULT 0 CHECK (threshold >= 0),
  url text,                     -- lien produit fournisseur
  storage_location text,        -- ex: "Étagère A / Bac 3"
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table des mouvements de stock
CREATE TABLE IF NOT EXISTS movements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  component_id uuid REFERENCES components(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('in', 'out')),
  quantity int NOT NULL CHECK (quantity > 0),
  person_name text,             -- qui a fait le mouvement
  chantier_ref text,            -- référence du chantier
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Trigger : mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS components_updated_at ON components;
CREATE TRIGGER components_updated_at
  BEFORE UPDATE ON components
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Index pour la recherche
CREATE INDEX IF NOT EXISTS idx_components_name ON components USING gin(to_tsvector('french', name));
CREATE INDEX IF NOT EXISTS idx_components_type ON components (component_type);
CREATE INDEX IF NOT EXISTS idx_movements_component ON movements (component_id);
CREATE INDEX IF NOT EXISTS idx_movements_date ON movements (created_at DESC);

-- RLS : accès public en lecture/écriture (pas d'auth pour l'instant)
ALTER TABLE components ENABLE ROW LEVEL SECURITY;
ALTER TABLE movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accès public components" ON components FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Accès public movements" ON movements FOR ALL USING (true) WITH CHECK (true);

-- Données de démonstration (supprimer avant mise en production)
INSERT INTO components (name, component_type, reference, quantity, threshold, storage_location) VALUES
  ('Disjoncteur 2A unipolaire', 'disjoncteur', 'DPN 2A', 3, 5, 'Étagère A / Bac 1'),
  ('Disjoncteur 10A bipolaire', 'disjoncteur', 'DPN 10A', 8, 4, 'Étagère A / Bac 2'),
  ('Contacteur 25A 4P', 'contacteur', 'LC1D25', 2, 3, 'Étagère B / Bac 1'),
  ('Relais temporisateur 230V', 'relais', 'RE7TL11BU', 5, 2, 'Étagère B / Bac 3'),
  ('Câble HO7VR 2,5mm²', 'câble', NULL, 45, 10, 'Dévidoir 1'),
  ('Bornier connexion 4mm²', 'bornier', 'UK 4N', 120, 20, 'Étagère C / Bac 2')
ON CONFLICT DO NOTHING;
