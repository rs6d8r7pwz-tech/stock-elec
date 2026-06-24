-- ============================================================
-- Demandes d'achat (commandes de matériel) — Portail Electreau / Stock
-- À exécuter dans Supabase : SQL Editor > coller > Run
-- ============================================================

create table if not exists purchase_orders (
  id           uuid primary key default gen_random_uuid(),
  reference    text not null,
  status       text not null default 'a_commander', -- a_commander | livraison_en_cours | finalisee
  lines        jsonb not null default '[]'::jsonb,   -- [{component_id, name, reference, quantity, stock, threshold, url}]
  total_pieces int  not null default 0,
  created_at   timestamptz not null default now(),
  created_by   text,
  ordered_at   timestamptz,
  ordered_by   text,
  finalized_at timestamptz,
  finalized_by text
);

create index if not exists purchase_orders_status_idx on purchase_orders (status);
create index if not exists purchase_orders_created_idx on purchase_orders (created_at desc);

-- Accès via la clé anon de l'app (même modèle que components/movements)
alter table purchase_orders enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'purchase_orders' and policyname = 'anon_all_purchase_orders') then
    create policy "anon_all_purchase_orders" on purchase_orders for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'purchase_orders' and policyname = 'auth_all_purchase_orders') then
    create policy "auth_all_purchase_orders" on purchase_orders for all to authenticated using (true) with check (true);
  end if;
end $$;
