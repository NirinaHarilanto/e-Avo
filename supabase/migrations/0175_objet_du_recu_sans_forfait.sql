-- « L'admin ne peut plus enregistrer un paiement » — signalé par le client le 2026-11-25, capture à
-- l'appui : « null value in column "corps" of relation "messages" violates not-null constraint »,
-- en enregistrant les frais d'inscription collectifs de Volana Zakariasy.
--
-- LA PANNE EST DE MOI (0174), LE DÉFAUT EST BIEN PLUS ANCIEN (0080).
--
-- `generer_recu_paiement_etudiant` ne charge le forfait que si le paiement en porte un :
--
--     if new.package_id is not null then
--       select * into v_forfait from public.packages where id = new.package_id;
--     end if;
--     v_objet := case when found then 'Reçu — forfait ' || v_forfait.type_programme || … end;
--
-- Quand `package_id` est nul — c'est le cas de TOUS les frais d'inscription collectifs, qui ne
-- sont rattachés à aucun forfait — le bloc est sauté. Mais **`FOUND` n'est pas remis à zéro pour
-- autant** : il garde la valeur du dernier ordre qui l'a positionné, ici le `select … into
-- v_couvert` juste au-dessus, qu'un `sum()` rend toujours vrai. La branche « forfait » est donc
-- prise avec un `v_forfait` entièrement vide, et comme en SQL toute concaténation qui touche un
-- NULL vaut NULL, `v_objet` devient NULL.
--
-- Ce défaut vit depuis 0080 et n'avait jamais fait de bruit : `invoices.objet` et
-- `notifications.message` acceptent NULL, le reçu partait simplement sans libellé. **11 reçus en
-- production en portent la trace**, du 2026-10-28 au 2026-11-03, tous sur des paiements sans
-- forfait. En ajoutant hier le dépôt d'un message, dont la colonne `corps` est `not null`, j'ai
-- transformé ce défaut silencieux en refus d'enregistrer le paiement.
--
-- TROIS CORRECTIONS.
begin;

-- 1. LA CAUSE. `FOUND` est capturé immédiatement après le SELECT — seul instant où il veut dire
--    quelque chose — et les colonnes du forfait sont vérifiées avant d'être concaténées. Un
--    forfait sans programme ou sans volume d'heures ne produit plus un libellé nul, mais le
--    libellé générique.
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
  v_forfait_trouve boolean := false;
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
    /* Capturé ICI, et pas plus bas : hors de ce bloc, `FOUND` parle du dernier ordre exécuté,
       pas de ce SELECT — c'est précisément ce qui a produit des reçus sans libellé. */
    v_forfait_trouve := found;
  end if;

  v_objet := case
    when v_forfait_trouve and v_forfait.type_programme is not null and v_forfait.total_heures is not null
      then 'Reçu — forfait ' || v_forfait.type_programme::text || ' (' || v_forfait.total_heures || ' h)'
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

-- 2. LE GARDE-FOU QUE J'AVAIS PROMIS SANS L'ÉCRIRE. L'en-tête de 0174 annonce que déposer un
--    message « ne doit jamais faire échouer l'opération appelante » — et la fonction ne tenait
--    cette promesse que pour l'expéditeur manquant, pas pour un texte vide. Un objet ou un corps
--    nul fait désormais abandonner l'envoi en silence, au lieu d'emporter l'enregistrement d'un
--    paiement avec lui. Un message perdu se répare ; un encaissement refusé bloque
--    l'administration devant son élève.
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

  -- `objet` et `corps` sont `not null` (0090) : sans texte, on ne dépose rien.
  if p_objet is null or btrim(p_objet) = '' or p_corps is null or btrim(p_corps) = '' then
    return;
  end if;

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

  if v_expediteur is null or v_expediteur = p_destinataire then
    return;
  end if;

  insert into public.messages (etablissement_id, expediteur_profile_id, destinataire_profile_id, objet, corps)
  values (p_etablissement_id, v_expediteur, p_destinataire, p_objet, p_corps);
end;
$$;

comment on function public.creer_message_systeme(uuid, uuid, text, text, uuid) is
  'Dépose un message automatique dans la messagerie du destinataire (0174). Abandonne en silence '
  'faute d''expéditeur désignable ou de texte (0175) : une annonce manquée vaut mieux qu''une '
  'opération refusée.';

-- 3. LES 11 REÇUS DÉJÀ ÉMIS SANS LIBELLÉ, du 2026-10-28 au 2026-11-03. Ils s'affichent sans objet
--    dans Facturation et dans l'espace de l'élève. On leur rend le libellé qu'ils auraient dû
--    porter : celui de leur forfait s'ils en ont un, le libellé générique sinon. `lignes` porte la
--    même valeur en double (c'est la description de l'unique ligne du reçu) : elle est reprise
--    aussi, sans quoi le reçu imprimé resterait vide au milieu.
update public.invoices i
set objet = v.libelle,
    lignes = jsonb_build_array(
      jsonb_build_object(
        'description', v.libelle,
        'quantite', 1,
        'prix_unitaire_ht', i.montant_ttc,
        'tva_pct', 0
      )
    )
from (
  select
    inv.id,
    case
      when f.type_programme is not null and f.total_heures is not null
        then 'Reçu — forfait ' || f.type_programme::text || ' (' || f.total_heures || ' h)'
      else 'Reçu de paiement'
    end as libelle
  from public.invoices inv
  left join public.student_payments p on p.id = inv.payment_id
  left join public.packages f on f.id = p.package_id
  where inv.objet is null
    and inv.numero like 'REC-%'
) as v
where i.id = v.id;

commit;
