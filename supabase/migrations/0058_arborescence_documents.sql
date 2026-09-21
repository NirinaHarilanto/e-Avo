-- Arborescence de dossiers dans l'espace documentaire — demande client du 2026-09-21, valable
-- pour les trois espaces (admin, professeur, étudiant) :
--   - chaque personne crée librement son arborescence ;
--   - un dossier contient des sous-dossiers et/ou des fichiers ;
--   - chaque fichier reste uploadable, téléchargeable et supprimable.
--
-- Les fichiers eux-mêmes ne bougent pas : `documents` et le bucket Storage `documents` (0018)
-- restent la source de vérité et portent toute l'autorisation. Un dossier n'est qu'un
-- classement ; il ne donne aucun droit et n'en retire aucun. C'est volontaire : si
-- l'appartenance à un dossier pouvait élargir ou restreindre la visibilité, la moindre erreur
-- de rangement deviendrait une fuite, et les policies RESTRICTIVE du confidentiel (0032/0033)
-- s'en trouveraient contournables.

create table public.document_dossiers (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  -- À qui appartient l'arborescence — le même axe que documents.owner_profile_id, pour que
  -- « l'espace documentaire de X » désigne exactement la même chose des deux côtés.
  proprietaire_profile_id uuid not null references public.profiles(id),
  -- Dénormalisé et recalculé par trigger, jamais envoyé par le navigateur : même raison qu'en
  -- 0018 pour documents.owner_role, la policy « le professeur voit les dossiers de son élève »
  -- en dépend.
  proprietaire_role public.role_profil not null,
  -- `on delete restrict` : un dossier qui contient encore quelque chose ne disparaît pas en
  -- silence. Supprimer un fichier passe obligatoirement par api/documents/supprimer.ts, qui
  -- retire aussi l'objet Storage — une cascade ici laisserait des fichiers orphelins dans le
  -- bucket, invisibles et impossibles à nettoyer depuis l'application.
  parent_id uuid references public.document_dossiers(id) on delete restrict,
  nom text not null check (btrim(nom) <> ''),
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint document_dossiers_pas_son_propre_parent check (parent_id is distinct from id)
);

create index document_dossiers_proprietaire on public.document_dossiers (proprietaire_profile_id);
create index document_dossiers_parent on public.document_dossiers (parent_id);

-- Deux dossiers frères ne peuvent pas porter le même nom. `coalesce` sur un UUID nul de
-- convention parce qu'un index unique ordinaire laisserait passer les doublons à la racine :
-- en SQL deux NULL ne sont jamais égaux, donc (proprietaire, null, 'Factures') serait
-- insérable autant de fois qu'on veut. Comparaison insensible à la casse pour éviter la paire
-- « Factures » / « factures », qui n'aide personne.
create unique index document_dossiers_nom_unique_par_parent
  on public.document_dossiers (
    proprietaire_profile_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(nom))
  );

-- Rattachement d'un fichier à un dossier. `null` = racine de l'espace documentaire, ce qui rend
-- la migration transparente : tous les documents déjà déposés restent visibles, à la racine.
alter table public.documents
  add column dossier_id uuid references public.document_dossiers(id) on delete restrict;

create index documents_dossier on public.documents (dossier_id);

comment on column public.documents.dossier_id is
  'Dossier de classement (0058). Nul = racine. Purement organisationnel : ne change aucun droit d''accès.';

-- Remplit proprietaire_role côté serveur, et refuse une arborescence qui se refermerait sur
-- elle-même. Le cycle n'est pas atteignable depuis l'interface actuelle (on ne déplace pas un
-- dossier), mais une boucle rendrait le fil d'Ariane et tout parcours récursif infinis : le
-- garde-fou coûte moins cher que le jour où quelqu'un ajoutera le déplacement.
create function public.document_dossiers_avant_ecriture()
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

  -- Un sous-dossier appartient forcément à la même personne que son parent : sans quoi une
  -- arborescence pourrait enjamber deux espaces documentaires et devenir illisible.
  if new.parent_id is not null and not exists (
    select 1 from public.document_dossiers
    where id = new.parent_id and proprietaire_profile_id = new.proprietaire_profile_id
  ) then
    raise exception 'Le dossier parent appartient à un autre espace documentaire.';
  end if;

  return new;
end;
$$;

create trigger document_dossiers_avant_ecriture
  before insert or update on public.document_dossiers
  for each row execute function public.document_dossiers_avant_ecriture();

-- Un document ne se range que dans un dossier de SON propriétaire. Contrôle côté serveur
-- plutôt que dans le composant d'upload : c'est la seule place où il ne peut pas être oublié.
create function public.documents_verifier_dossier()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.dossier_id is not null and not exists (
    select 1 from public.document_dossiers
    where id = new.dossier_id and proprietaire_profile_id = new.owner_profile_id
  ) then
    raise exception 'Ce dossier n''appartient pas à l''espace documentaire de ce document.';
  end if;
  return new;
end;
$$;

create trigger documents_verifier_dossier
  before insert or update on public.documents
  for each row execute function public.documents_verifier_dossier();

alter table public.document_dossiers enable row level security;

-- Les mêmes règles que `documents` (0018), volontairement : l'arborescence n'est visible que
-- par ceux qui voient déjà les fichiers qu'elle contient.
create policy "document_dossiers_admin_all"
  on public.document_dossiers for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "document_dossiers_proprietaire_select"
  on public.document_dossiers for select
  to authenticated
  using (proprietaire_profile_id = auth.uid());

create policy "document_dossiers_teacher_select"
  on public.document_dossiers for select
  to authenticated
  using (proprietaire_role = 'etudiant' and public.is_teacher_of_student(proprietaire_profile_id));

create policy "document_dossiers_insert"
  on public.document_dossiers for insert
  to authenticated
  with check (
    created_by_profile_id = auth.uid()
    and (
      proprietaire_profile_id = auth.uid()
      or public.is_admin_etablissement()
      or public.is_teacher_of_student(proprietaire_profile_id)
    )
  );

-- Renommage réservé au propriétaire (l'admin passe par sa policy `all` ci-dessus) : un
-- professeur peut déposer un document dans le dossier d'un élève, pas réorganiser son espace.
create policy "document_dossiers_proprietaire_update"
  on public.document_dossiers for update
  to authenticated
  using (proprietaire_profile_id = auth.uid())
  with check (proprietaire_profile_id = auth.uid());

create policy "document_dossiers_proprietaire_delete"
  on public.document_dossiers for delete
  to authenticated
  using (proprietaire_profile_id = auth.uid());
