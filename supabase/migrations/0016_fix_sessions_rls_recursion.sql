-- Bug trouvé en testant le calendrier professeur de bout en bout : un professeur lisant ses
-- propres séances (`sessions_teacher_all`) déclenche aussi l'évaluation de
-- `sessions_student_select` (0009), qui interroge `session_enrollments` ; la policy
-- `session_enrollments_teacher_select` de cette même table interroge `sessions` en retour →
-- Postgres renvoie "infinite recursion detected in policy for relation sessions" (42P17) dès
-- qu'un professeur ou un admin lit `sessions`. Même mécanisme que celui déjà évité pour
-- `profiles`/`is_admin_etablissement()` (0003) : on route la vérification élève par une
-- fonction `security definer`, dont la lecture interne de `session_enrollments` s'exécute avec
-- les droits du propriétaire (postgres, BYPASSRLS) et ne redéclenche donc pas les policies de
-- cette table — le cycle est cassé.
create function public.est_inscrit_a_la_seance(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.session_enrollments
    where session_id = p_session_id and student_id = auth.uid()
  )
$$;

drop policy "sessions_student_select" on public.sessions;

create policy "sessions_student_select"
  on public.sessions for select
  to authenticated
  using (public.est_inscrit_a_la_seance(sessions.id));
