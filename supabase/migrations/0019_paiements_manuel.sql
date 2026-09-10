-- Suivi manuel des paiements étudiants et des rémunérations professeurs — Phase 3 du
-- chantier "Espace Admin & Espace Professeur". Décision actée avec le client (2026-09-10) :
-- saisie manuelle par l'admin, aucune intégration de paiement en ligne (Stripe) pour cette
-- version — même logique que le stub déjà utilisé pour la visioconférence.

create type public.statut_paiement as enum ('attendu', 'paye', 'en_retard', 'annule');

-- Table d'audit financier : lecture par le titulaire ou l'admin, écriture (insert/update)
-- réservée à l'admin de l'établissement, PAS de policy delete cliente — même principe que
-- hour_ledger (migration 0011). La suppression d'une ligne erronée passe exclusivement par
-- api/admin/supprimer-ligne-financiere.ts (clé service_role), pour garder une trace explicite
-- de toute correction plutôt qu'un delete silencieux depuis le client.
create table public.student_payments (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  student_id uuid not null references public.profiles(id),
  package_id uuid references public.packages(id),
  montant numeric(10, 2) not null,
  devise text not null default 'EUR',
  statut public.statut_paiement not null default 'attendu',
  moyen_paiement text,
  date_echeance date,
  date_paiement date,
  reference text,
  notes text,
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.student_payments enable row level security;

create policy "student_payments_admin_select"
  on public.student_payments for select
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "student_payments_admin_insert"
  on public.student_payments for insert
  to authenticated
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "student_payments_admin_update"
  on public.student_payments for update
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "student_payments_student_select"
  on public.student_payments for select
  to authenticated
  using (student_id = auth.uid());

-- Rémunération professeur : même structure/mêmes règles, avec une période (souvent
-- mensuelle) plutôt qu'un rattachement à un forfait.
create table public.teacher_payments (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  teacher_id uuid not null references public.profiles(id),
  periode_debut date,
  periode_fin date,
  montant numeric(10, 2) not null,
  devise text not null default 'EUR',
  statut public.statut_paiement not null default 'attendu',
  moyen_paiement text,
  date_echeance date,
  date_paiement date,
  reference text,
  notes text,
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.teacher_payments enable row level security;

create policy "teacher_payments_admin_select"
  on public.teacher_payments for select
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "teacher_payments_admin_insert"
  on public.teacher_payments for insert
  to authenticated
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "teacher_payments_admin_update"
  on public.teacher_payments for update
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "teacher_payments_teacher_select"
  on public.teacher_payments for select
  to authenticated
  using (teacher_id = auth.uid());
