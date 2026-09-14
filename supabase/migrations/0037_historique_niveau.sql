-- Historique du niveau d'un étudiant, distinct de diagnostic_calls : ce dernier enregistre
-- l'appel diagnostic d'entrée (un événement CRM, avant même l'inscription), tandis qu'ici
-- chaque ligne est une réévaluation ultérieure du niveau au fil de la progression — l'admin
-- peut en ajouter une nouvelle à tout moment, la précédente reste dans l'historique plutôt que
-- d'être écrasée.
create table public.niveau_evaluations (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  student_id uuid not null references public.profiles(id),
  niveau text not null,
  date_evaluation date not null default current_date,
  evalue_par uuid not null references public.profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.niveau_evaluations enable row level security;

create policy "niveau_evaluations_admin_all"
  on public.niveau_evaluations for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "niveau_evaluations_student_select"
  on public.niveau_evaluations for select
  to authenticated
  using (student_id = auth.uid());

-- Corrige au passage un oubli sur diagnostic_calls (0006) : seule "diagnostic_calls_admin_all"
-- existait, aucune policy n'ouvrait la lecture à l'étudiant concerné. Le niveau évalué à
-- l'appel diagnostic — le point de départ de l'historique affiché ci-dessus — était donc
-- invisible depuis l'espace étudiant malgré l'UI qui prétend l'afficher (DossierEtudiantVue.tsx,
-- stat "Niveau évalué", partagée entre les 3 espaces).
create policy "diagnostic_calls_student_select"
  on public.diagnostic_calls for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.prospect_id = diagnostic_calls.prospect_id
    )
  );
