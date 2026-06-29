-- ============================================================
-- Notes de frais — Portail Electreau
-- À exécuter dans Supabase : SQL Editor > coller > Run
-- ============================================================

create table if not exists notes_frais (
  id          uuid primary key default gen_random_uuid(),
  sender      text not null,                  -- qui a envoyé la note
  concerned   text[] not null default '{}',   -- personnes concernées
  montant     numeric,                        -- optionnel
  objet       text,                           -- optionnel (ex: "Resto chantier X")
  pdf_path    text not null,
  pdf_url     text not null,
  status      text not null default 'en_attente',  -- en_attente | classee
  created_at  timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz
);

create index if not exists notes_frais_created_idx on notes_frais(created_at desc);

alter table notes_frais enable row level security;
create policy "anon_all_nf" on notes_frais for all to anon using (true) with check (true);
create policy "auth_all_nf" on notes_frais for all to authenticated using (true) with check (true);

-- Stockage des PDF des notes de frais
insert into storage.buckets (id, name, public) values ('notes-frais', 'notes-frais', true)
  on conflict (id) do nothing;
create policy "nf_read"   on storage.objects for select to anon, authenticated using (bucket_id = 'notes-frais');
create policy "nf_insert" on storage.objects for insert to anon, authenticated with check (bucket_id = 'notes-frais');
create policy "nf_delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'notes-frais');
