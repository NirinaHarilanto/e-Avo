-- Deux demandes client du 2026-09-29.
--
-- 1. Séance d'essai flexible et facturée à part. L'essai n'est plus une heure déduite du forfait
--    visé : l'élève prend 1, 2 ou 3 heures d'essai, facturées au tarif horaire (35 000 Ar/h), et
--    s'il poursuit il paie ensuite le forfait complet de son choix (qu'il peut changer par rapport
--    à celui retenu au départ). Côté schéma, seule la durée est nouvelle ; le calcul du forfait
--    de suite change dans api/admin/decider-essai.ts.
--
-- 2. Le paiement en plusieurs fois n'est accepté que pour un forfait d'au moins 40 heures.

alter table public.prospects
  add column essai_heures smallint not null default 1 check (essai_heures between 1 and 3);

comment on column public.prospects.essai_heures is
  'Durée de la séance d''essai demandée (1 à 3 h), facturée à l''heure, hors forfait (0078).';

-- ---------------------------------------------------------------------------------------------
-- Alerte de fin d'essai : ne partir qu'une fois TOUTES les heures d'essai consommées. Le seuil
-- « 2 h restantes » du forfait ordinaire la faisait partir dès la 1re heure d'un essai de 3 h.
-- Reprend 0061 à l'identique pour le reste.
-- ---------------------------------------------------------------------------------------------
create or replace function public.alerter_forfait_bientot_epuise()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total numeric;
  v_consomme numeric;
  v_restant numeric;
  v_dernier public.packages%rowtype;
  v_eleve public.profiles%rowtype;
begin
  if new.type_ecriture is distinct from 'debit_etudiant' or new.student_id is null then
    return new;
  end if;

  select * into v_dernier
    from public.packages
    where student_id = new.student_id
    order by created_at desc
    limit 1;

  if not found then
    return new;
  end if;

  select coalesce(sum(total_heures), 0)
    into v_total
    from public.packages
    where student_id = new.student_id;

  select coalesce(sum(heures), 0)
    into v_consomme
    from public.hour_ledger
    where student_id = new.student_id and type_ecriture = 'debit_etudiant';

  v_restant := v_total - v_consomme;

  if v_dernier.essai and v_dernier.essai_resultat is null then
    if v_restant > 0 then
      return new;
    end if;
    if exists (
      select 1 from public.notifications
      where destinataire_profile_id = new.student_id
        and type = 'essai_termine'
        and created_at >= v_dernier.created_at
    ) then
      return new;
    end if;

    insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
    values (
      new.etablissement_id,
      new.student_id,
      'essai_termine',
      'Votre séance d’essai est terminée',
      'Merci d’avoir suivi votre séance d’essai avec Hari Online Club. Pour poursuivre votre apprentissage, choisissez le forfait qui vous convient avec l’établissement ; sans suite de votre part, seules vos heures d’essai vous seront facturées.',
      '/mon-espace'
    );

    insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
    select
      new.etablissement_id,
      p.id,
      'essai_termine_admin',
      'Séance d’essai terminée — décision à enregistrer',
      coalesce(e.prenom || ' ' || e.nom, 'Un élève') || ' a terminé sa séance d’essai. Enregistrez sa décision (poursuivre avec un forfait ou s’arrêter) depuis l’onglet Forfait de son dossier.',
      '/admin/etudiants/' || new.student_id
    from public.profiles p
    left join public.profiles e on e.id = new.student_id
    where p.etablissement_id = new.etablissement_id
      and p.role = 'admin_etablissement'
      and p.status = 'approved';

    return new;
  end if;

  if v_restant > 2 then
    return new;
  end if;

  if exists (
    select 1 from public.notifications
    where destinataire_profile_id = new.student_id
      and type = 'forfait_bientot_epuise'
      and created_at >= v_dernier.created_at
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

  if v_restant <= 0 and not exists (
    select 1 from public.notifications
    where type = 'forfait_termine_admin'
      and created_at >= v_dernier.created_at
      and message like '%' || new.student_id::text || '%'
  ) then
    select * into v_eleve from public.profiles where id = new.student_id;

    insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
    select
      new.etablissement_id,
      p.id,
      'forfait_termine_admin',
      'Forfait épuisé — à relancer',
      coalesce(v_eleve.prenom || ' ' || v_eleve.nom, 'Un élève') || ' a épuisé son forfait. Relancez-le pour un nouveau forfait depuis son dossier (identifiant ' || new.student_id::text || ').',
      '/admin/etudiants/' || new.student_id
    from public.profiles p
    where p.etablissement_id = new.etablissement_id
      and p.role = 'admin_etablissement'
      and p.status = 'approved';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Paiement en plusieurs fois réservé aux forfaits de 40 h et plus.
-- ---------------------------------------------------------------------------------------------
-- Volume d'heures couvert par une ligne de paiement élève : celui de son forfait, ou, pour un
-- paiement encaissé au stade prospect (0056, pas encore de forfait), celui du tarif choisi — ou
-- de la séance d'essai si c'est elle qu'on encaisse. Nul quand rien ne permet de le savoir
-- (paiement libre saisi à la main) : la règle ne s'applique alors pas.
create or replace function public.heures_couvertes_paiement(p_student_payment_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select pk.total_heures
       from public.student_payments sp
       join public.packages pk on pk.id = sp.package_id
      where sp.id = p_student_payment_id),
    (select case when pr.essai_demande then pr.essai_heures::numeric else t.heures end
       from public.student_payments sp
       join public.prospects pr on pr.id = sp.prospect_id
       left join public.tarifs t on t.id = pr.tarif_choisi_id
      where sp.id = p_student_payment_id
        and sp.package_id is null)
  );
$$;

create or replace function public.verifier_paiement_en_plusieurs_fois()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_heures numeric;
  v_paiement public.student_payments%rowtype;
begin
  if new.student_payment_id is null then
    return new;
  end if;

  select * into v_paiement from public.student_payments where id = new.student_payment_id;
  v_heures := public.heures_couvertes_paiement(new.student_payment_id);

  if v_heures is not null
     and v_heures < 40
     and new.montant < (v_paiement.montant - v_paiement.montant_regle) then
    raise exception 'Le paiement en plusieurs fois est réservé aux forfaits de 40 heures ou plus : ce forfait (% h) se règle en une seule fois, soit % %.',
      trim(to_char(v_heures, 'FM999990.99')),
      trim(to_char(v_paiement.montant - v_paiement.montant_regle, 'FM999999990.99')),
      v_paiement.devise
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger paiement_versements_regle_40h
  before insert on public.paiement_versements
  for each row execute function public.verifier_paiement_en_plusieurs_fois();

-- Même règle pour l'échéancier (0070), qui planifie précisément un règlement en plusieurs fois.
create or replace function public.verifier_echeancier_40h()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_heures numeric;
begin
  v_heures := public.heures_couvertes_paiement(new.student_payment_id);
  if v_heures is not null and v_heures < 40 then
    raise exception 'Un échéancier n''est possible que pour un forfait de 40 heures ou plus (ce forfait : % h).',
      trim(to_char(v_heures, 'FM999990.99'))
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger paiement_echeances_regle_40h
  before insert on public.paiement_echeances
  for each row execute function public.verifier_echeancier_40h();
