-- Rattrape les écritures d'heures antérieures à 0126, puis rend le type de facturation
-- obligatoire (incident du 2026-10-13).
--
-- 0126 a ajouté `hour_ledger.type_facturation` mais n'a PAS rempli les écritures déjà en base :
-- elles sont restées à NULL, et `src/lib/remuneration.ts` les traite par convention comme
-- « individuel ». Conséquence constatée en production : une vraie séance collective de la classe
-- Beginner (4 élèves) apparaissait au taux individuel dans le TimeSheet du professeur — soit
-- 10 000 Ar au lieu de 15 000 Ar, sans que rien ne le signale.
--
-- Le type réel se relit sans ambiguïté sur la séance : `sessions.type` porte individuel/collectif
-- (0008), et le DUO se reconnaît au lien asymétrique `profiles.duo_partenaire_id` (0054) entre
-- les deux seuls inscrits. C'est la même règle que `api/professeur/cloturer-seance.ts`, corrigé
-- le même jour pour s'appuyer lui aussi sur `sessions.type` et non sur la seule présence de
-- `cohort_id` — une séance à plusieurs élèves hors vague est `type = 'collectif'` avec
-- `cohort_id` à null (voir planifier-seances-prevision.ts), cas qui était mal classé.

update public.hour_ledger as h
set type_facturation = 'collectif'
from public.sessions as s
where h.type_facturation is null
  and s.id = h.session_id
  and (s.type = 'collectif' or s.cohort_id is not null);

-- DUO : séance non collective comptant EXACTEMENT deux inscrits, dont l'un porte le lien vers
-- l'autre. Le lien est asymétrique (seul le secondaire porte `duo_partenaire_id`, 0054), d'où la
-- jointure dans ce seul sens — la paire est la même quel que soit le membre qui le porte.
update public.hour_ledger as h
set type_facturation = 'duo'
from public.sessions as s
where h.type_facturation is null
  and s.id = h.session_id
  and (select count(*) from public.session_enrollments as e where e.session_id = s.id) = 2
  and exists (
    select 1
    from public.session_enrollments as a
    join public.session_enrollments as b
      on b.session_id = a.session_id and b.student_id <> a.student_id
    join public.profiles as pa on pa.id = a.student_id
    where a.session_id = s.id
      and pa.duo_partenaire_id = b.student_id
  );

-- Tout le reste est individuel : une séance à un seul inscrit, ou à plusieurs sans lien de duo.
update public.hour_ledger
set type_facturation = 'individuel'
where type_facturation is null;

-- Plus aucune écriture ne peut désormais échapper au classement : c'était la faille qui a permis
-- à ces lignes de passer silencieusement au taux individuel. `api/professeur/cloturer-seance.ts`
-- est le SEUL point d'insertion de cette table (vérifié) et renseigne toujours la colonne.
alter table public.hour_ledger
  alter column type_facturation set not null;

comment on column public.hour_ledger.type_facturation is
  'Type de cours facturé, figé à la clôture de la séance (0126). Obligatoire depuis 0127 : un NULL retombait silencieusement sur le taux individuel et sous-payait les séances collectives.';
