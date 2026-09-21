-- Nom de la personne qui partage, figé sur la ligne de partage (complète 0059).
--
-- La mention « ce fichier vous a été partagé par telle personne » est une exigence explicite du
-- client. Or le destinataire ne peut pas toujours lire le profil de l'émetteur : un élève ne
-- voit dans `profiles` que lui-même, son professeur et son binôme (0004/0017/0054). Un partage
-- venu de l'administration afficherait donc « partagé par quelqu'un ».
--
-- Dénormaliser le nom est ici la bonne réponse plutôt qu'élargir la visibilité de `profiles` :
-- élargir reviendrait à exposer l'annuaire complet de l'établissement à tout le monde pour
-- afficher une ligne de texte. Le nom est de toute façon une donnée que l'émetteur choisit de
-- révéler en partageant.
alter table public.document_partages
  add column partage_par_nom text;

create function public.document_partages_avant_insertion()
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
  return new;
end;
$$;

create trigger document_partages_avant_insertion
  before insert on public.document_partages
  for each row execute function public.document_partages_avant_insertion();
