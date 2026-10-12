-- Trois taux horaires par professeur — individuel, duo, collectif — facturés selon le type de
-- chaque séance donnée (demande client du 2026-10-12) : jusqu'ici un seul `taux_horaire`
-- s'appliquait à toutes les heures, quel que soit le type de cours.

-- `taux_horaire` devient `taux_horaire_individuel` (renommage, pas un ajout à côté) : c'est déjà
-- ce que ce champ représentait de fait, un seul renommage préserve les valeurs déjà saisies par
-- les admins plutôt que de les perdre derrière un nouveau nom.
alter table public.profiles rename column taux_horaire to taux_horaire_individuel;
alter table public.profiles add column taux_horaire_duo numeric(10, 2);
alter table public.profiles add column taux_horaire_collectif numeric(10, 2);

comment on column public.profiles.taux_horaire_individuel is
  'Taux horaire (Ar/h) pour une séance individuelle — professeur uniquement.';
comment on column public.profiles.taux_horaire_duo is
  'Taux horaire (Ar/h) pour une séance en binôme DUO — professeur uniquement.';
comment on column public.profiles.taux_horaire_collectif is
  'Taux horaire (Ar/h) pour une séance de classe collective — professeur uniquement.';

-- Remplissage par défaut demandé pour les professeurs déjà en place (2026-10-12) : individuel et
-- duo à 10 000 Ar, collectif à 15 000 Ar, quelle que soit la valeur individuelle déjà saisie —
-- nouvelle base commune explicitement voulue, ajustable ensuite par fiche depuis l'espace admin.
update public.profiles
set
  taux_horaire_individuel = 10000,
  taux_horaire_duo = 10000,
  taux_horaire_collectif = 15000
where role = 'professeur';

-- empecher_promotion_profil (0082) protégeait `taux_horaire` : étendu aux deux nouvelles
-- colonnes, recréée à l'identique sinon (create or replace, même garde-fou).
create or replace function public.empecher_promotion_profil()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() not in ('service_role', 'postgres') then
    if new.role is distinct from old.role
      or new.etablissement_id is distinct from old.etablissement_id
      or new.status is distinct from old.status
    then
      raise exception 'Modification de role/etablissement_id/status réservée au backend (service_role).';
    end if;
    if (
        new.taux_horaire_individuel is distinct from old.taux_horaire_individuel
        or new.taux_horaire_duo is distinct from old.taux_horaire_duo
        or new.taux_horaire_collectif is distinct from old.taux_horaire_collectif
      )
      and auth.uid() = old.id and not public.is_admin_etablissement()
    then
      raise exception 'Modification du taux horaire réservée à un administrateur.';
    end if;
    if new.statut_integration is distinct from old.statut_integration and not public.is_admin_etablissement() then
      raise exception 'Validation de l''intégration réservée à un administrateur.';
    end if;
  end if;
  return new;
end;
$$;

-- Type de séance figé au moment de la clôture (api/professeur/cloturer-seance.ts), pour savoir
-- ensuite quel des 3 taux appliquer à chaque écriture sans jamais avoir à recalculer
-- `estSeanceDuo`/`estBinomeDuo` après coup — un commentaire de src/lib/seances.ts (2026-10-11)
-- raconte déjà un bug dû à cette détection dupliquée ; `sessions.type` lui-même ne distingue pas
-- le duo (0008 : seulement 'individuel'/'collectif'). Nulle pour toute écriture antérieure à
-- cette migration — src/lib/remuneration.ts la traite alors comme 'individuel', exactement ce
-- qu'elle facturait déjà avant ce chantier.
alter table public.hour_ledger
  add column type_facturation text check (type_facturation in ('individuel', 'collectif', 'duo'));

comment on column public.hour_ledger.type_facturation is
  'Type de séance au moment de la clôture, pour choisir le taux horaire applicable (0126). NULL = antérieure, traitée comme ''individuel''.';

-- Modification d'un TimeSheet par l'admin au moment de la validation (demande client du
-- 2026-10-12) : seules des lignes entières peuvent être retirées avant de valider (ex. séance
-- incluse à tort), jamais une heure retouchée au milieu d'une ligne — la correction d'une heure
-- erronée se fait sur la séance elle-même, pas en douce sur le relevé. Justification obligatoire
-- dès qu'au moins une ligne est retirée (voir api/admin/traiter-timesheet.ts), tracée ici pour
-- que le professeur et l'admin la retrouvent ensuite sur le document.
alter table public.timesheets
  add column justificatif_modification text,
  add column lignes_retirees jsonb not null default '[]'::jsonb;

comment on column public.timesheets.justificatif_modification is
  'Motif donné par l''admin si des lignes ont été retirées avant validation (0126). NULL si le relevé a été validé sans modification.';
comment on column public.timesheets.lignes_retirees is
  'Lignes retirées par l''admin avant validation (0126), même forme que `lignes` — leurs heures sont libérées pour un prochain relevé, jamais payées sur celui-ci.';
