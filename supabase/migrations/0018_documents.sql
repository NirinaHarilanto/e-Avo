-- Documents des étudiants et professeurs (pièces d'identité, diplômes, contrats scannés,
-- supports pédagogiques...) — bucket Supabase Storage privé + table de métadonnées. Phase 2
-- du chantier "Espace Admin & Espace Professeur" (voir le plan de référence pour le détail).

-- Généralise le pattern déjà utilisé en 0017 (profiles_teacher_select_students) : "un
-- professeur voit-il cet étudiant ?". Encapsulé en fonction security definer pour être
-- réutilisable par documents et les futures tables (paiements, contrats) sans dupliquer la
-- logique, sur le même principe que current_etablissement_id()/is_admin_etablissement().
create function public.is_teacher_of_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.teacher_assignments ta
    where ta.teacher_id = auth.uid() and ta.student_id = p_student_id
  )
$$;

create type public.categorie_document as enum (
  'identite', 'diplome_certification', 'justificatif_domicile', 'devis', 'facture', 'contrat', 'support_pedagogique', 'autre'
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  owner_profile_id uuid not null references public.profiles(id),
  -- Dénormalisé mais jamais fait confiance depuis le client : recalculé par le trigger
  -- ci-dessous à partir de profiles.role, pour ne jamais dépendre d'une valeur envoyée par le
  -- navigateur dans les policies select qui en dépendent (documents_teacher_select_student_docs).
  owner_role public.role_profil not null,
  uploaded_by_profile_id uuid not null references public.profiles(id),
  categorie public.categorie_document not null default 'autre',
  nom_original text not null,
  mime_type text not null,
  taille_octets bigint not null check (taille_octets > 0 and taille_octets <= 20971520),
  -- Jamais fourni par le client : calculé par le trigger ci-dessous à partir de
  -- etablissement_id/owner_profile_id/id. C'est ce couplage qui permet aux policies
  -- storage.objects de déléguer toute l'autorisation à cette table sans la dupliquer.
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create function public.documents_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select role into new.owner_role from public.profiles where id = new.owner_profile_id;
  if new.owner_role is null then
    raise exception 'owner_profile_id introuvable dans profiles.';
  end if;
  new.storage_path := new.etablissement_id::text || '/' || new.owner_profile_id::text || '/' || new.id::text;
  return new;
end;
$$;

create trigger documents_before_insert
  before insert on public.documents
  for each row execute function public.documents_before_insert();

alter table public.documents enable row level security;

create policy "documents_admin_all"
  on public.documents for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "documents_owner_select"
  on public.documents for select
  to authenticated
  using (owner_profile_id = auth.uid());

create policy "documents_uploader_select"
  on public.documents for select
  to authenticated
  using (uploaded_by_profile_id = auth.uid());

create policy "documents_teacher_select_student_docs"
  on public.documents for select
  to authenticated
  using (owner_role = 'etudiant' and public.is_teacher_of_student(owner_profile_id));

create policy "documents_insert"
  on public.documents for insert
  to authenticated
  with check (
    uploaded_by_profile_id = auth.uid()
    and (
      owner_profile_id = auth.uid()
      or public.is_admin_etablissement()
      or public.is_teacher_of_student(owner_profile_id)
    )
  );

-- Suppression normalement effectuée via l'API service_role (api/documents/supprimer.ts, qui
-- retire l'objet Storage puis la ligne dans cet ordre) pour garder les deux systèmes
-- cohérents ; cette policy ne fait qu'autoriser le principal cas d'usage direct (un
-- utilisateur retire son propre upload) si jamais l'API n'est pas utilisée.
create policy "documents_uploader_delete"
  on public.documents for delete
  to authenticated
  using (uploaded_by_profile_id = auth.uid());

-- Bucket Storage privé pour les fichiers eux-mêmes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 20971520,
  array[
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

-- Les policies storage.objects délèguent entièrement l'autorisation à la table `documents` :
-- un fichier n'est lisible/supprimable que si une ligne `documents` portant ce storage_path
-- existe et que les mêmes règles que ci-dessus s'appliquent. Aucune logique dupliquée, aucun
-- risque de récursion (documents ne référence jamais storage.objects).
create policy "documents_storage_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name
        and (
          d.uploaded_by_profile_id = auth.uid()
          or d.owner_profile_id = auth.uid()
          or (d.owner_role = 'etudiant' and public.is_teacher_of_student(d.owner_profile_id))
          or (d.etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
        )
    )
  );

create policy "documents_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name
        and d.uploaded_by_profile_id = auth.uid()
    )
  );

create policy "documents_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name
        and (
          d.uploaded_by_profile_id = auth.uid()
          or (d.etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
        )
    )
  );
