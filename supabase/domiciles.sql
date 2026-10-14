-- ============================================================
-- Domicile de chaque technicien (point de départ « 🏠 Domicile »
-- du Bon d'intervention) — Portail Electreau
-- À exécuter UNE FOIS dans Supabase : SQL Editor > coller > Run
-- (ré-exécutable sans risque)
-- ============================================================
-- La table n'est PAS lisible directement par la clé anon : on passe
-- uniquement par 2 fonctions (lire / enregistrer SON domicile par nom),
-- ce qui évite de pouvoir lister toutes les adresses d'un coup.

create table if not exists tech_domiciles (
  nom         text primary key,          -- nom du compte (ex : 'Bastien Brochier')
  adresse     text not null,
  lat         double precision,
  lon         double precision,
  updated_at  timestamptz not null default now()
);
alter table tech_domiciles enable row level security;
-- aucune policy pour anon/authenticated → accès direct fermé

create or replace function domicile_get(p_nom text)
returns table (adresse text, lat double precision, lon double precision)
language sql security definer set search_path = public as $$
  select d.adresse, d.lat, d.lon from tech_domiciles d where d.nom = p_nom;
$$;

create or replace function domicile_set(p_nom text, p_adresse text, p_lat double precision, p_lon double precision)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_nom), '') = '' or coalesce(trim(p_adresse), '') = '' then
    return false;
  end if;
  insert into tech_domiciles (nom, adresse, lat, lon, updated_at)
  values (trim(p_nom), trim(p_adresse), p_lat, p_lon, now())
  on conflict (nom) do update
    set adresse = excluded.adresse, lat = excluded.lat, lon = excluded.lon, updated_at = now();
  return true;
end;
$$;

revoke all on function domicile_get(text) from public;
revoke all on function domicile_set(text, text, double precision, double precision) from public;
grant execute on function domicile_get(text) to anon, authenticated;
grant execute on function domicile_set(text, text, double precision, double precision) to anon, authenticated;
