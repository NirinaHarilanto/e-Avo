-- Espace documentaire personnel : arborescence par défaut, confidentialité stricte et partage
-- explicite — précisions client du 2026-09-21, qui complètent 0058.
--
-- Trois choses :
--   1. chaque personne démarre avec une arborescence par défaut ;
--   2. un fichier déposé par quelqu'un dans SON PROPRE espace n'est visible que de lui ;
--   3. il peut en partager la vue avec un autre utilisateur, qui le retrouve alors dans
--      « Mes fichiers partagés » avec la mention de qui le lui a transmis.
--
-- PÉRIMÈTRE EXACT DE LA CONFIDENTIALITÉ — décision à valider par le client :
-- « strictement visible par son utilisateur uniquement » est appliqué aux fichiers que la
-- personne a elle-même déposés dans son espace (owner = uploader). Les documents déposés PAR
-- l'établissement ou un professeur POUR quelqu'un (contrat signé, communication, pièce de
-- dossier — owner <> uploader) restent visibles de leur déposant, de l'administration et, pour
-- un élève, de son professeur. Sans cette distinction, un admin perdrait la vue des pièces
-- qu'il gère lui-même (ContratsAdmin rattache un scan signé via `documents`, la page Documents
-- de l'admin liste les pièces par personne) : ce n'est pas ce que demande la confidentialité
-- d'un espace personnel, c'est une régression fonctionnelle.

