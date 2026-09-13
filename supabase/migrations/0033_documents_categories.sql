-- Documents partageables / comptes-rendus de cours / confidentiels — Phase 6 du chantier
-- "Hari Online Club" (2026-09-13). La partie la plus délicate en RLS de tout ce chantier.

-- 1) Documents partageables à tout l'établissement (supports, communications, règlements
-- internes) : nouvelle policy PERMISSIVE qui élargit l'accès, sans toucher aux policies
-- existantes.
alter table public.documents
  add column etablissement_wide boolean not null default false,
  add constraint documents_wide_not_confidentiel check (not (etablissement_wide and categorie = 'confidentiel'));

create policy "documents_etablissement_wide_select"
  on public.documents for select
  to authenticated
  using (etablissement_wide and etablissement_id = public.current_etablissement_id());

-- 2) Documents confidentiels : accès sur liste blanche uniquement (document_permissions),
-- y compris pour un admin — c'est ce qui permet "non visible pour telle personne". Implémenté
-- avec des policies RESTRICTIVE (combinées en ET avec toutes les policies permissives
-- existantes, documents_admin_all incluse) plutôt qu'en réécrivant ces dernières : la
-- restriction s'applique uniformément, sans risquer de régression sur l'accès non-confidentiel.
create table public.document_permissions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  niveau text not null check (niveau in ('lecture', 'ecriture')),
  created_at timestamptz not null default now(),
  unique (document_id, profile_id)
);

alter table public.document_permissions enable row level security;

create policy "document_permissions_admin_all"
  on public.document_permissions for all
  to authenticated
  using (exists (
    select 1 from public.documents d
    where d.id = document_permissions.document_id
      and d.etablissement_id = public.current_etablissement_id()
      and public.is_admin_etablissement()
  ))
  with check (exists (
    select 1 from public.documents d
    where d.id = document_permissions.document_id
      and d.etablissement_id = public.current_etablissement_id()
      and public.is_admin_etablissement()
  ));

create policy "document_permissions_self_select"
  on public.document_permissions for select
  to authenticated
  using (profile_id = auth.uid());

create function public.peut_lire_document_confidentiel(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.document_permissions
    where document_id = p_document_id and profile_id = auth.uid() and niveau in ('lecture', 'ecriture')
  )
$$;

create function public.peut_ecrire_document_confidentiel(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.document_permissions
    where document_id = p_document_id and profile_id = auth.uid() and niveau = 'ecriture'
  )
$$;

-- L'auteur de l'upload garde toujours accès à ce qu'il a lui-même déposé, même sans ligne
-- document_permissions explicite pour lui — sans quoi un admin créant un document confidentiel
-- perdrait immédiatement l'accès à sa propre création.
create policy "documents_confidentiel_restreint_select"
  on public.documents as restrictive for select
  to authenticated
  using (
    categorie <> 'confidentiel'
    or uploaded_by_profile_id = auth.uid()
    or public.peut_lire_document_confidentiel(id)
  );

create policy "documents_confidentiel_restreint_update"
  on public.documents as restrictive for update
  to authenticated
  using (categorie <> 'confidentiel' or uploaded_by_profile_id = auth.uid() or public.peut_ecrire_document_confidentiel(id))
  with check (categorie <> 'confidentiel' or uploaded_by_profile_id = auth.uid() or public.peut_ecrire_document_confidentiel(id));

create policy "documents_confidentiel_restreint_delete"
  on public.documents as restrictive for delete
  to authenticated
  using (categorie <> 'confidentiel' or uploaded_by_profile_id = auth.uid() or public.peut_ecrire_document_confidentiel(id));

-- 3) Comptes-rendus de cours : renseignés par le professeur après une séance, visibles par
-- l'admin et par les étudiants qui y ont participé — surfacés dans l'onglet Documents mais pas
-- stockés comme un fichier (données structurées, pas d'upload).
create table public.session_reports (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  session_id uuid not null unique references public.sessions(id),
  teacher_id uuid not null references public.profiles(id),
  themes text,
  resume text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.session_reports enable row level security;

create policy "session_reports_teacher_all"
  on public.session_reports for all
  to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "session_reports_admin_select"
  on public.session_reports for select
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- Même principe que is_teacher_of_student (0018) : encapsulé en fonction pour éviter toute
-- récursion RLS et être réutilisable ailleurs.
create function public.is_student_of_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.session_enrollments se
    where se.session_id = p_session_id and se.student_id = auth.uid()
  )
$$;

create policy "session_reports_student_select"
  on public.session_reports for select
  to authenticated
  using (public.is_student_of_session(session_id));

create function public.toucher_session_report()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger session_reports_touch
  before update on public.session_reports
  for each row execute function public.toucher_session_report();
