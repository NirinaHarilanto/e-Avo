-- Gestion des dossiers « exactement comme sur un PC » — demande client du 2026-10-31 :
--   « Mets trois dossiers par défaut dans le panel de navigation : Dossier 1, Dossier 2,
--     Dossier 3. Chaque dossier peut être modifié, renommé, supprimé. [...] avec la possibilité
--     de partager une vue ou vue ET écriture d'un dossier avec une ou plusieurs personnes de
--     l'application HOC. »
--
-- Deux changements de fond ici, l'interface suit dans le même commit.

-- 1) DOSSIERS PAR DÉFAUT NEUTRES ------------------------------------------------------------
-- 0059 posait trois dossiers nommés d'avance (« Mes supports pédagogiques », « Mes notes »,
-- « Mes communications HOC ») : un classement décidé à la place de la personne. Le client veut
-- le point de départ d'un PC neuf — trois dossiers sans signification, qu'on renomme pour en
-- faire ce qu'on veut.
create or replace function public.creer_dossiers_par_defaut(p_profile_id uuid)
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

  foreach v_nom in array array['Dossier 1', 'Dossier 2', 'Dossier 3'] loop
    -- `on conflict do nothing` sur l'index unique des dossiers frères : la fonction reste
    -- rejouable, et ne touche pas un « Dossier 1 » que la personne aurait déjà créé elle-même.
    insert into public.document_dossiers (etablissement_id, proprietaire_profile_id, parent_id, nom, created_by_profile_id)
    values (v_etablissement_id, p_profile_id, null, v_nom, p_profile_id)
    on conflict do nothing;
  end loop;
end;
$$;

-- Reprise de l'existant, mais SEULEMENT pour les dossiers restés vides et jamais renommés : un
-- dossier où quelqu'un a déjà rangé des fichiers porte un nom qui lui sert de repère, et le lui
-- changer sous les yeux serait une perte de repère, pas une correction. Ceux-là gardent leur nom
-- et se renomment d'un clic droit comme n'importe quel autre.
with vides as (
  select d.id,
         row_number() over (partition by d.proprietaire_profile_id order by d.nom) as rang
  from public.document_dossiers d
  where d.parent_id is null
    and not d.etablissement_wide
    and d.nom in ('Mes supports pédagogiques', 'Mes notes', 'Mes communications HOC')
    and not exists (select 1 from public.documents f where f.dossier_id = d.id)
    and not exists (select 1 from public.document_dossiers s where s.parent_id = d.id)
)
update public.document_dossiers d
set nom = 'Dossier ' || v.rang
from vides v
where d.id = v.id
  -- Jamais par-dessus un « Dossier N » déjà présent chez la même personne : l'index unique des
  -- dossiers frères refuserait la ligne et ferait échouer toute la migration.
  and not exists (
    select 1 from public.document_dossiers autre
    where autre.proprietaire_profile_id = d.proprietaire_profile_id
      and autre.parent_id is null
      and not autre.etablissement_wide
      and autre.nom = 'Dossier ' || v.rang
  );

-- Comptes à qui il manque des dossiers (créés avant 0059, ou ayant supprimé les leurs) : la
-- fonction ci-dessus est rejouable, elle ne crée que ce qui manque.
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.profiles loop
    perform public.creer_dossiers_par_defaut(v_id);
  end loop;
end;
$$;

