-- ============================================================
-- Appareils de confiance (device trust) — Portail Electreau
-- À exécuter dans Supabase : SQL Editor > New query > coller > Run
-- ============================================================

create table if not exists trusted_devices (
  id           uuid primary key default gen_random_uuid(),
  account      text not null,                 -- nom du compte (ex: "Bastien Brochier")
  device_id    text not null,                 -- identifiant unique de l'appareil (généré côté navigateur)
  label        text,                          -- libellé lisible (ex: "Chrome sur Windows")
  user_agent   text,
  status       text not null default 'pending', -- 'pending' | 'approved' | 'revoked'
  approve_token text not null,                -- jeton secret pour le lien d'autorisation
  created_at   timestamptz not null default now(),
  approved_at  timestamptz,
  last_seen_at timestamptz,
  unique (account, device_id)
);

create index if not exists trusted_devices_token_idx on trusted_devices (approve_token);
create index if not exists trusted_devices_account_idx on trusted_devices (account);

-- RLS activée : tout passe par les routes serveur (clé service-role), donc on n'ouvre
-- aucun accès au rôle "anon". Aucune policy = aucun accès public direct à la table.
alter table trusted_devices enable row level security;
