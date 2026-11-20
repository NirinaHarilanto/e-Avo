-- Le destinataire est prévenu dès qu'un document est disponible dans son espace — décision du
-- client, le 2026-11-20 : « vous pouvez enlever [le bouton Envoyer] et juste notifier
-- automatiquement les personnes concernées quand une facture est disponible dans leurs espaces
-- respectifs ».
--
-- Jusqu'ici, prévenir supposait un clic sur « Envoyer » dans l'écran Facturation, et ce clic ne
-- laissait aucune trace : le bouton redevenait « Envoyer » au rechargement, on ne savait plus qui
-- avait été prévenu, et la plupart des documents ne l'étaient jamais. Le client a tranché pour
-- l'automatisme, qui supprime la question plutôt que d'en améliorer la réponse.
--
-- EN BASE, et non dans l'écran de création, parce qu'un document naît par PLUSIEURS chemins :
--   * un reçu, créé par le trigger du passage d'un paiement à « payé » (0030) ;
--   * une facture, émise à la main depuis l'écran Facturation ;
--   * et demain, n'importe quel import ou reprise.
-- Poser la notification ici, c'est la poser une fois pour tous ces chemins — et il n'y a pas de
-- clic à oublier.
--
-- Ce trigger ne remplace pas l'E-MAIL du cron de 6h (modèle 2.3, `email_envoye_le`) : ce sont
-- deux canaux, et le destinataire a les deux. Il renseigne `notifie_le` (0166), le marqueur de
-- la notification in-app.
--
-- GARDE-FOU DES 7 JOURS. Un document émis il y a plus d'une semaine n'est une nouveauté pour
-- personne. Sans cette borne, un import d'historique enverrait d'un coup autant de notifications
-- que de documents repris — c'est exactement ce qui est arrivé aux relances lors de l'import du
-- 2026-10-29. Même fenêtre que le cron du modèle 2.3, pour que les deux canaux se taisent
-- ensemble sur les documents anciens.
--
-- Rien n'est notifié rétroactivement : les 42 documents déjà en base restent muets, ce qui est
-- voulu — annoncer aujourd'hui un reçu d'octobre déconcerterait son destinataire plus qu'autre
-- chose.

begin;

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
  -- Sans destinataire, personne à prévenir : une facture peut n'en porter aucun.
  if v_destinataire is null then
    return new;
  end if;

  -- Un document annulé dès sa création n'annonce rien.
  if new.statut = 'annulee' then
    return new;
  end if;

  -- Antériorité reprise : voir le garde-fou des 7 jours, plus haut.
  if new.date_emission < (current_date - interval '7 days') then
    return new;
  end if;

  /* Chacun vers SON espace : l'élève voit ses documents dans ses paiements, le professeur dans
     ses factures. Un lien vers l'espace et non vers le document : c'est la liste qui porte le
     téléchargement, et un lien profond se périme si la page bouge. */
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

  -- La trace, pour que l'écran sache que le destinataire a été prévenu, et quand.
  new.notifie_le := now();
  return new;
end;
$$;

comment on function public.notifier_destinataire_nouveau_document() is
  'Prévient le destinataire (élève ou professeur) qu''un document est disponible dans son espace, quel que soit le chemin de création (0167). Silencieux pour un document sans destinataire, annulé, ou émis il y a plus de 7 jours.';

drop trigger if exists notifier_destinataire_nouveau_document on public.invoices;
create trigger notifier_destinataire_nouveau_document
  before insert on public.invoices
  for each row
  execute function public.notifier_destinataire_nouveau_document();

commit;
