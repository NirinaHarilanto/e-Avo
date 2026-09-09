-- Bug trouvé en testant le calendrier professeur de bout en bout : un professeur ne peut lire
-- ni son propre profil (déjà couvert par `profiles_self_select`) ni celui de ses élèves — et
-- réciproquement un élève ne peut pas lire le profil de son professeur. Sans policy dédiée, ces
-- lectures renvoient silencieusement un tableau vide (RLS, pas d'erreur), donc l'UI affichait
-- "Aucun élève ne vous est actuellement attribué" et des noms de professeur manquants alors que
-- `teacher_assignments` contient bien la relation.
--
-- Basé sur `teacher_assignments`, qui n'a lui-même aucune policy référençant `profiles` — donc
-- aucun risque de récursion (même raisonnement que 0016).
create policy "profiles_teacher_select_students"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.teacher_assignments ta
      where ta.teacher_id = auth.uid() and ta.student_id = profiles.id
    )
  );

create policy "profiles_student_select_teacher"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.teacher_assignments ta
      where ta.student_id = auth.uid() and ta.teacher_id = profiles.id
    )
  );
