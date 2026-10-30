-- Rejoindre une nouvelle classe quand son forfait est terminé — demande client du 2026-10-30 :
-- « pendant la création d'une nouvelle classe, il devrait être possible de rajouter des étudiants
-- déjà existants dans HOC, à condition que l'étudiant ait déjà consommé toutes ses heures de
-- forfait ET que l'étudiant soit déjà inscrit en cours collectif ».
--
-- Ces élèves-là viennent presque toujours d'une vague PRÉCÉDENTE : c'est le mouvement même que
-- décrit la demande — une promotion se termine, une nouvelle s'ouvre, et ceux qui ont fini leurs
-- 32 heures y reprennent une classe. Or le garde-fou posé en 0074 l'interdit :
--
--     « un étudiant ne peut changer de promotion que s'il n'a encore consommé AUCUNE heure de
--       son forfait collectif dans sa promotion actuelle »
--
-- Ce garde-fou visait l'élève BALLOTTÉ EN PLEIN PARCOURS, dont le compteur se serait perdu entre
-- deux vagues : à l'époque, les heures d'un forfait collectif ne savaient pas dire à quelle
-- portion du cursus elles appartenaient. Il ne visait pas celui qui a tout suivi. Depuis 0146,
-- un forfait est soldé puis réouvert classe par classe, et les heures se comptent dans la classe
-- où elles ont été faites : plus rien ne se perd, et la condition posée par le client — avoir
-- consommé TOUT son forfait — est exactement celle qui rend ce garde-fou sans objet.
--
-- Il est donc assoupli pour ce seul cas, et pour aucun autre : un élève à mi-parcours reste
-- retenu dans sa vague, avec le même message qu'avant.

/* Forfait collectif entièrement consommé ? Même règle que `forfaitEntierementConsomme`
   (src/lib/heures.ts) et que `mesurerParcours` (api/_lib/finDeForfait.ts), posée ici pour que la
   base, l'écran de création de classe et la route de déplacement répondent la même chose :
   - le forfait est celui de la vague, à défaut celui de l'établissement (cascade du trigger
     0071) ;
   - les heures consommées sont celles de SA CLASSE (0146), à défaut celles de sa vague ;
   - un forfait inconnu ou nul n'est jamais « terminé » — sans forfait connu, mieux vaut retenir
     l'élève que le laisser partir sur une mesure inexistante. */
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
      join public.sessions s on s.id = hl.session_id
     where hl.student_id = p_student_id
       and hl.type_ecriture = 'debit_etudiant'
       and case
             when p_cohort_class_id is not null then s.cohort_class_id = p_cohort_class_id
             else s.cohort_id = p_cohort_id
           end
  )
  select coalesce((select heures from forfait), 0) > 0
     and (select heures from suivies) >= (select heures from forfait);
$$;

comment on function public.forfait_collectif_entierement_consomme(uuid, uuid, uuid) is
  'Forfait collectif entièrement consommé dans la classe de l''élève, à défaut dans sa vague (0147). Même règle que src/lib/heures.ts et api/_lib/finDeForfait.ts.';

create or replace function public.verifier_pas_de_consommation_avant_changement_promotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.cohort_id is distinct from new.cohort_id
     and public.etudiant_a_consomme_heures_promotion(old.student_id, old.cohort_id)
     -- L'exception de 0147 : un parcours mené à son terme n'a plus rien à perdre en changeant de
     -- promotion, il en recommence un. C'est la condition posée par le client pour rejoindre une
     -- nouvelle classe, et c'est la seule qui lève ce garde-fou.
     and not public.forfait_collectif_entierement_consomme(old.student_id, old.cohort_id, old.cohort_class_id) then
    raise exception 'Cet élève a déjà suivi des séances décomptées de son forfait dans sa promotion actuelle, sans l''avoir terminé : le changement de promotion n''est plus possible.';
  end if;
  return new;
end;
$$;
