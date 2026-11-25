-- Rétablir les garde-fous que ma migration 0168 avait effacés sans le vouloir.
--
-- En étendant la génération du reçu à l'INSERT (0168), je suis reparti de la version 0030 de la
-- fonction, sans voir que 0056 puis 0080 l'avaient enrichie entre-temps. Trois protections sont
-- donc tombées le 2026-11-23. Aucune n'a encore causé de dégât en production — aucun cas ne s'est
-- présenté depuis — mais les trois chemins existent par conception.
--
-- CE QUI AVAIT ÉTÉ PERDU.
--
-- 1. LE PAIEMENT D'UN PROSPECT FAISAIT PLANTER TOUT L'ENREGISTREMENT. 0056 écarte les paiements
--    sans `student_id` : un prospect peut régler AVANT sa conversion en élève. Sans ce garde-fou,
--    la fonction tente d'insérer une notification avec un destinataire nul, colonne `not null`
--    (0028) : erreur Postgres, et comme le trigger est synchrone, c'est l'enregistrement du
--    paiement lui-même qui échoue. Encaisser l'argent d'un prospect serait devenu impossible.
--
-- 2. UN REÇU DE 0 Ar RESTAIT POSSIBLE. 0080 s'arrête quand le montant à couvrir n'est pas
--    strictement positif. `enregistrerFraisCollectif.ts` marque « payé » dès que le montant réglé
--    atteint le montant dû — et `0 >= 0` est vrai. Un frais collectif à zéro produisait donc un
--    reçu vide, puis l'e-mail « nous avons bien reçu votre paiement de 0 Ar ».
--
-- 3. LE REÇU DE SOLDE AVAIT DISPARU. 0080 permet PLUSIEURS reçus par paiement : à chaque
--    versement, il n'émet que la part non encore couverte et suffixe « — solde ». Mon idempotence
--    grossière (« un reçu existe déjà pour ce paiement, on s'arrête ») supprimait le second reçu.
--    L'élève qui règle en deux fois n'avait plus de pièce pour sa deuxième tranche.
--
-- La version ci-dessous est celle de 0080, reprise intégralement — elle ne touche jamais à `OLD`,
-- donc elle fonctionne telle quelle sur INSERT comme sur UPDATE, et le calcul du solde lui tient
-- lieu d'idempotence, en mieux. J'y conserve les deux seuls apports utiles de 0168 :
--
-- a. `date_emission` suit la date de l'ENCAISSEMENT et non le jour de l'écriture. C'est ce qui
--    permet au cron de distinguer un règlement d'hier d'un règlement d'octobre saisi aujourd'hui
--    (voir 0171 et le défaut des 34 e-mails des 24-25 novembre).
-- b. La NOTIFICATION se tait pour un encaissement de plus de 7 jours. Le reçu, lui, est créé dans
--    tous les cas : c'est une pièce comptable, elle doit exister même quand il est trop tard pour
--    l'annoncer.
begin;

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
  /* Un prospect qui paie avant sa conversion n'a pas encore de profil élève (0056). Pas de
     destinataire, donc pas de reçu — et surtout pas de notification à destinataire nul, qui
     ferait échouer l'enregistrement du paiement entier. */
  if new.student_id is null or new.statut is distinct from 'paye' then
    return new;
  end if;

  /* Part du paiement que les reçus déjà émis couvrent. C'est ce calcul qui tient lieu
     d'idempotence — rejouer le trigger sur un paiement intégralement couvert ne produit rien —
     tout en autorisant un reçu de SOLDE quand un versement complémentaire arrive. */
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

  /* Le reçu existe toujours ; son ANNONCE se tait pour un encaissement ancien, sans quoi une
     reprise d'historique préviendrait d'un coup autant de personnes que de lignes reprises. */
  if v_date_recu >= (current_date - 7) then
    insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
    values (new.etablissement_id, new.student_id, 'recu_paiement', 'Votre reçu est disponible', v_objet, '/mon-espace/paiements');
  end if;

  return new;
end;
$$;

comment on function public.generer_recu_paiement_etudiant() is
  'Émet le reçu d''un paiement « payé » — à sa création (0168) comme à sa mise à jour (0030) — '
  'pour la part non encore couverte, reçu de solde compris (0080). Silencieuse pour un paiement '
  'sans élève (0056), pour un montant nul (0080), et n''annonce rien au-delà de 7 jours (0172).';

commit;
