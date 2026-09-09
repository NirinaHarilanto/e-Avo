create type public.statut_invitation as enum ('en_attente', 'acceptee', 'excusee');

create table public.session_enrollments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id),
  -- Période d'affectation active pour CET élève au moment de la séance — pas celle du prof
  -- de la séance : en cours collectif, les élèves peuvent être sur des teacher_assignments
  -- différents. La frise "historique par professeur" du dossier étudiant se reconstruit par
  -- un group by sur cette colonne, valable en individuel comme en collectif.
  teacher_assignment_id uuid references public.teacher_assignments(id),
  invitation_statut public.statut_invitation not null default 'en_attente',
  present boolean,
  minutes_connecte integer,
  created_at timestamptz not null default now(),
  unique (session_id, student_id)
);

alter table public.session_enrollments enable row level security;

create policy "session_enrollments_admin_all"
  on public.session_enrollments for all
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_enrollments.session_id
        and s.etablissement_id = public.current_etablissement_id()
    )
    and public.is_admin_etablissement()
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = session_enrollments.session_id
        and s.etablissement_id = public.current_etablissement_id()
    )
    and public.is_admin_etablissement()
  );

create policy "session_enrollments_student_select"
  on public.session_enrollments for select
  to authenticated
  using (student_id = auth.uid());

create policy "session_enrollments_teacher_select"
  on public.session_enrollments for select
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_enrollments.session_id and s.teacher_id = auth.uid()
    )
  );

-- Policy élève sur `sessions`, différée depuis 0008 (dépend de cette table). Sans risque de
-- récursion : elle interroge session_enrollments, pas sessions elle-même.
create policy "sessions_student_select"
  on public.sessions for select
  to authenticated
  using (
    exists (
      select 1 from public.session_enrollments se
      where se.session_id = sessions.id and se.student_id = auth.uid()
    )
  );
