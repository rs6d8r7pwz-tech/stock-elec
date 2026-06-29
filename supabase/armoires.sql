-- ============================================================
-- Module Armoires & QR — Portail Electreau
-- Fiches armoires/stations + documents PDF, partagés via QR code (accès public).
-- À exécuter dans Supabase : SQL Editor > coller > Run
-- ============================================================

create table if not exists armoires (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,   -- identifiant public (dans l'URL du QR)
  name        text not null,
  client      text,
  location    text,
  notes       text,
  created_at  timestamptz not null default now(),
  created_by  text
);

create table if not exists armoire_documents (
  id          uuid primary key default gen_random_uuid(),
  armoire_id  uuid not null references armoires(id) on delete cascade,
  title       text not null,
  file_path   text not null,
  file_url    text not null,
  created_at  timestamptz not null default now()
);

create index if not exists armoires_token_idx on armoires(token);
create index if not exists armoire_documents_armoire_idx on armoire_documents(armoire_id);

-- Accès via la clé anon (lecture publique pour le QR + gestion interne)
alter table armoires enable row level security;
alter table armoire_documents enable row level security;
create policy "anon_all_armoires" on armoires for all to anon using (true) with check (true);
create policy "auth_all_armoires" on armoires for all to authenticated using (true) with check (true);
create policy "anon_all_armoire_docs" on armoire_documents for all to anon using (true) with check (true);
create policy "auth_all_armoire_docs" on armoire_documents for all to authenticated using (true) with check (true);

-- Stockage des PDF : bucket public
insert into storage.buckets (id, name, public) values ('armoire-docs', 'armoire-docs', true)
  on conflict (id) do nothing;
create policy "armoire_docs_read"   on storage.objects for select to anon, authenticated using (bucket_id = 'armoire-docs');
create policy "armoire_docs_insert" on storage.objects for insert to anon, authenticated with check (bucket_id = 'armoire-docs');
create policy "armoire_docs_delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'armoire-docs');
