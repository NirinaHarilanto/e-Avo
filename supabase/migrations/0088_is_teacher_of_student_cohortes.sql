-- `is_teacher_of_student()` (0018) ne reconnaissait qu'un lien individuel
-- (`teacher_assignments`), jamais un lien par vague/classe de cours collectif
-- (`cohort_classes.teacher_id`, 0074) — un professeur de vague ne pouvait donc pas déposer un
-- support de cours dans l'espace de ses élèves de classe collective (policy `documents_insert`,
-- 0018, requise par le dépôt de support de cours du compte rendu, 0087) ni, plus largement,
-- consulter leurs pièces (`documents_teacher_select_student_docs`, 0059).
--
-- `create or replace` change le corps, pas la signature (uuid -> boolean inchangé) : pas de
-- `drop function` nécessaire ici, contrairement au piège 42P13 déjà rencontré sur
-- `attribuer_professeur` (0046/0055).
create or replace function public.is_teacher_of_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.teacher_assignments ta
    where ta.teacher_id = auth.uid() and ta.student_id = p_student_id
  ) or exists (
    select 1
    from public.cohort_enrollments ce
    join public.cohort_classes cc on cc.id = ce.cohort_class_id
    where ce.student_id = p_student_id and cc.teacher_id = auth.uid()
  );
$$;
