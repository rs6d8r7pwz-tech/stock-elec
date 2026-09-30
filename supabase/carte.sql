-- ============================================================
-- Carte ELECTReau (points GPS des sites clients) — Portail Electreau
-- À exécuter UNE FOIS dans Supabase : SQL Editor > coller > Run
-- (ré-exécutable sans risque)
-- ============================================================

create table if not exists carte_clients (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  created_by  text,
  created_at  timestamptz not null default now()
);
create unique index if not exists carte_clients_nom_uidx on carte_clients (lower(nom));

create table if not exists carte_points (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references carte_clients(id) on delete restrict,
  nom          text not null,                         -- nom du site
  lat          double precision not null,
  lng          double precision not null,
  precision_m  real,                                  -- précision GPS (m) si position actuelle
  source       text not null default 'gps',           -- gps | saisie | carte
  commentaire  text,
  photos       jsonb not null default '[]'::jsonb,    -- [{ "path": "...", "url": "..." }]
  adresse      text,                                  -- rempli automatiquement (géocodage inverse)
  commune      text,
  code_postal  text,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_by   text,
  updated_at   timestamptz not null default now()
);
create index if not exists carte_points_client_idx on carte_points(client_id);
create index if not exists carte_points_latlng_idx on carte_points(lat, lng);

alter table carte_clients enable row level security;
alter table carte_points  enable row level security;
drop policy if exists "anon_all_cc" on carte_clients;
drop policy if exists "auth_all_cc" on carte_clients;
drop policy if exists "anon_all_cp" on carte_points;
drop policy if exists "auth_all_cp" on carte_points;
create policy "anon_all_cc" on carte_clients for all to anon using (true) with check (true);
create policy "auth_all_cc" on carte_clients for all to authenticated using (true) with check (true);
create policy "anon_all_cp" on carte_points  for all to anon using (true) with check (true);
create policy "auth_all_cp" on carte_points  for all to authenticated using (true) with check (true);

-- Clients de départ
insert into carte_clients (nom, created_by) values ('CCBE AEP', 'Gestion ELECTREAU')
  on conflict do nothing;
insert into carte_clients (nom, created_by) values ('CCBE EU', 'Gestion ELECTREAU')
  on conflict do nothing;

-- Photos des sites
insert into storage.buckets (id, name, public) values ('carte', 'carte', true)
  on conflict (id) do nothing;
drop policy if exists "carte_read"   on storage.objects;
drop policy if exists "carte_insert" on storage.objects;
drop policy if exists "carte_update" on storage.objects;
drop policy if exists "carte_delete" on storage.objects;
create policy "carte_read"   on storage.objects for select to anon, authenticated using (bucket_id = 'carte');
create policy "carte_insert" on storage.objects for insert to anon, authenticated with check (bucket_id = 'carte');
create policy "carte_update" on storage.objects for update to anon, authenticated using (bucket_id = 'carte');
create policy "carte_delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'carte');
