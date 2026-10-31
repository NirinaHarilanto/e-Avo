-- Arborescence de dossiers pour les documents PARTAGEABLES — demande client du 2026-10-31,
-- capture à l'appui (onglet Documents › Partageables, flèche sur la liste de fichiers) : « il
-- faut rendre possible la création de dossier avec des arborescences (sous dossiers) là où c'est
-- indiqué par une flèche. Rendre cela possible également dans l'espace professeur et étudiants ».
--
-- Pourquoi 0058 ne suffisait pas. Un dossier y appartient à UNE personne
-- (`proprietaire_profile_id`), et deux garde-fous serveur s'appuient dessus :
--   * `documents_verifier_dossier` refuse qu'un fichier se range dans le dossier de quelqu'un
--     d'autre ;
--   * `document_dossiers_avant_ecriture` refuse qu'un sous-dossier change de propriétaire.
-- Les documents partageables (`documents.etablissement_wide`, 0033) n'ont justement pas de
-- propriétaire au sens de cet espace : ils appartiennent à l'établissement et restent visibles de
-- tous (`documents_etablissement_wide_select`). Leur `owner_profile_id` n'est que l'admin qui les
-- a déposés — et il y a plusieurs admins. Ranger la bibliothèque commune dans l'arborescence
-- personnelle du premier d'entre eux aurait mélangé deux espaces et rendu les dossiers invisibles
-- à ses collègues.
--
-- Cette migration ouvre donc une SECONDE arborescence, à l'échelle de l'établissement, sans rien
-- changer aux arborescences personnelles. `proprietaire_profile_id` reste renseigné (la colonne
-- est `not null` et sert la traçabilité : qui a créé le dossier), mais il ne commande plus ni
-- l'appartenance ni la visibilité quand `etablissement_wide` est vrai.

alter table public.document_dossiers
  add column etablissement_wide boolean not null default false;

comment on column public.document_dossiers.etablissement_wide is
  'Dossier de la bibliothèque commune (0149), pour les documents `documents.etablissement_wide` '
  '(0033). Visible de tout l''établissement, modifiable par les seuls admins. À faux, le dossier '
  'appartient à l''espace personnel de `proprietaire_profile_id` comme en 0058.';

-- ---------------------------------------------------------------------------------------------
-- Unicité des noms entre frères
-- ---------------------------------------------------------------------------------------------
-- L'index de 0058 porte sur (propriétaire, parent, nom) : à la racine commune, deux admins
-- différents pourraient créer deux dossiers « Supports ». L'unicité d'un dossier commun se joue
-- donc sur l'ÉTABLISSEMENT, et l'index d'origine se restreint aux dossiers personnels.
drop index if exists public.document_dossiers_nom_unique_par_parent;

create unique index document_dossiers_nom_unique_par_parent
  on public.document_dossiers (
    proprietaire_profile_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(nom))
  )
  where not etablissement_wide;

create unique index document_dossiers_nom_unique_commun
  on public.document_dossiers (
    etablissement_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(nom))
  )
  where etablissement_wide;

-- ---------------------------------------------------------------------------------------------
-- Garde-fous serveur, repris de 0058 avec la distinction des deux arborescences
-- ---------------------------------------------------------------------------------------------
-- Les deux fonctions sont RÉÉCRITES ENTIÈREMENT (et non complétées) pour qu'on puisse lire ici
-- la règle en vigueur sans recoller mentalement deux migrations. Le contrôle de cycle et la
-- profondeur maximale sont inchangés, mot pour mot.
create or replace function public.document_dossiers_avant_ecriture()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ancetre uuid := new.parent_id;
  v_profondeur integer := 0;
begin
  select role into new.proprietaire_role from public.profiles where id = new.proprietaire_profile_id;
  if new.proprietaire_role is null then
    raise exception 'proprietaire_profile_id introuvable dans profiles.';
  end if;

  while v_ancetre is not null loop
    if v_ancetre = new.id then
      raise exception 'Un dossier ne peut pas être contenu dans lui-même.';
    end if;
    v_profondeur := v_profondeur + 1;
    if v_profondeur > 50 then
      raise exception 'Arborescence trop profonde (50 niveaux maximum).';
    end if;
    select parent_id into v_ancetre from public.document_dossiers where id = v_ancetre;
  end loop;

  if new.parent_id is not null then
    if new.etablissement_wide then
      /* Bibliothèque commune : c'est l'établissement qui fait l'appartenance, pas la personne —
         un sous-dossier créé par un admin se range sous le dossier créé par un autre. */
      if not exists (
        select 1 from public.document_dossiers
        where id = new.parent_id
          and etablissement_wide
          and etablissement_id = new.etablissement_id
      ) then
        raise exception 'Le dossier parent n''appartient pas à la bibliothèque commune de cet établissement.';
      end if;
    else
      -- Espace personnel : règle de 0058, inchangée.
      if not exists (
        select 1 from public.document_dossiers
        where id = new.parent_id
          and not etablissement_wide
          and proprietaire_profile_id = new.proprietaire_profile_id
      ) then
        raise exception 'Le dossier parent appartient à un autre espace documentaire.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.documents_verifier_dossier()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.dossier_id is null then
    return new;
  end if;

  if new.etablissement_wide then
    if not exists (
      select 1 from public.document_dossiers
      where id = new.dossier_id
        and etablissement_wide
        and etablissement_id = new.etablissement_id
    ) then
      raise exception 'Un document partageable ne se range que dans un dossier de la bibliothèque commune.';
    end if;
  elsif not exists (
    select 1 from public.document_dossiers
    where id = new.dossier_id
      and not etablissement_wide
      and proprietaire_profile_id = new.owner_profile_id
  ) then
    raise exception 'Ce dossier n''appartient pas à l''espace documentaire de ce document.';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Visibilité
-- ---------------------------------------------------------------------------------------------
-- Exactement le pendant de `documents_etablissement_wide_select` (0033) : si tout
-- l'établissement voit les fichiers, il doit voir le classement qui les porte, sans quoi
-- l'explorateur afficherait une racine vide chez l'élève et le professeur. Lecture seule : les
-- policies d'écriture de 0058 restent inchangées, et seule celle de l'admin
-- (`document_dossiers_admin_all`) couvre la bibliothèque commune — ni l'élève ni le professeur
-- ne sont `proprietaire_profile_id` d'un dossier commun.
create policy "document_dossiers_etablissement_wide_select"
  on public.document_dossiers for select
  to authenticated
  using (etablissement_wide and etablissement_id = public.current_etablissement_id());
