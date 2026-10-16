-- Signalé par le client le 2026-10-16 : « après conversion en étudiant DUO, pourquoi le niveau
-- de Antsa ne s'affiche pas ? » — dans l'espace PROFESSEUR, « Mes étudiants ». Le niveau de
-- dentalis (principal du binôme) s'affichait, celui d'Antsa (secondaire) non, alors que les deux
-- ont bien leur propre diagnostic_calls avec niveau_evalue renseigné (0060, trame à deux vitesses).
--
-- Cause : `is_teacher_of_student()` (0018, étendue en 0088 pour les vagues collectives) ne
-- reconnaît QUE `teacher_assignments.student_id = p_student_id` — or le dossier pédagogique
-- partagé d'un binôme DUO vit entièrement sur le PRINCIPAL (0054, « une seule source de
-- vérité ») : seul lui a une ligne dans `teacher_assignments`, jamais la secondaire. La policy
-- `diagnostic_calls_teacher_select` (0076) résout le profil via `prospect_id`, retombe sur le
-- profil d'Antsa elle-même, puis demande `is_teacher_of_student(id d'Antsa)` — qui renvoie
-- toujours faux puisqu'Antsa n'a et n'aura jamais sa propre ligne d'affectation. La RLS filtre
-- alors silencieusement la ligne, sans erreur (même symptôme que 0072/0076 déjà rencontrés).
--
-- Cette fonction est réutilisée par énormément de policies professeur (documents, packages,
-- hour_ledger, niveau_evaluations, diagnostic_calls, contrats professeur…) : le même défaut
-- touche très probablement tout le reste du dossier de la secondaire d'un binôme, pas seulement
-- son niveau. Un seul correctif, ici, les couvre tous — pas la peine de rouvrir chaque policy
-- une par une.
--
-- `create or replace` change le corps, pas la signature (uuid -> boolean inchangé) : pas de
-- `drop function` nécessaire, comme déjà noté en 0088.
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
  ) or exists (
    -- p_student_id est la secondaire d'un binôme : son dossier pédagogique vit sur SA
    -- principale, c'est donc l'affectation de celle-ci qui fait foi.
    select 1
    from public.profiles secondaire
    join public.teacher_assignments ta on ta.student_id = secondaire.duo_partenaire_id
    where secondaire.id = p_student_id
      and secondaire.duo_partenaire_id is not null
      and ta.teacher_id = auth.uid()
  );
$$;
