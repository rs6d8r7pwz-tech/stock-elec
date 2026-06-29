-- ============================================================
-- Ajustement de stock ATOMIQUE — Portail Electreau / Stock
-- Verrouille la ligne, vérifie le stock, met à jour + enregistre le mouvement,
-- le tout dans une seule transaction (évite les écrasements à plusieurs).
-- p_delta > 0 = entrée, p_delta < 0 = sortie.
-- À exécuter dans Supabase : SQL Editor > coller > Run
-- ============================================================
create or replace function public.adjust_stock(p_id uuid, p_delta int, p_person text, p_chantier text)
returns int
language plpgsql
security definer
set search_path to 'public'
as $func$
declare cur int; nouvelle int;
begin
  select quantity into cur from components where id = p_id for update;
  if not found then raise exception 'Composant introuvable'; end if;
  nouvelle := cur + p_delta;
  if nouvelle < 0 then raise exception 'Stock insuffisant (% en stock)', cur; end if;
  update components set quantity = nouvelle where id = p_id;
  insert into movements (component_id, movement_type, quantity, person_name, chantier_ref)
    values (p_id, case when p_delta >= 0 then 'in' else 'out' end, abs(p_delta), p_person, p_chantier);
  return nouvelle;
end
$func$;