-- 2) PARTAGE D'UN DOSSIER, EN VUE OU EN VUE ET ÉCRITURE ---------------------------------------
-- Le partage de FICHIER existe depuis 0059 (étendu à tout lecteur par 0111). Celui d'un DOSSIER
-- est autre chose : il porte sur un contenant, donc sur ce qu'il contiendra demain, et il peut
-- accorder le droit d'y déposer. C'est ce que le client appelle « vue » et « vue ET écriture ».
create table public.document_dossier_partages (
  id uuid primary key default gen_random_uuid(),
  -- `on delete cascade` : un dossier supprimé emporte ses partages. Rien à nettoyer à la main,
  -- et aucune ligne fantôme ne peut continuer à désigner un dossier disparu.
  dossier_id uuid not null references public.document_dossiers(id) on delete cascade,
  destinataire_profile_id uuid not null references public.profiles(id) on delete cascade,
  partage_par_profile_id uuid not null references public.profiles(id),
  -- Deux niveaux seulement, les deux que le client a nommés. Pas de troisième « propriétaire » :
  -- le dossier reste dans l'espace de celui qui l'a créé, c'est lui qui le renomme ou le
  -- supprime — un invité, même en écriture, ne peut pas défaire le rangement de son hôte.
  niveau text not null check (niveau in ('lecture', 'ecriture')),
  message text,
  -- Noms figés à l'insertion, exactement pour la raison posée en 0060 et 0114 sur le partage de
  -- fichier : le destinataire ne peut pas toujours lire le profil de l'émetteur (un élève ne voit
  -- dans `profiles` que lui-même, son professeur et son binôme), et réciproquement. Sans ces deux
  -- colonnes, « Partagé par » afficherait « quelqu'un ». Dénormaliser un nom coûte moins cher que
  -- d'ouvrir l'annuaire de l'établissement à tout le monde pour une ligne de texte.
  partage_par_nom text,
  destinataire_nom text,
  created_at timestamptz not null default now(),
  -- Un seul partage par personne et par dossier : changer le niveau est une mise à jour, pas une
  -- seconde ligne qui contredirait la première.
  unique (dossier_id, destinataire_profile_id)
);

create index document_dossier_partages_destinataire on public.document_dossier_partages (destinataire_profile_id);
create index document_dossier_partages_dossier on public.document_dossier_partages (dossier_id);

alter table public.document_dossier_partages enable row level security;

create function public.document_dossier_partages_avant_insertion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select nullif(btrim(coalesce(prenom, '') || ' ' || coalesce(nom, '')), '')
    into new.partage_par_nom
    from public.profiles where id = new.partage_par_profile_id;
  new.partage_par_nom := coalesce(new.partage_par_nom, 'Hari Online Club');

  select nullif(btrim(coalesce(prenom, '') || ' ' || coalesce(nom, '')), '')
    into new.destinataire_nom
    from public.profiles where id = new.destinataire_profile_id;
  return new;
end;
$$;

create trigger document_dossier_partages_avant_insertion
  before insert on public.document_dossier_partages
  for each row execute function public.document_dossier_partages_avant_insertion();

