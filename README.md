# ⚡ Electreau — Gestion de stock électrique

Application web de gestion de stock de matériel électrique pour câbleurs d'armoires.

## Fonctionnalités

- **Stock complet** avec recherche intelligente par type (ex: taper "disjoncteur" retrouve tous les disjoncteurs)
- **Alertes seuil** : page dédiée aux articles sous le seuil minimum
- **Mouvements +/−** : boutons avec sélecteur de quantité, nom de personne et référence chantier
- **Bon de commande PDF** : générateur avec auto-remplissage des articles en alerte, ajout manuel, quantités éditables
- **Historique** des 200 derniers mouvements
- Branding **⚡ ELECTREAU** (bleu #1e50a0)

## Stack

- [Next.js 14](https://nextjs.org) (App Router)
- [Supabase](https://supabase.com) (PostgreSQL)
- [Tailwind CSS](https://tailwindcss.com)
- [jsPDF](https://github.com/parallax/jsPDF) + [jspdf-autotable](https://github.com/simonbengtsson/jsPDF-AutoTable)

---

## Déploiement

### 1. Supabase

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Aller dans **SQL Editor** et exécuter le contenu de `supabase/schema.sql`
3. Dans **Project Settings → API**, copier :
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. GitHub

```bash
git init
git add .
git commit -m "init: stock-elec Electreau"
git remote add origin https://github.com/TON_COMPTE/stock-elec.git
git push -u origin main
```

### 3. Vercel

1. Importer le repo sur [vercel.com](https://vercel.com)
2. Dans **Settings → Environment Variables**, ajouter :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Déployer

### 4. En local

```bash
cp .env.example .env.local
# Remplir les valeurs Supabase dans .env.local
npm install
npm run dev
# Ouvrir http://localhost:3000
```

---

## Structure du projet

```
stock-elec/
├── app/
│   ├── layout.tsx          # Layout global + Navbar
│   ├── page.tsx            # Dashboard
│   ├── stock/page.tsx      # Stock complet
│   ├── alertes/page.tsx    # Articles sous seuil
│   ├── commande/page.tsx   # Générateur de bon de commande PDF
│   ├── historique/page.tsx # Historique des mouvements
│   └── composant/
│       ├── nouveau/page.tsx    # Ajouter un composant
│       └── [id]/page.tsx       # Fiche détail / édition
├── components/
│   ├── Navbar.tsx          # Navigation Electreau
│   ├── SearchBar.tsx       # Barre de recherche
│   └── StockAdjuster.tsx   # Boutons +/- avec modal
├── lib/
│   ├── supabase.ts         # Client Supabase
│   ├── types.ts            # Types TypeScript
│   └── utils.ts            # Utilitaires
└── supabase/
    └── schema.sql          # Schéma de base de données
```

## Notes

- Les données de démo dans `schema.sql` peuvent être supprimées (section `INSERT INTO` en bas du fichier)
- Pas d'authentification pour l'instant — l'accès est libre via l'URL
- L'application utilise jsPDF en import dynamique côté client pour la génération PDF
