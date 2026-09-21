-- Heure d'essai avant forfait — demande client du 2026-09-21, arbitrages rendus le même jour :
-- l'essai dure TOUJOURS une heure, et un message automatique part dès que cette heure est
-- consommée.
--
-- Règle métier : un prospect choisit un forfait (ex. 20 h) mais demande à commencer par une
-- heure de test, acceptée par l'admin. S'il poursuit, il aura payé au total le prix du forfait
-- choisi ; s'il s'arrête, il n'aura payé que le tarif d'une heure.
--
-- Modèle retenu : DEUX FORFAITS SUCCESSIFS plutôt qu'un forfait qu'on corrigerait après coup.
--   1. à l'acceptation : un forfait de 1 h au tarif horaire, marqué `essai`, qui mémorise le
--      forfait visé (`tarif_vise_id`) ;
--   2. à la décision : soit un second forfait pour les heures restantes, au prix du forfait visé
--      MOINS ce qui a déjà été facturé pour l'essai, soit rien du tout.
-- Raison du découpage : une facture émise est figée dans ce schéma (`invoices`, reçu automatique
-- de 0030) — on ne doit jamais avoir à réécrire une facture d'1 h en facture de 20 h. Ici chaque
-- facture est juste et définitive au moment où elle est produite.

alter table public.packages
  add column essai boolean not null default false,
  add column tarif_vise_id uuid references public.tarifs(id),
  add column essai_resultat text check (essai_resultat in ('poursuivi', 'arrete')),
  add column essai_decide_le timestamptz;

comment on column public.packages.essai is
  'Forfait d''une heure servant de test avant engagement (0057). Le forfait réellement visé est tarif_vise_id.';
comment on column public.packages.essai_resultat is
  'Décision prise après l''heure d''essai : poursuivi (un forfait complémentaire a été créé) ou arrete. Nul tant que rien n''est tranché.';

-- Intention exprimée dès l'étape prospect : l'admin coche « heure d'essai » en même temps qu'il
-- renseigne le forfait choisi, ce qui change le montant à encaisser avant la conversion (tarif
-- horaire au lieu du prix du forfait).
alter table public.prospects
  add column essai_demande boolean not null default false;

comment on column public.prospects.essai_demande is
  'Le prospect commence par une heure d''essai avant de s''engager sur tarif_choisi_id (0057).';

-- ---------------------------------------------------------------------------------------------
-- Message automatique à la consommation de l'heure d'essai
-- ---------------------------------------------------------------------------------------------
-- Étend l'alerte « forfait bientôt épuisé » (0056) : le cas de l'essai mérite son propre message
-- — il n'invite pas à recharger un forfait, il demande une décision (poursuivre ou s'arrêter).
-- Le même trigger porte les deux cas plutôt qu'un second trigger sur la même table : ils
-- partagent exactement le même calcul d'heures restantes, les dissocier ferait diverger les deux
-- copies à la première évolution.
--
-- L'élève ET les admins sont prévenus : l'élève parce que c'est son choix, les admins parce que
-- c'est à eux d'enregistrer la décision dans le dossier — sans quoi un essai terminé pourrait
-- rester en suspens indéfiniment sans que personne ne le voie.
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
  v_tarif public.tarifs%rowtype;
begin
  if new.type_ecriture is distinct from 'debit_etudiant' or new.student_id is null then
    return new;
  end if;

  select * into v_dernier
    from public.packages
    where student_id = new.student_id
    order by created_at desc
    limit 1;

  -- Aucun forfait : élève en cours collectif (facturé à la vague, voir 0027) — rien à épuiser.
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

  if v_restant > 2 then
    return new;
  end if;

  -- Cas 1 : l'heure d'essai vient d'être consommée et rien n'a encore été décidé.
  if v_dernier.essai and v_dernier.essai_resultat is null then
    if exists (
      select 1 from public.notifications
      where destinataire_profile_id = new.student_id
        and type = 'essai_termine'
        and created_at >= v_dernier.created_at
    ) then
      return new;
    end if;

    if v_dernier.tarif_vise_id is not null then
      select * into v_tarif from public.tarifs where id = v_dernier.tarif_vise_id;
    end if;

    insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
    values (
      new.etablissement_id,
      new.student_id,
      'essai_termine',
      'Votre heure d’essai est terminée',
      case
        when v_tarif.id is not null
          then 'Merci d’avoir suivi votre heure d’essai avec Hari Online Club. Pour poursuivre votre apprentissage, il vous reste à confirmer le forfait ' || v_tarif.titre || ' que vous aviez retenu ; sans suite de votre part, seule cette heure vous sera facturée.'
        else 'Merci d’avoir suivi votre heure d’essai avec Hari Online Club. Faites-nous savoir si vous souhaitez poursuivre avec un forfait ; sans suite de votre part, seule cette heure vous sera facturée.'
      end,
      '/mon-espace'
    );

    -- Les admins de l'établissement, pour que la décision soit effectivement enregistrée.
    insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
    select
      new.etablissement_id,
      p.id,
      'essai_termine_admin',
      'Heure d’essai terminée — décision à enregistrer',
      coalesce(e.prenom || ' ' || e.nom, 'Un élève') || ' a consommé son heure d’essai. Enregistrez sa décision (poursuivre ou s’arrêter) depuis l’onglet Forfait de son dossier.',
      '/admin/etudiants/' || new.student_id
    from public.profiles p
    left join public.profiles e on e.id = new.student_id
    where p.etablissement_id = new.etablissement_id
      and p.role = 'admin_etablissement'
      and p.status = 'approved';

    return new;
  end if;

  -- Cas 2 : forfait ordinaire qui arrive à son terme.
  -- Une seule alerte par forfait : la comparaison porte sur la date du dernier forfait souscrit,
  -- donc souscrire un nouveau forfait réarme l'alerte sans qu'on ait à effacer quoi que ce soit.
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

  return new;
end;
$$;
