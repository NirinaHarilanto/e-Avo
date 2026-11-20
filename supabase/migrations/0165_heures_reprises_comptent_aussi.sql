-- Les heures reprises à l'import comptent elles aussi — incident du 2026-11-20.
--
-- Signalé par le client, capture à l'appui : la fiche de Larissa RAOELIMBOLOLONA annonce 32h/32,
-- forfait terminé, quand la fenêtre « Déplacer un étudiant » la présente à 4h sur 32 — donc à
-- mi-parcours, et prête à recevoir 28 h gratuites si l'administration conserve son compteur.
--
-- Le grand livre des heures contient DEUX natures d'écritures de débit :
--   — celles qui décomptent une SÉANCE, et portent son `session_id` ;
--   — celles qui reprennent les heures suivies AVANT la mise en service (0140). Ces cours ont eu
--     lieu hors de HOC : aucune séance ne les porte, et elles se rattachent au forfait qu'elles
--     entament, par `package_id`.
--
-- Les deux fonctions ci-dessous joignaient `hour_ledger` à `sessions` en jointure INTERNE. Une
-- écriture sans `session_id` en était donc écartée d'office — et c'est la plus grosse : 28 h sur
-- les 32 de la promotion de septembre. Relevé sur la base de production avant correction :
--
--   * 21 élèves sur 25 avaient un compteur faux ;
--   * 11, forfait pourtant terminé, passaient pour être à mi-parcours — 286 h auraient pu leur
--     être offertes en « conservant le compteur » lors d'un déplacement ;
--   * 7 n'avaient JAMAIS suivi de séance dans l'application, rien que des heures reprises :
--     `etudiant_a_consomme_heures_promotion` répondait « non » pour eux, et le garde-fou les
--     aurait laissés changer de vague en abandonnant 28 h payées, sans avertissement ni choix.
--
-- La règle corrigée, la même des deux côtés de l'application (voir src/lib/heuresCollectif.ts) :
--
--     une écriture appartient à la classe si la SÉANCE qu'elle décompte y appartient,
--     ou, à défaut de séance, si le FORFAIT qu'elle alimente couvre cette classe.
--
-- Rien à rattraper en données : aucune écriture n'est fausse, elles étaient seulement mal lues.

begin;

create or replace function public.etudiant_a_consomme_heures_promotion(p_student_id uuid, p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.hour_ledger hl
      left join public.sessions s on s.id = hl.session_id
      left join public.packages p on p.id = hl.package_id
     where hl.student_id = p_student_id
       and hl.type_ecriture = 'debit_etudiant'
       and (
         -- Une séance de cette promotion.
         (hl.session_id is not null and s.cohort_id = p_cohort_id)
         -- Ou une reprise d'antériorité dont le forfait relève de cette promotion. Un forfait
         -- sans classe (souscrit avant 0146) ne peut relever que de la promotion où l'élève est
         -- inscrit : l'écarter effacerait l'antériorité des plus anciens dossiers, qui sont
         -- précisément ceux qui en ont.
         or (
           hl.session_id is null
           and p.id is not null
           and p.type_programme = 'collectif'
           and (
             p.cohort_class_id is null
             or exists (
               select 1 from public.cohort_classes cc
                where cc.id = p.cohort_class_id and cc.cohort_id = p_cohort_id
             )
           )
         )
       )
  );
$$;

comment on function public.etudiant_a_consomme_heures_promotion(uuid, uuid) is
  'L''élève a-t-il déjà consommé des heures dans cette promotion — séances suivies ou heures reprises à l''import (0074, corrigé 0165).';

create or replace function public.forfait_collectif_entierement_consomme(
  p_student_id uuid,
  p_cohort_id uuid,
  p_cohort_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with forfait as (
    select coalesce(c.heures_forfait, e.heures_forfait_collectif) as heures
      from public.cohorts c
      join public.etablissements e on e.id = c.etablissement_id
     where c.id = p_cohort_id
  ),
  suivies as (
    select coalesce(sum(hl.heures), 0) as heures
      from public.hour_ledger hl
      left join public.sessions s on s.id = hl.session_id
      left join public.packages p on p.id = hl.package_id
     where hl.student_id = p_student_id
       and hl.type_ecriture = 'debit_etudiant'
       and case
             when p_cohort_class_id is not null then
               (hl.session_id is not null and s.cohort_class_id = p_cohort_class_id)
               or (hl.session_id is null and p.id is not null and p.cohort_class_id = p_cohort_class_id)
             else
               (hl.session_id is not null and s.cohort_id = p_cohort_id)
               or (
                 hl.session_id is null
                 and p.id is not null
                 and p.type_programme = 'collectif'
                 and (
                   p.cohort_class_id is null
                   or exists (
                     select 1 from public.cohort_classes cc
                      where cc.id = p.cohort_class_id and cc.cohort_id = p_cohort_id
                   )
                 )
               )
           end
  )
  select coalesce((select heures from forfait), 0) > 0
     and (select heures from suivies) >= (select heures from forfait);
$$;

comment on function public.forfait_collectif_entierement_consomme(uuid, uuid, uuid) is
  'Forfait collectif entièrement consommé dans la classe de l''élève, à défaut dans sa vague — séances suivies ET heures reprises à l''import (0147, corrigé 0165). Même règle que src/lib/heuresCollectif.ts.';

commit;
