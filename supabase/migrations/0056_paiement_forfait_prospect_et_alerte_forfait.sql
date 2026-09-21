-- Deux demandes client du 2026-09-21 (fin de session) :
--   1. Le paiement du forfait choisi doit pouvoir être encaissé DÈS l'étape prospect, avec le
--      même processus que la section Facturation, et la conversion en étudiant doit rester
--      bloquée tant qu'aucun paiement n'est enregistré.
--   2. Quand le forfait d'un élève arrive à son terme (2 h restantes), un message de
--      l'établissement doit apparaître automatiquement dans son espace personnel.

-- ---------------------------------------------------------------------------------------------
-- 1. Paiement rattaché à un prospect
-- ---------------------------------------------------------------------------------------------
-- Réutiliser `student_payments` plutôt que créer une table de paiements prospects : c'est le
-- même argent, et c'est la condition pour que « tout soit lié » comme demandé — la ligne
-- encaissée avant la conversion DEVIENT la ligne de paiement de l'étudiant (voir
-- api/admin/convert-prospect.ts, qui lui pose `student_id` et `package_id` à la conversion).
-- Toute la mécanique déjà en place suit sans modification : acomptes (`paiement_versements`,
-- 0049), recalcul du reste dû par trigger, reçu automatique, génération de facture.
alter table public.student_payments
  alter column student_id drop not null;

-- Pas de `on delete cascade/set null` volontairement : un prospect qui a versé de l'argent ne
-- doit pas pouvoir disparaître en silence, et un `set null` violerait la contrainte ci-dessous
-- sur une ligne pas encore convertie.
alter table public.student_payments
  add column prospect_id uuid references public.prospects(id);

-- Une ligne a toujours un titulaire : le prospect avant conversion, l'étudiant après (les deux
-- ensemble une fois converti, ce qui garde la trace de l'origine du paiement).
alter table public.student_payments
  add constraint student_payments_titulaire
  check (student_id is not null or prospect_id is not null);

create index student_payments_prospect on public.student_payments (prospect_id);

comment on column public.student_payments.prospect_id is
  'Prospect ayant réglé son forfait avant conversion (0056). Conservé après conversion, quand student_id est renseigné à son tour.';

-- Le reçu automatique (0030) insérait `new.student_id` dans `invoices.student_id`, colonne NOT
-- NULL : sur un paiement encore rattaché à un prospect, le solde complet aurait fait échouer
-- l'encaissement. Deux changements :
--   - on ne génère rien tant que le titulaire est un prospect ;
--   - l'idempotence ne repose plus sur `old.statut <> 'paye'` mais sur l'existence réelle du
--     reçu, sinon un paiement soldé AVANT la conversion n'aurait jamais son reçu (au moment où
--     la conversion pose `student_id`, le statut est déjà 'paye' depuis longtemps et l'ancienne
--     garde bloquait). Le reçu est donc émis à la conversion pour ces dossiers-là.
create or replace function public.generer_recu_paiement_etudiant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_numero text;
  v_objet text;
  v_forfait public.packages%rowtype;
begin
  if new.student_id is null or new.statut is distinct from 'paye' then
    return new;
  end if;
  if exists (select 1 from public.invoices where payment_id = new.id) then
    return new;
  end if;

  if new.package_id is not null then
    select * into v_forfait from public.packages where id = new.package_id;
  end if;
  v_objet := case
    when found then 'Reçu — forfait ' || v_forfait.type_programme::text || ' (' || v_forfait.total_heures || ' h)'
    else 'Reçu de paiement'
  end;
  v_numero := 'REC-' || to_char(now(), 'YYYY') || '-' || substr(new.id::text, 1, 8);

  insert into public.invoices (
    etablissement_id, student_id, numero, statut, objet, lignes,
    montant_ht, montant_tva, montant_ttc, date_emission, date_paiement, payment_id, created_by_profile_id
  )
  values (
    new.etablissement_id, new.student_id, v_numero, 'payee', v_objet,
    jsonb_build_array(jsonb_build_object('libelle', v_objet, 'quantite', 1, 'prix_unitaire', new.montant)),
    new.montant, 0, new.montant, current_date, coalesce(new.date_paiement, current_date),
    new.id, new.created_by_profile_id
  );

  insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
  values (new.etablissement_id, new.student_id, 'recu_paiement', 'Votre reçu est disponible', v_objet, '/mon-espace/paiements');

  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Alerte « forfait bientôt épuisé »
-- ---------------------------------------------------------------------------------------------
-- Déclenchée par l'écriture d'heures plutôt que depuis `cloturer-seance.ts` : `hour_ledger` est
-- le seul point de passage obligé de toute consommation d'heures, quel que soit le chemin
-- (clôture par le professeur aujourd'hui, autre demain). Même raisonnement que le trigger de
-- reçu automatique (0030).
--
-- Le reste dû se calcule sur TOUT l'historique (somme des forfaits souscrits moins somme des
-- heures consommées) : un élève qui enchaîne plusieurs forfaits voit donc son solde cumulé, ce
-- qui est exactement ce qu'affiche déjà son dossier.
create function public.alerter_forfait_bientot_epuise()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total numeric;
  v_consomme numeric;
  v_restant numeric;
  v_dernier_forfait timestamptz;
begin
  if new.type_ecriture is distinct from 'debit_etudiant' or new.student_id is null then
    return new;
  end if;

  select coalesce(sum(total_heures), 0), max(created_at)
    into v_total, v_dernier_forfait
    from public.packages
    where student_id = new.student_id;

  -- Aucun forfait : élève en cours collectif (facturé à la vague, voir 0027) — rien à épuiser.
  if v_dernier_forfait is null then
    return new;
  end if;

  select coalesce(sum(heures), 0)
    into v_consomme
    from public.hour_ledger
    where student_id = new.student_id and type_ecriture = 'debit_etudiant';

  v_restant := v_total - v_consomme;

  if v_restant > 2 then
    return new;
  end if;

  -- Une seule alerte par forfait : la comparaison porte sur la date du dernier forfait souscrit,
  -- donc souscrire un nouveau forfait réarme l'alerte sans qu'on ait à effacer quoi que ce soit.
  -- Sans cette garde, chaque séance clôturée en fin de forfait renverrait le même message.
  if exists (
    select 1 from public.notifications
    where destinataire_profile_id = new.student_id
      and type = 'forfait_bientot_epuise'
      and created_at >= v_dernier_forfait
  ) then
    return new;
  end if;

  insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
  values (
    new.etablissement_id,
    new.student_id,
    'forfait_bientot_epuise',
    case when v_restant <= 0 then 'Votre forfait est arrivé à son terme' else 'Votre forfait arrive à son terme' end,
    case
      when v_restant <= 0
        then 'Toutes les heures de votre forfait ont été utilisées. Pour poursuivre votre apprentissage sans interruption, rapprochez-vous de Hari Online Club afin de souscrire un nouveau forfait.'
      else 'Il vous reste ' || trim(to_char(v_restant, 'FM999990.99')) || ' h sur votre forfait. Pour poursuivre votre apprentissage sans interruption, rapprochez-vous de Hari Online Club afin de souscrire un nouveau forfait.'
    end,
    '/mon-espace'
  );

  return new;
end;
$$;

create trigger hour_ledger_alerte_forfait
  after insert on public.hour_ledger
  for each row execute function public.alerter_forfait_bientot_epuise();
