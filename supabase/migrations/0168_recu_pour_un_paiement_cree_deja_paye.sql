-- Un paiement enregistré DÉJÀ PAYÉ produit lui aussi son reçu — signalé par le client le
-- 2026-11-23 : « apparemment une facturation de Tovoariniaina a disparu ».
--
-- Elle n'avait pas disparu : elle n'avait jamais existé.
--
-- Le reçu naît d'un trigger `AFTER UPDATE` (0030) : il ne se déclenche donc QUE si un paiement
-- passe à « payé » par une modification. Or l'administration enregistre très souvent un paiement
-- déjà encaissé — frais d'inscription collectifs, reprise d'historique, achat de forfait — et ce
-- chemin-là crée la ligne directement avec le statut « payé ». Aucune modification, donc aucun
-- trigger, donc aucun reçu, et pas le moindre message d'erreur pour le signaler.
--
-- Relevé en production avant correction : 91 paiements « payés » sur 129 sans reçu, soit
-- 35 250 000 Ar. L'essentiel vient de l'import du 2026-10-29, mais une dizaine sont des saisies
-- courantes de ces dernières semaines — dont celle qui a motivé ce signalement.
--
-- DEUX CORRECTIONS ICI.
--
-- 1. La génération du reçu couvre désormais l'INSERT autant que l'UPDATE. `TG_OP` distingue les
--    deux : sur une insertion, `OLD` n'existe pas, et y accéder lèverait une erreur.
--
-- 2. La NOTIFICATION du reçu n'est envoyée que pour un paiement récent. Sans cette borne, le
--    prochain import d'historique enverrait d'un coup autant de messages que de lignes reprises
--    — c'est exactement ce qui est arrivé aux relances lors de l'import du 2026-10-29. Le reçu,
--    lui, est créé dans tous les cas : c'est une pièce comptable, elle doit exister même quand
--    il est trop tard pour l'annoncer.
--
-- 3. La DOUBLE NOTIFICATION introduite par 0167. Depuis vendredi, chaque reçu produisait deux
--    messages — « Votre reçu est disponible » (0030) et « Nouveau reçu · REC-… » (0167) —
--    constaté en production le 2026-11-23 à 13:02:42, à la seconde près. Le trigger de 0167
--    cesse donc de notifier les documents qui portent un `payment_id` : ceux-là sont déjà
--    annoncés par la fonction ci-dessus.
--
-- Rien n'est rattrapé rétroactivement : les reçus manquants du passé restent à créer, ou non,
-- sur décision de l'administration.

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
  v_forfait public.packages%rowtype;
begin
  if new.statut is distinct from 'paye' then
    return new;
  end if;
  /* Sur une modification seulement : un paiement déjà « payé » qui ressort puis repasse à ce
     statut ne doit pas produire un second reçu.

     Deux `if` imbriqués, et non `tg_op = 'UPDATE' and old.statut = 'paye'` : sur une insertion,
     `OLD` n'est pas assigné et y toucher lève « record "old" is not assigned yet ». PostgreSQL
     ne promet pas d'évaluer les deux membres d'un `and` de gauche à droite, donc la forme courte
     ferait échouer tout enregistrement de paiement — bien pire que le défaut corrigé ici. */
  if tg_op = 'UPDATE' then
    if old.statut = 'paye' then
      return new;
    end if;
  end if;
  -- Idempotence, quelle que soit l'opération.
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
    jsonb_build_array(jsonb_build_object('description', v_objet, 'quantite', 1, 'prix_unitaire_ht', new.montant, 'tva_pct', 0)),
    new.montant, 0, new.montant, coalesce(new.date_paiement, current_date), new.date_paiement,
    new.id, new.created_by_profile_id
  );

  /* Le reçu existe toujours ; son ANNONCE, elle, se tait pour un encaissement ancien. Un import
     d'historique créerait sinon autant de messages que de lignes reprises. Même fenêtre que les
     autres envois de la maison (0167, et le cron du modèle 2.3). */
  if coalesce(new.date_paiement, current_date) >= (current_date - 7) then
    insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
    values (new.etablissement_id, new.student_id, 'recu_paiement', 'Votre reçu est disponible', v_objet, '/mon-espace/paiements');
  end if;

  return new;
end;
$$;

comment on function public.generer_recu_paiement_etudiant() is
  'Crée le reçu d''un paiement dès qu''il est « payé » — qu''il le devienne (UPDATE) ou qu''il le soit d''emblée (INSERT, 0168). N''annonce le reçu que pour un encaissement de moins de 7 jours.';

-- Le trigger d'origine (0030) ne couvrait que la modification.
drop trigger if exists student_payments_generer_recu_insert on public.student_payments;
create trigger student_payments_generer_recu_insert
  after insert on public.student_payments
  for each row execute function public.generer_recu_paiement_etudiant();

/* ── Fin de la double notification ────────────────────────────────────────────────────────
   0167 annonce tout nouveau document au destinataire. Pour un REÇU, la fonction ci-dessus le
   fait déjà : l'élève en recevait deux. Les documents nés d'un paiement sont donc écartés ici —
   leur marqueur `notifie_le` est tout de même posé, puisqu'ils SONT annoncés, et l'écran
   Facturation doit continuer de l'indiquer. */
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
begin
  if v_destinataire is null then
    return new;
  end if;

  if new.statut = 'annulee' then
    return new;
  end if;

  -- `date_emission` est de type `date` : on compare a une date, sans promotion implicite.
  if new.date_emission < (current_date - 7) then
    return new;
  end if;

  /* Né d'un paiement : `generer_recu_paiement_etudiant` l'annonce déjà. On note qu'il est
     annoncé, sans doubler le message. */
  if new.payment_id is not null then
    new.notifie_le := now();
    return new;
  end if;

  v_lien := case when new.teacher_id is not null and new.student_id is null
                 then '/professeur/factures'
                 else '/mon-espace/paiements'
            end;

  insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
  values (
    new.etablissement_id,
    v_destinataire,
    'facture',
    case when v_est_recu then 'Nouveau reçu · ' else 'Nouvelle facture · ' end || new.numero,
    new.objet,
    v_lien
  );

  new.notifie_le := now();
  return new;
end;
$$;

comment on function public.notifier_destinataire_nouveau_document() is
  'Prévient le destinataire qu''un document est disponible dans son espace (0167). Silencieux pour un document sans destinataire, annulé, émis il y a plus de 7 jours, ou né d''un paiement — ce dernier étant déjà annoncé par generer_recu_paiement_etudiant (0168).';

commit;
