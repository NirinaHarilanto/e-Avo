-- `security_invoker = true` est indispensable ici : sans cette clause, une vue Postgres
-- s'exécute avec les droits de son créateur (le rôle d'application, propriétaire des objets
-- de migration) et contourne silencieusement le RLS de `hour_ledger` — fuite cross-tenant
-- classique et facile à rater en revue de code, puisque la vue "a l'air" normale.
create view public.student_hours_summary
with (security_invoker = true)
as
select
  student_id,
  etablissement_id,
  coalesce(sum(heures), 0) as heures_consommees
from public.hour_ledger
where type_ecriture = 'debit_etudiant'
group by student_id, etablissement_id;

create view public.teacher_hours_summary
with (security_invoker = true)
as
select
  teacher_id,
  etablissement_id,
  coalesce(sum(heures), 0) as heures_enseignees
from public.hour_ledger
where type_ecriture = 'credit_professeur'
group by teacher_id, etablissement_id;
