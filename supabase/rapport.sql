-- ============================================================
-- Rapport (relevés d'exploitation clients) — Portail Electreau
-- À exécuter UNE FOIS dans Supabase : SQL Editor > coller > Run
-- (ré-exécutable sans risque)
-- ============================================================

-- Une tournée = un passage complet chez un client (peut durer plusieurs jours)
create table if not exists rapport_tournees (
  id           uuid primary key,
  client       text not null,                       -- ex : 'ccbe_aep'
  statut       text not null default 'en_cours',    -- en_cours | cloturee
  created_by   text,
  created_at   timestamptz not null default now(),
  cloturee_by  text,
  cloturee_at  timestamptz,
  pdf_path     text,
  pdf_url      text,
  pdf_at       timestamptz,                         -- dernière génération du PDF
  modifie_at   timestamptz,                         -- dernière modification après clôture
  updated_at   timestamptz not null default now()
);
alter table rapport_tournees add column if not exists pdf_at timestamptz;
alter table rapport_tournees add column if not exists modifie_at timestamptz;
create index if not exists rapport_tournees_client_idx on rapport_tournees(client, created_at desc);

-- Un relevé = les valeurs saisies sur un ouvrage lors d'une tournée
-- (tournee_id null = historique importé depuis l'ancien fichier Excel)
create table if not exists rapport_releves (
  id           uuid primary key,
  tournee_id   uuid references rapport_tournees(id) on delete cascade,
  client       text not null,
  site_id      text not null,
  date_releve  timestamptz not null,                -- date/heure indiquée par le technicien
  valeurs      jsonb not null default '{}'::jsonb,  -- { "g1_h": 18722, "g1_isol": "INF", ... }
  passes       text[] not null default '{}',        -- points volontairement passés
  observations text,
  photos       jsonb not null default '[]'::jsonb,  -- [{ "id": "...", "path": "...", "url": "..." }]
  saisi_par    text,
  saved_at     timestamptz not null default now(),  -- date/heure d'enregistrement
  source       text not null default 'app',         -- app | import_excel_2024
  updated_at   timestamptz not null default now()
);
create index if not exists rapport_releves_site_idx on rapport_releves(client, site_id, date_releve desc);
create index if not exists rapport_releves_tournee_idx on rapport_releves(tournee_id);

alter table rapport_tournees enable row level security;
alter table rapport_releves  enable row level security;
drop policy if exists "anon_all_rt" on rapport_tournees;
drop policy if exists "auth_all_rt" on rapport_tournees;
drop policy if exists "anon_all_rr" on rapport_releves;
drop policy if exists "auth_all_rr" on rapport_releves;
create policy "anon_all_rt" on rapport_tournees for all to anon using (true) with check (true);
create policy "auth_all_rt" on rapport_tournees for all to authenticated using (true) with check (true);
create policy "anon_all_rr" on rapport_releves  for all to anon using (true) with check (true);
create policy "auth_all_rr" on rapport_releves  for all to authenticated using (true) with check (true);

-- Stockage des photos de relevé et des rapports PDF
insert into storage.buckets (id, name, public) values ('rapport', 'rapport', true)
  on conflict (id) do nothing;
drop policy if exists "rapport_read"   on storage.objects;
drop policy if exists "rapport_insert" on storage.objects;
drop policy if exists "rapport_update" on storage.objects;
drop policy if exists "rapport_delete" on storage.objects;
create policy "rapport_read"   on storage.objects for select to anon, authenticated using (bucket_id = 'rapport');
create policy "rapport_insert" on storage.objects for insert to anon, authenticated with check (bucket_id = 'rapport');
create policy "rapport_update" on storage.objects for update to anon, authenticated using (bucket_id = 'rapport');
create policy "rapport_delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'rapport');
