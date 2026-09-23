-- Suite immédiate de 0063 : `profiles_teacher_select_students` (0017) ne s'appuie que sur
-- `teacher_assignments`, qui n'existe jamais pour le second membre d'un binôme DUO (son dossier
-- est celui du principal, voir 0054) — un professeur ne pouvait donc jamais lire le profil du
-- partenaire d'un de ses élèves en duo, malgré la policy 0063 ouvrant déjà `packages`/`contracts`
-- pour ce même cas. Sans elle, `useSecondairesDuo` (espace professeur) renvoyait silencieusement
-- 0 ligne (RLS, pas d'erreur) et le bloc DUO restait éclaté côté professeur — demande client du
-- 2026-09-23, « il faut que le bloc étudiant DUO soit repris exactement ».
create policy "profiles_teacher_select_secondaire_duo"
  on public.profiles for select
  to authenticated
  using (
    duo_partenaire_id is not null
    and exists (
      select 1 from public.teacher_assignments ta
      where ta.teacher_id = auth.uid() and ta.student_id = profiles.duo_partenaire_id
    )
  );
