-- Déplacer un ou plusieurs élèves d'une classe vers une autre — demande client du 2026-10-30 :
-- « pour chaque classe, rajoute un bouton "Déplacer un étudiant" […] cette fonctionnalité permet
-- de faire passer un ou plusieurs étudiants à une classe supérieure […] quand un étudiant est
-- déplacé dans une autre classe, son compteur d'heures suivies repart de 0 ».
--
-- Deux questions distinctes se cachent derrière cette phrase, et elles appellent deux réponses
-- distinctes :
--
-- 1. LES HEURES SUIVIES. Rien n'est effacé, et rien ne change en base.
--    `student_hours_summary` (0012) cumule TOUTE la vie du dossier, mais aucun écran ne montre ce
--    cumul brut à un élève collectif : les trois endroits qui mesurent son parcours rétrécissent
--    déjà la portée à SA VAGUE (api/_lib/finDeForfait.ts, src/hooks/useEtatsParcoursEtudiants.ts,
--    src/components/admin/FicheCandidatCollectifModale.tsx), précisément pour qu'un élève venu
--    d'un parcours antérieur ne voie pas sa vague déclarée terminée d'emblée.
--    Faire repartir le compteur de zéro, c'est donc rétrécir cette portée d'un cran de plus : de
--    la vague à la CLASSE. Les débits restent rattachés aux séances de l'ancienne classe
--    (`sessions.cohort_class_id`, toujours renseigné pour une séance de classe — voir
--    creerSeance.ts), la nouvelle classe n'en a encore aucun, son compteur vaut zéro de lui-même.
--    Aucune écriture du grand livre n'est touchée ni supprimée : l'historique des heures suivies,
--    la rémunération des professeurs et le parcours pédagogique restent intégralement lisibles.
--    Ce cran se joue entièrement côté application — d'où l'absence de vue ici.
--
-- 2. LE FORFAIT. Décision client du 2026-10-30 : monter de niveau ouvre un NOUVEAU cycle de
--    32 heures, avec de nouveaux frais à encaisser. Le forfait collectif existe déjà, créé
--    automatiquement à l'entrée dans la vague (0071), mais rien ne disait jusqu'ici à quelle
--    CLASSE il correspond ni qu'un précédent a été soldé par le suivant. D'où les deux colonnes
--    ci-dessous. Le forfait précédent n'est jamais réécrit ni supprimé — même règle que les
--    tranches successives de 0057 et que `essai_resultat = 'prolonge'` (0115) : un forfait déjà
--    payé a un reçu derrière lui, on en ouvre un nouveau, on ne retouche pas l'ancien.

alter table public.packages
  add column cohort_class_id uuid references public.cohort_classes(id) on delete set null,
  add column clos_le timestamptz;

comment on column public.packages.cohort_class_id is
  'Classe de niveau que couvre ce forfait collectif (0146). Informatif et financier : les heures suivies se comptent sur sessions.cohort_class_id, jamais ici. Null pour un forfait individuel/DUO, ou collectif sans classe encore assignée.';

comment on column public.packages.clos_le is
  'Forfait soldé parce qu''un suivant a pris le relais lors d''une montée de classe (0146). Jamais remis à null : c''est un historique, pas un état.';

-- Retrouver le forfait en cours d'un élève collectif sans relire toute sa pile de forfaits.
create index if not exists packages_cohort_class_id_idx
  on public.packages (cohort_class_id)
  where cohort_class_id is not null;

-- Rattachement des forfaits collectifs DÉJÀ créés à la classe où se trouve l'élève aujourd'hui :
-- sans cela, les forfaits antérieurs au 2026-10-30 resteraient orphelins et le premier
-- déplacement ne saurait pas lequel solder. Un élève sans classe (vague legacy, affectation en
-- attente) reste à null, ce que la suite tolère.
update public.packages p
   set cohort_class_id = ce.cohort_class_id
  from public.cohort_enrollments ce
 where ce.student_id = p.student_id
   and ce.cohort_class_id is not null
   and p.type_programme = 'collectif'
   and p.cohort_class_id is null;

-- Le forfait créé automatiquement à l'inscription (0071) connaît désormais sa classe, quand elle
-- est déjà choisie à cet instant. Elle ne l'est pas toujours (on inscrit d'abord dans la vague,
-- on répartit en classes ensuite) : un null ici n'empêche rien, le déplacement le renseignera.
create or replace function public.creer_forfait_collectif()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_heures integer;
begin
  -- Un élève qui change de vague garde son forfait entamé : on ne recrée rien, sinon son
  -- compteur d'heures repartirait de zéro à chaque réaffectation. Une montée de CLASSE, elle,
  -- ouvre bien un nouveau forfait (0146) — mais elle passe par un UPDATE de cohort_enrollments,
  -- que ce trigger (after insert) ne voit pas, et par api/admin/deplacer-etudiants-classe.ts qui
  -- s'en charge explicitement. Les deux règles ne se marchent donc jamais dessus.
  if exists (
    select 1 from public.packages p
    where p.student_id = new.student_id and p.type_programme = 'collectif'
  ) then
    return new;
  end if;

  select coalesce(c.heures_forfait, e.heures_forfait_collectif)
    into v_heures
    from public.cohorts c
    join public.etablissements e on e.id = c.etablissement_id
   where c.id = new.cohort_id;

  if v_heures is null then
    return new;
  end if;

  insert into public.packages (etablissement_id, student_id, type_programme, total_heures, cohort_class_id)
  values (new.etablissement_id, new.student_id, 'collectif', v_heures, new.cohort_class_id);

  return new;
end;
$$;
