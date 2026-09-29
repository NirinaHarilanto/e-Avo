-- Recrutement et onboarding des formateurs — process HOC transmis par le client le 2026-09-29.
--
--   Réception : le candidat postule depuis le bouton « Rejoignez-nous ! » de la vitrine
--     (informations personnelles, motivation, expériences, CV, diplômes / certificat TEFL).
--     Pièce obligatoire : licence en études anglophones OU certification TEFL reconnue.
--   Sélection : appel de pré-sélection (checklist) → tests Reading / Listening / Grammar &
--     Vocabulary (C1 minimum pour passer) → simulation de cours sur Google Meet (compte rendu).
--   Intégration : le compte professeur est créé automatiquement à partir du dossier, avec le
--     statut « en phase d'intégration » ; checklist (signature du contrat, deux sessions
--     d'onboarding, observation d'un cours collectif, remise du guide formateur) avant validation.
--
-- Écritures publiques (dépôt d'une candidature) uniquement via api/recrutement/*.ts avec la clé
-- service_role ; l'administration lit et fait avancer les dossiers directement (policy admin).

create table public.candidatures_formateurs (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  prenom text not null,
  nom text not null,
  email text not null,
  telephone text,
  ville text,
  motivation text not null,
  experiences text not null,
  -- Pièce justificative déclarée par le candidat : licence en études anglophones, TEFL, ou autre.
  diplome_declare text not null check (diplome_declare in ('licence_anglais', 'tefl', 'licence_et_tefl', 'autre')),
  -- [{ chemin, nom, type: 'cv' | 'diplome' }] dans le bucket privé `candidatures`.
  fichiers jsonb not null default '[]'::jsonb,
  statut text not null default 'recue'
    check (statut in ('recue', 'preselection', 'tests', 'simulation', 'integration', 'integre', 'refusee')),
  documents_verifies boolean not null default false,
  preselection jsonb not null default '{}'::jsonb,
  tests jsonb not null default '{}'::jsonb,
  simulation jsonb not null default '{}'::jsonb,
  integration jsonb not null default '{}'::jsonb,
  notes text,
  motif_refus text,
  professeur_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index candidatures_formateurs_statut on public.candidatures_formateurs (etablissement_id, statut, created_at desc);

alter table public.candidatures_formateurs enable row level security;

create policy "candidatures_formateurs_admin_select"
  on public.candidatures_formateurs for select
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "candidatures_formateurs_admin_update"
  on public.candidatures_formateurs for update
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create or replace function public.candidatures_formateurs_horodater()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger candidatures_formateurs_updated_at
  before update on public.candidatures_formateurs
  for each row execute function public.candidatures_formateurs_horodater();

-- Pièces des candidats : bucket privé, 10 Mo, PDF / images / Word. Dépôt uniquement par URL
-- signée émise par le serveur (le candidat n'a pas de compte) ; lecture réservée à l'admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidatures',
  'candidatures',
  false,
  10485760,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

create policy "candidatures_storage_admin_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'candidatures'
    and (storage.foldername(name))[1] = public.current_etablissement_id()::text
    and public.is_admin_etablissement()
  );

-- Professeur recruté encore en phase d'intégration (contrat à signer, onboarding en cours).
-- Nul pour tous les professeurs existants, et une fois l'intégration validée.
alter table public.profiles
  add column statut_integration text check (statut_integration in ('en_integration'));

comment on column public.profiles.statut_integration is
  'en_integration : professeur recruté dont l''onboarding n''est pas encore validé (0082).';

-- Le professeur en intégration ne doit pas pouvoir lever lui-même ce statut via
-- profiles_self_update : seul un administrateur valide l'intégration. Reprend 0047 à l'identique
-- pour le reste.
create or replace function public.empecher_promotion_profil()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() not in ('service_role', 'postgres') then
    if new.role is distinct from old.role
      or new.etablissement_id is distinct from old.etablissement_id
      or new.status is distinct from old.status
    then
      raise exception 'Modification de role/etablissement_id/status réservée au backend (service_role).';
    end if;
    if new.taux_horaire is distinct from old.taux_horaire and auth.uid() = old.id and not public.is_admin_etablissement() then
      raise exception 'Modification du taux horaire réservée à un administrateur.';
    end if;
    if new.statut_integration is distinct from old.statut_integration and not public.is_admin_etablissement() then
      raise exception 'Validation de l''intégration réservée à un administrateur.';
    end if;
  end if;
  return new;
end;
$$;