-- Le partage descend l'arborescence : partager « Classe de 6e » donne accès à ses sous-dossiers,
-- comme un dossier partagé sur un PC. Recalculé à la volée plutôt que recopié sur chaque enfant —
-- un sous-dossier créé demain est couvert sans rien à propager, et retirer le partage de la
-- racine retire tout d'un coup.
--
-- `security definer` est ICI la pièce maîtresse, et pas une facilité : cette fonction est appelée
-- DEPUIS les policies de `document_dossiers`. Si elle lisait cette table sous la RLS de
-- l'appelant, PostgreSQL rappellerait la policy pour l'évaluer, qui rappellerait la fonction :
-- « infinite recursion detected in policy ». En `security definer` elle lit la table sans RLS,
-- la récursion est coupée. Elle ne renvoie que des identifiants de dossiers déjà partagés avec
-- `p_profile_id` : rien de ce qu'elle expose ne dépasse ce que les partages accordent.
create function public.dossiers_accessibles_par_partage(p_profile_id uuid)
returns table (dossier_id uuid, peut_ecrire boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive partages_directs as (
    select p.dossier_id as id, (p.niveau = 'ecriture') as peut_ecrire
    from public.document_dossier_partages p
    where p.destinataire_profile_id = p_profile_id
  ),
  descendance as (
    select id, peut_ecrire from partages_directs
    union
    select enfant.id, parent.peut_ecrire
    from public.document_dossiers enfant
    join descendance parent on enfant.parent_id = parent.id
  )
  -- `bool_or` et non un `max` textuel : deux partages peuvent se recouvrir (le dossier parent en
  -- lecture, un sous-dossier en écriture). Le plus permissif l'emporte, comme partout ailleurs.
  select id, bool_or(peut_ecrire) from descendance group by id;
$$;

-- Qui voit la ligne de partage elle-même : son destinataire (pour savoir de qui vient le dossier)
-- et son émetteur (pour gérer ce qu'il a ouvert).
create policy "document_dossier_partages_destinataire_select"
  on public.document_dossier_partages for select
  to authenticated
  using (destinataire_profile_id = auth.uid());

-- Le destinataire peut retirer le dossier de son propre espace, sans rien demander à personne —
-- la symétrie de ce que 0059 accorde déjà sur un fichier reçu.
create policy "document_dossier_partages_destinataire_delete"
  on public.document_dossier_partages for delete
  to authenticated
  using (destinataire_profile_id = auth.uid());

-- Qui peut partager un dossier : qui le voit, exactement comme pour un fichier (règle posée par
-- le client le 2026-10-10, voir 0111). La sous-requête sur `document_dossiers` s'exécute sous la
-- RLS de l'appelant : un dossier qu'il ne voit pas n'en ressort pas, et le partage est refusé
-- sans qu'une seule condition de plus soit écrite ici.
create policy "document_dossier_partages_emetteur_all"
  on public.document_dossier_partages for all
  to authenticated
  using (
    partage_par_profile_id = auth.uid()
    and exists (select 1 from public.document_dossiers d where d.id = dossier_id)
  )
  with check (
    partage_par_profile_id = auth.uid()
    and exists (select 1 from public.document_dossiers d where d.id = dossier_id)
  );

-- Ce que le partage ouvre réellement : le dossier, ses sous-dossiers, et les fichiers dedans.
create policy "document_dossiers_partage_select"
  on public.document_dossiers for select
  to authenticated
  using (id in (select dossier_id from public.dossiers_accessibles_par_partage(auth.uid())));

create policy "documents_dossier_partage_select"
  on public.documents for select
  to authenticated
  using (dossier_id in (select dossier_id from public.dossiers_accessibles_par_partage(auth.uid())));

-- Écriture : déposer un fichier dans un dossier reçu en écriture. Le fichier entre dans l'espace
-- du PROPRIÉTAIRE du dossier (`owner_profile_id`), pas dans celui de qui le dépose — c'est déjà
-- la règle quand un professeur dépose une pièce chez son élève (0018), et c'est ce qui fait que
-- le fichier reste visible du propriétaire même si le partage est retiré ensuite.
create policy "documents_dossier_partage_insert"
  on public.documents for insert
  to authenticated
  with check (
    uploaded_by_profile_id = auth.uid()
    and dossier_id in (select dossier_id from public.dossiers_accessibles_par_partage(auth.uid()) where peut_ecrire)
    and owner_profile_id = (select d.proprietaire_profile_id from public.document_dossiers d where d.id = dossier_id)
  );

-- Créer un sous-dossier dans un dossier reçu en écriture, comme sur un PC.
create policy "document_dossiers_partage_insert"
  on public.document_dossiers for insert
  to authenticated
  with check (
    created_by_profile_id = auth.uid()
    and parent_id in (select dossier_id from public.dossiers_accessibles_par_partage(auth.uid()) where peut_ecrire)
    and proprietaire_profile_id = (select d.proprietaire_profile_id from public.document_dossiers d where d.id = parent_id)
  );

-- Volontairement PAS de policy `update` ni `delete` pour l'invité, même en écriture : renommer ou
-- supprimer le dossier d'autrui, c'est défaire son rangement. Ces deux gestes restent au
-- propriétaire (et à l'administration), ce que l'interface dit explicitement.

comment on table public.document_dossier_partages is
  'Partage d''un DOSSIER avec une personne, en lecture ou en écriture (2026-10-31). Se distingue '
  'de document_partages, qui ne porte que sur un fichier : le partage d''un dossier couvre aussi '
  'ses sous-dossiers et ce qui y sera déposé plus tard, via dossiers_accessibles_par_partage().';
