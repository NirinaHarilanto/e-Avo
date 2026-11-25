-- Les annonces automatiques arrivent aussi dans la messagerie — demande du client, le 2026-11-25 :
-- « Il faudrait envoyer l'information sous forme de message dans l'espace personnel [...]
-- également, pas seulement sous forme de notification. »
--
-- La messagerie existe déjà (0090) : une vraie boîte aux lettres, consultée — 137 messages en
-- production, 63 % lus, avec des fils de réponse. Rien à construire, donc ; il manquait seulement
-- un moyen d'y déposer un message depuis les triggers.
--
-- CE QUE CELA CHANGE, et que le client doit savoir. L'en-tête de 0090 sépare volontairement les
-- deux canaux : « `notifications` reste un signal SYSTÈME à sens unique ; ici, un humain écrit à
-- un humain ». Cette demande efface la frontière. Un message automatique est, pour le
-- destinataire, un message comme un autre : il peut le SUPPRIMER et y RÉPONDRE — et sa réponse
-- partira vers l'expéditeur que nous aurons désigné.
--
-- L'EXPÉDITEUR, justement : `expediteur_profile_id` est `not null`, et l'écran affiche son nom.
-- Un message « système » n'existe donc pas. Deux règles :
--   • vers un élève ou un professeur, l'expéditeur est l'administration de l'établissement — ce
--     qui a le mérite de rendre la réponse utile, elle arrive là où il faut ;
--   • vers l'administration (demande de forfait), l'expéditeur est l'ÉLÈVE qui demande. C'est lui
--     qui est à l'origine du message, et l'admin peut lui répondre directement.
--
-- Rien ne doit jamais faire échouer l'opération appelante : un établissement sans administration
-- joignable n'empêche pas d'enregistrer un paiement, il ne reçoit simplement pas de message.
begin;

