-- Date de démarrage de la prochaine vague de cours collectifs, exposée à la page publique
-- (demande 6 du document de retours du 2026-10-08).
--
-- Aucune nouvelle colonne : la date existe déjà, c'est `cohorts.date_debut` de la vague créée par
-- l'administration dans « Cours collectifs ». Dupliquer cette date dans un champ à ressaisir
-- aurait créé deux vérités à maintenir, et donc tôt ou tard une date fausse affichée au public.
--
-- La table `cohorts` reste interdite au public : ses lignes portent des informations internes
-- (capacité, professeur attitré, heures de forfait, élèves rattachés) et RLS filtre des LIGNES,
-- pas des COLONNES — ouvrir la table en lecture exposerait tout cela. Cette fonction
-- `security definer` ne renvoie donc qu'une seule valeur : la date. `search_path` est figé, comme
-- pour les autres fonctions `security definer` du projet.
create or replace function public.prochaine_vague_publique(p_slug text)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select min(c.date_debut)
  from public.cohorts c
  join public.etablissements e on e.id = c.etablissement_id
  where e.slug = p_slug
    and c.statut = 'a_venir'
    and c.date_debut >= current_date;
$$;

comment on function public.prochaine_vague_publique(text) is
  'Date de démarrage de la prochaine vague « à venir » d''un établissement, pour affichage sur la page publique Cours & tarifs. Ne renvoie rien d''autre que cette date.';

grant execute on function public.prochaine_vague_publique(text) to anon, authenticated;
