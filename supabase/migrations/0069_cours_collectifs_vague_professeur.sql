-- Cours collectifs : une vague devient une vraie unité pédagogique — demande client du
-- 2026-09-23 (points 8 à 11). Jusqu'ici une vague n'était qu'un regroupement administratif :
-- pas de professeur attitré, pas de planning propre, pas de forfait d'heures, et ses séances
-- étaient des séances ordinaires sans lien avec le groupe.

-- Point 8 : un professeur accompagne les étudiants d'une même vague. Nullable — une vague peut
-- être créée avant qu'on sache qui l'animera.
alter table public.cohorts
  add column teacher_id uuid references public.profiles(id);

-- Point 9 : forfait d'heures d'un étudiant en collectif. La valeur de référence appartient à
-- l'établissement (paramétrable depuis l'espace admin), une vague peut la surcharger. 32 h par
-- défaut, dont la 32e consacrée à l'évaluation de l'étudiant.
alter table public.etablissements
  add column heures_forfait_collectif integer not null default 32
    check (heures_forfait_collectif > 0);

alter table public.cohorts
  add column heures_forfait integer check (heures_forfait > 0);

-- Points 8/10/11 : une séance peut appartenir à une vague. C'est ce lien qui rend le planning
-- visible par tout le groupe, et qui fait décompter l'heure à TOUS les inscrits à la clôture,
-- présents ou non (point 10 : « le rythme de déduction sera le même pour tous les étudiants »).
alter table public.sessions
  add column cohort_id uuid references public.cohorts(id) on delete set null;

create index sessions_cohorte on public.sessions (cohort_id, debut);

-- Fonctions security definer plutôt que des sous-requêtes dans les policies : `cohorts` et
-- `cohort_enrollments` se référencent mutuellement (cohorts_student_select interroge déjà
-- cohort_enrollments, 0027), et des policies croisées entre deux tables sous RLS s'évaluent
-- récursivement. Même parade que is_teacher_of_student (0017) et est_partenaire_duo (0054).
create or replace function public.est_professeur_de_vague(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cohorts c
    where c.id = p_cohort_id and c.teacher_id = auth.uid()
  );
$$;

create or replace function public.est_membre_de_vague(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cohort_enrollments ce
    where ce.cohort_id = p_cohort_id and ce.student_id = auth.uid()
  );
$$;

create or replace function public.est_dans_une_vague_du_professeur(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cohort_enrollments ce
    join public.cohorts c on c.id = ce.cohort_id
    where ce.student_id = p_student_id and c.teacher_id = auth.uid()
  );
$$;

-- Le professeur d'une vague lit sa vague, ses inscrits et leurs profils : sans ça il ne peut
-- ni afficher son groupe, ni établir le planning prévisionnel qu'on lui demande (point 8).
create policy "cohorts_teacher_select"
  on public.cohorts for select
  to authenticated
  using (teacher_id = auth.uid());

create policy "cohort_enrollments_teacher_select"
  on public.cohort_enrollments for select
  to authenticated
  using (public.est_professeur_de_vague(cohort_id));

create policy "profiles_teacher_select_vague"
  on public.profiles for select
  to authenticated
  using (public.est_dans_une_vague_du_professeur(profiles.id));

-- Un élève de la vague voit TOUT le planning du groupe, pas seulement les séances où il est
-- nommément inscrit : c'est le planning prévisionnel commun demandé au point 8.
create policy "sessions_student_select_vague"
  on public.sessions for select
  to authenticated
  using (cohort_id is not null and public.est_membre_de_vague(cohort_id));

-- Et il voit qui d'autre en fait partie — une vague est une classe, pas une liste secrète.
create policy "cohort_enrollments_membre_select"
  on public.cohort_enrollments for select
  to authenticated
  using (public.est_membre_de_vague(cohort_id));
