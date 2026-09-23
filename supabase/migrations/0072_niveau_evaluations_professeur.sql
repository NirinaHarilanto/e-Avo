-- Correctif d'un oubli de RLS constaté le 2026-09-23 : « niveau évalué » incohérent entre
-- l'espace admin et l'espace professeur pour un même élève (rapporté sur le binôme DUO
-- Bensaloc/Sandra, mais concerne en réalité TOUS les élèves).
--
-- `niveau_evaluations` (0037, historique des réévaluations de niveau au fil de la progression,
-- distinct du niveau initial figé dans `diagnostic_calls`) n'a jamais eu de policy pour le
-- professeur — seuls `niveau_evaluations_admin_all` et `niveau_evaluations_student_select`
-- existaient. Un professeur qui consultait le dossier d'un élève recevait donc TOUJOURS un
-- tableau vide de ce côté (RLS filtre silencieusement, sans erreur), et
-- DossierEtudiantVue.tsx retombait sur `diagnostic?.niveau_evalue` — le niveau de l'appel
-- diagnostic d'ENTRÉE, jamais mis à jour — alors que l'admin, lui, voyait la dernière
-- réévaluation réelle. Le même « niveau évalué », partagé par les 3 espaces dans le même
-- composant, affichait donc deux valeurs différentes selon qui regardait.
--
-- Même fonction `is_teacher_of_student()` déjà utilisée pour contrats/documents/packages/
-- hour_ledger (0018/0061/0063) — lecture seule, la policy admin reste la seule à permettre
-- l'écriture d'une nouvelle réévaluation.
create policy "niveau_evaluations_teacher_select"
  on public.niveau_evaluations for select
  to authenticated
  using (public.is_teacher_of_student(student_id));
