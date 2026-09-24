-- Correctif d'un oubli de RLS analogue à celui de la migration 0072 (« niveau évalué
-- incohérent entre l'espace admin et l'espace professeur ») — demande client du 2026-09-24 :
-- « les niveaux des étudiants ne s'affichent pas dans l'espace professeur, section Étudiants ».
--
-- `diagnostic_calls` n'a jamais eu de policy pour le rôle `professeur` — seules
-- `diagnostic_calls_admin_all` (0006) et `diagnostic_calls_student_select`/
-- `diagnostic_calls_duo_partenaire_select` (0037/0065) existaient. `DossierEtudiantVue.tsx`
-- calcule le niveau affiché via `niveauDefinitif(diagnostic, niveaux)` (src/lib/niveauEtudiant.ts)
-- : sans réévaluation de progression (`niveau_evaluations`, le cas courant d'un élève tout juste
-- converti depuis un test oral collectif), c'est `diagnostic_calls.niveau_evalue` qui doit
-- s'afficher — un professeur consultant le dossier recevait donc toujours `null` de ce côté (RLS
-- filtre silencieusement, sans erreur), là où l'admin voyait le niveau réel.
--
-- Même jointure que `diagnostic_calls_student_select` (0037, `diagnostic_calls` est keyée par
-- `prospect_id`, pas directement par `profiles.id`) combinée à `is_teacher_of_student()` (0018,
-- déjà utilisée pour documents/contrats/packages/hour_ledger/niveau_evaluations) — couvre déjà le
-- collectif depuis la migration 0075, qui alimente désormais `teacher_assignments` pour les
-- élèves d'une classe de niveau au même titre qu'une affectation individuelle/duo.
create policy "diagnostic_calls_teacher_select"
  on public.diagnostic_calls for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.prospect_id = diagnostic_calls.prospect_id
        and public.is_teacher_of_student(profiles.id)
    )
  );