-- ---------------------------------------------------------------------------------------------
-- 1. Arborescence par défaut
-- ---------------------------------------------------------------------------------------------
-- « Mes fichiers partagés » ne figure PAS ici : ce dossier n'est pas un dossier réel. Les
-- fichiers qu'on y voit appartiennent à d'autres personnes et vivent dans LEUR arborescence —
-- les recopier ici créerait deux exemplaires à maintenir, et permettrait au destinataire de
-- « supprimer » un fichier qui ne lui appartient pas. L'interface le présente comme un dossier,
-- alimenté par la table `document_partages` ci-dessous.
create function public.creer_dossiers_par_defaut(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_etablissement_id uuid;
  v_nom text;
begin
  select etablissement_id into v_etablissement_id from public.profiles where id = p_profile_id;
  if v_etablissement_id is null then
    return;
  end if;

  foreach v_nom in array array['Mes supports pédagogiques', 'Mes notes', 'Mes communications HOC'] loop
    -- `on conflict do nothing` sur l'index unique des dossiers frères : la fonction peut donc
    -- être rejouée sans risque (reprise de l'existant plus bas, ou personne l'ayant déjà créé
    -- elle-même à la main avec le même nom).
    insert into public.document_dossiers (etablissement_id, proprietaire_profile_id, parent_id, nom, created_by_profile_id)
    values (v_etablissement_id, p_profile_id, null, v_nom, p_profile_id)
    on conflict do nothing;
  end loop;
end;
$$;

create function public.profiles_dossiers_par_defaut()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.creer_dossiers_par_defaut(new.id);
  return new;
end;
$$;

create trigger profiles_dossiers_par_defaut
  after insert on public.profiles
  for each row execute function public.profiles_dossiers_par_defaut();

-- Reprise de l'existant : tout le monde doit avoir son arborescence, pas seulement les comptes
-- créés à partir de maintenant.
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.profiles loop
    perform public.creer_dossiers_par_defaut(v_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Partage d'un fichier avec un autre utilisateur
-- ---------------------------------------------------------------------------------------------
-- Distinct de `document_permissions` (0033), qui sert à ouvrir un document CONFIDENTIEL déposé
-- par l'administration à une liste blanche. Ici c'est l'inverse : un utilisateur ordinaire
-- ouvre la vue d'un de SES fichiers à quelqu'un. Mélanger les deux dans la même table
-- reviendrait à confondre deux autorisations qui n'ont ni la même origine ni les mêmes règles
-- d'écriture.
create table public.document_partages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  destinataire_profile_id uuid not null references public.profiles(id) on delete cascade,
  partage_par_profile_id uuid not null references public.profiles(id),
  -- Mot laissé par celui qui partage, affiché à côté du fichier chez le destinataire.
  message text,
  created_at timestamptz not null default now(),
  unique (document_id, destinataire_profile_id),
  constraint document_partages_pas_soi_meme check (destinataire_profile_id <> partage_par_profile_id)
);

create index document_partages_destinataire on public.document_partages (destinataire_profile_id);

alter table public.document_partages enable row level security;

-- Fonction security definer : la policy de `documents` ci-dessous doit interroger
-- `document_partages`, dont les propres policies interrogeraient `documents` en retour. Même
-- parade que `is_admin_etablissement()` (0003) contre la récursion.
create function public.document_partage_avec_moi(p_document_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.document_partages
    where document_id = p_document_id and destinataire_profile_id = auth.uid()
  );
$$;

-- Partager n'est possible que pour ses propres fichiers : on ne redistribue pas le fichier d'un
-- autre. Le `with check` porte sur le propriétaire du document, pas sur l'uploadeur — c'est le
-- propriétaire de l'espace qui décide de ce qui en sort.
create policy "document_partages_proprietaire_all"
  on public.document_partages for all
  to authenticated
  using (
    partage_par_profile_id = auth.uid()
    and exists (select 1 from public.documents d where d.id = document_id and d.owner_profile_id = auth.uid())
  )
  with check (
    partage_par_profile_id = auth.uid()
    and exists (select 1 from public.documents d where d.id = document_id and d.owner_profile_id = auth.uid())
  );

-- Le destinataire voit le partage dont il bénéficie (c'est ce qui porte le nom de l'émetteur et
-- son message), sans pouvoir le modifier — il peut seulement le retirer de sa vue.
create policy "document_partages_destinataire_select"
  on public.document_partages for select
  to authenticated
  using (destinataire_profile_id = auth.uid());

create policy "document_partages_destinataire_delete"
  on public.document_partages for delete
  to authenticated
  using (destinataire_profile_id = auth.uid());

-- ---------------------------------------------------------------------------------------------
-- 3. Confidentialité de l'espace personnel
-- ---------------------------------------------------------------------------------------------
-- Le fichier partagé devient visible du destinataire — c'est tout l'objet du partage.
create policy "documents_partage_select"
  on public.documents for select
  to authenticated
  using (public.document_partage_avec_moi(id));

-- `documents_admin_all` était une policy `for all` : sa partie SELECT donnait à l'admin la vue
-- de tout, y compris de l'espace personnel. On la remplace par une policy d'écriture (l'admin
-- continue de déposer, corriger et supprimer) et une policy de lecture qui s'arrête au seuil de
-- l'espace personnel. Même traitement pour le professeur.
drop policy "documents_admin_all" on public.documents;

create policy "documents_admin_insert"
  on public.documents for insert
  to authenticated
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "documents_admin_update"
  on public.documents for update
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "documents_admin_delete"
  on public.documents for delete
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "documents_admin_select"
  on public.documents for select
  to authenticated
  using (
    etablissement_id = public.current_etablissement_id()
    and public.is_admin_etablissement()
    -- Seuil de l'espace personnel : ce que la personne a déposé elle-même chez elle ne regarde
    -- qu'elle. Ce qu'un tiers a déposé pour elle reste une pièce de dossier, donc visible.
    and uploaded_by_profile_id <> owner_profile_id
  );

drop policy "documents_teacher_select_student_docs" on public.documents;

create policy "documents_teacher_select_student_docs"
  on public.documents for select
  to authenticated
  using (
    owner_role = 'etudiant'
    and public.is_teacher_of_student(owner_profile_id)
    and uploaded_by_profile_id <> owner_profile_id
  );

-- L'arborescence suit la même règle que les fichiers : elle porte des noms de dossiers qui
-- peuvent en dire long. L'admin garde l'écriture (il dépose dans l'arborescence d'autrui) mais
-- ne lit plus les dossiers créés par la personne elle-même. Le professeur, lui, n'a plus rien à
-- y voir : il dépose à la racine de l'espace de son élève.
drop policy "document_dossiers_admin_all" on public.document_dossiers;
drop policy "document_dossiers_teacher_select" on public.document_dossiers;

create policy "document_dossiers_admin_ecriture"
  on public.document_dossiers for all
  to authenticated
  using (
    etablissement_id = public.current_etablissement_id()
    and public.is_admin_etablissement()
    and created_by_profile_id <> proprietaire_profile_id
  )
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());
