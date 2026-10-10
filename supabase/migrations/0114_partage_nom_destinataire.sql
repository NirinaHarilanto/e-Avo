-- Nom du destinataire, figé sur la ligne de partage — complète 0060 côté symétrique.
--
-- Nécessaire pour la nouvelle confirmation de suppression (demande client du 2026-10-10) :
-- « avant la validation de la suppression, il faut afficher [...] les personnes qui partagent la
-- vue sur ce document ». Le PROPRIÉTAIRE d'un document ne peut pas toujours lire le profil de
-- chacun de ses destinataires — un étudiant propriétaire d'une pièce que l'administration a
-- partagée à un professeur ne voit dans `profiles` que lui-même et SON professeur (0004/0017),
-- pas n'importe quel professeur de l'établissement. Sans ce nom figé, la fenêtre de confirmation
-- afficherait « Personne » à la place d'un nom, rendant l'avertissement inutilisable.
--
-- Même raisonnement et même mécanique que 0060 pour `partage_par_nom` : dénormaliser le nom au
-- moment du partage plutôt qu'élargir la visibilité de `profiles` à tout le monde pour une ligne
-- de texte. Le trigger existant est étendu plutôt que dupliqué.
alter table public.document_partages
  add column destinataire_nom text;

create or replace function public.document_partages_avant_insertion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select btrim(coalesce(prenom, '') || ' ' || coalesce(nom, ''))
    into new.partage_par_nom
    from public.profiles
    where id = new.partage_par_profile_id;

  if new.partage_par_nom is null or new.partage_par_nom = '' then
    new.partage_par_nom := 'Hari Online Club';
  end if;

  select btrim(coalesce(prenom, '') || ' ' || coalesce(nom, ''))
    into new.destinataire_nom
    from public.profiles
    where id = new.destinataire_profile_id;

  if new.destinataire_nom is null or new.destinataire_nom = '' then
    new.destinataire_nom := 'Personne';
  end if;

  return new;
end;
$$;

-- Rattrapage de l'existant : les lignes déjà posées avant cette migration n'ont pas de
-- `destinataire_nom`. `security definer` sur la fonction d'origine le permettait déjà à
-- l'insertion ; ce bloc applique la même lecture, une fois, à ce qui existe.
update public.document_partages dp
set destinataire_nom = coalesce(
  nullif(btrim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, '')), ''),
  'Personne'
)
from public.profiles p
where p.id = dp.destinataire_profile_id
  and dp.destinataire_nom is null;