create or replace function public.creer_message_systeme(
  p_etablissement_id uuid,
  p_destinataire uuid,
  p_objet text,
  p_corps text,
  p_expediteur uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expediteur uuid := p_expediteur;
begin
  if p_destinataire is null or p_etablissement_id is null then
    return;
  end if;

  /* Sans expéditeur imposé, l'administration de l'établissement écrit. On écarte le destinataire
     lui-même : un admin ne doit pas recevoir un message de sa propre part. */
  if v_expediteur is null then
    select id into v_expediteur
      from public.profiles
     where etablissement_id = p_etablissement_id
       and role = 'admin_etablissement'
       and status = 'approved'
       and id is distinct from p_destinataire
     order by created_at
     limit 1;
  end if;

  -- Personne pour signer : on se tait, sans faire échouer l'appelant.
  if v_expediteur is null or v_expediteur = p_destinataire then
    return;
  end if;

  insert into public.messages (etablissement_id, expediteur_profile_id, destinataire_profile_id, objet, corps)
  values (p_etablissement_id, v_expediteur, p_destinataire, p_objet, p_corps);
end;
$$;

comment on function public.creer_message_systeme(uuid, uuid, text, text, uuid) is
  'Dépose un message automatique dans la messagerie du destinataire (0174). Silencieuse si aucun '
  'expéditeur ne peut être désigné : une annonce manquée vaut mieux qu''une opération refusée.';

-- ── 1. Le reçu d'un paiement ───────────────────────────────────────────────────────────────────
-- Reprise intégrale de 0172, à laquelle s'ajoute le message. Même fenêtre de 7 jours que la
-- notification : un encaissement ancien ne réveille rien, ni cloche ni boîte aux lettres.
create or replace function public.generer_recu_paiement_etudiant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_numero text;
  v_objet text;
  v_couvert numeric;
  v_montant numeric;
  v_date_recu date;
  v_forfait public.packages%rowtype;
begin
  if new.student_id is null or new.statut is distinct from 'paye' then
    return new;
  end if;

  select coalesce(sum(montant_ttc), 0) into v_couvert
    from public.invoices
    where payment_id = new.id and numero like 'REC-%';
  v_montant := greatest(new.montant_regle, new.montant) - v_couvert;
  if v_montant <= 0 then
    return new;
  end if;

  if new.package_id is not null then
    select * into v_forfait from public.packages where id = new.package_id;
  end if;
  v_objet := case
    when found then 'Reçu — forfait ' || v_forfait.type_programme::text || ' (' || v_forfait.total_heures || ' h)'
    else 'Reçu de paiement'
  end;
  if v_couvert > 0 then
    v_objet := v_objet || ' — solde';
  end if;
  v_numero := public.numero_prochain_recu(new.id);

  v_date_recu := coalesce(new.date_paiement, current_date);

  insert into public.invoices (
    etablissement_id, student_id, numero, statut, objet, lignes,
    montant_ht, montant_tva, montant_ttc, date_emission, date_paiement, payment_id, created_by_profile_id
  )
  values (
    new.etablissement_id, new.student_id, v_numero, 'payee', v_objet,
    jsonb_build_array(jsonb_build_object('description', v_objet, 'quantite', 1, 'prix_unitaire_ht', v_montant, 'tva_pct', 0)),
    v_montant, 0, v_montant, v_date_recu, v_date_recu,
    new.id, new.created_by_profile_id
  );

  if v_date_recu >= (current_date - 7) then
    insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
    values (new.etablissement_id, new.student_id, 'recu_paiement', 'Votre reçu est disponible', v_objet, '/mon-espace/paiements');

    perform public.creer_message_systeme(
      new.etablissement_id,
      new.student_id,
      'Votre reçu est disponible',
      'Nous avons bien enregistré votre paiement. Votre reçu « ' || v_numero || ' » (' || v_objet ||
      ') est disponible dans votre espace personnel, onglet Paiements. Vous pouvez répondre à ce message pour toute question.'
    );
  end if;

  return new;
end;
$$;

-- ── 2. Un nouveau document déposé ──────────────────────────────────────────────────────────────
-- Reprise de 0168, à laquelle s'ajoute le message.
create or replace function public.notifier_destinataire_nouveau_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destinataire uuid := coalesce(new.student_id, new.teacher_id);
  v_est_recu boolean := new.numero like 'REC-%';
  v_lien text;
  v_titre text;
begin
  if v_destinataire is null then
    return new;
  end if;

  if new.statut = 'annulee' then
    return new;
  end if;

  if new.date_emission < (current_date - 7) then
    return new;
  end if;

  /* Né d'un paiement : `generer_recu_paiement_etudiant` l'annonce déjà, cloche et message
     compris. On note qu'il est annoncé, sans rien doubler. */
  if new.payment_id is not null then
    new.notifie_le := now();
    return new;
  end if;

  v_lien := case when new.teacher_id is not null and new.student_id is null
                 then '/professeur/factures'
                 else '/mon-espace/paiements'
            end;
  v_titre := case when v_est_recu then 'Nouveau reçu · ' else 'Nouvelle facture · ' end || new.numero;

  insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
  values (new.etablissement_id, v_destinataire, 'facture', v_titre, new.objet, v_lien);

  perform public.creer_message_systeme(
    new.etablissement_id,
    v_destinataire,
    v_titre,
    coalesce(new.objet, 'Nouveau document') || ' — ce document est disponible dans votre espace personnel.'
  );

  new.notifie_le := now();
  return new;
end;
$$;

-- ── 3. Fin de la séance d'essai, et forfait qui s'épuise ───────────────────────────────────────
-- Reprise de 0078. Deux changements : le message dans la boîte aux lettres de l'élève à la fin de
-- l'essai (demande du client), et l'adresse de contact ajoutée aux deux textes de fin de forfait
-- — « rapprochez-vous de Hari Online Club » ne disait pas comment s'y prendre.
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
  v_message_essai text;
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

    v_message_essai := 'Merci d’avoir suivi votre séance d’essai avec Hari Online Club. Pour poursuivre votre apprentissage, choisissez le forfait qui vous convient avec l’établissement ; sans suite de votre part, seules vos heures d’essai vous seront facturées.';

    insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
    values (
      new.etablissement_id,
      new.student_id,
      'essai_termine',
      'Votre séance d’essai est terminée',
      v_message_essai,
      '/mon-espace'
    );

    perform public.creer_message_systeme(
      new.etablissement_id,
      new.student_id,
      'Votre séance d’essai est terminée',
      v_message_essai || ' Répondez à ce message ou écrivez-nous à admin@harionlineclub.com pour choisir votre forfait.'
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
        then 'Toutes les heures de votre forfait ont été utilisées. Veuillez contacter HOC à admin@harionlineclub.com pour renouveler votre forfait.'
      else 'Il vous reste ' || trim(to_char(v_restant, 'FM999990.99')) || ' h sur votre forfait. Pour poursuivre votre apprentissage sans interruption, rapprochez-vous de Hari Online Club à admin@harionlineclub.com afin de souscrire un nouveau forfait.'
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

-- ── 4. Demande de forfait supplémentaire ───────────────────────────────────────────────────────
-- Reprise de 0061, plus un message à chaque admin. Ici l'expéditeur est l'ÉLÈVE : c'est sa
-- demande, et l'administration peut lui répondre directement depuis sa boîte.
create or replace function public.notifier_demande_forfait()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_eleve public.profiles%rowtype;
  v_corps text;
  v_admin record;
begin
  select * into v_eleve from public.profiles where id = new.student_id;

  v_corps := coalesce(v_eleve.prenom || ' ' || v_eleve.nom, 'Un élève') || ' demande ' ||
             trim(to_char(new.heures_demandees, 'FM999990.99')) || ' h supplémentaires.';

  insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
  select
    new.etablissement_id,
    p.id,
    'demande_forfait',
    'Demande de forfait supplémentaire',
    v_corps,
    '/admin/etudiants/' || new.student_id
  from public.profiles p
  where p.etablissement_id = new.etablissement_id
    and p.role = 'admin_etablissement'
    and p.status = 'approved';

  for v_admin in
    select p.id
      from public.profiles p
     where p.etablissement_id = new.etablissement_id
       and p.role = 'admin_etablissement'
       and p.status = 'approved'
  loop
    perform public.creer_message_systeme(
      new.etablissement_id,
      v_admin.id,
      'Demande de forfait supplémentaire',
      v_corps,
      new.student_id
    );
  end loop;

  return new;
end;
$$;

commit;
