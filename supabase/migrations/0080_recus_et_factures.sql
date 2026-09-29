-- Factures et reçus d'un même paiement — demande client du 2026-09-29 (« activer tous les
-- boutons liés aux factures : imprimer, télécharger, voir, générer une facture ou un reçu »).
--
-- Trois défauts corrigés :
--   1. Le reçu automatique (0030/0056) enregistrait ses lignes sous les clés `libelle` et
--      `prix_unitaire`, alors que l'application lit `description` / `prix_unitaire_ht` /
--      `tva_pct` : ouvrir un reçu faisait planter la vue. Lignes existantes reprises ici.
--   2. Facture et reçu s'excluaient : le trigger ne créait pas de reçu si une FACTURE existait
--      déjà pour le paiement, et la génération de facture renvoyait le reçu existant. Désormais
--      les deux coexistent (un reçu se reconnaît à son numéro REC-…).
--   3. Un seul reçu par paiement : impossible d'en remettre un pour chaque acompte. Désormais
--      chaque reçu couvre ce qui a été encaissé depuis le précédent ; au solde, le trigger émet
--      le reçu du montant restant non couvert (le cumul des reçus égale toujours l'encaissé).

update public.invoices
set lignes = (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'description', coalesce(l ->> 'description', l ->> 'libelle', ''),
      'quantite', coalesce((l ->> 'quantite')::numeric, 1),
      'prix_unitaire_ht', coalesce((l ->> 'prix_unitaire_ht')::numeric, (l ->> 'prix_unitaire')::numeric, 0),
      'tva_pct', coalesce((l ->> 'tva_pct')::numeric, 0)
    )
  ), '[]'::jsonb)
  from jsonb_array_elements(lignes) l
)
where exists (select 1 from jsonb_array_elements(lignes) l where l ? 'libelle' or l ? 'prix_unitaire');

-- Numéro du prochain reçu d'un paiement : REC-<année>-<8 premiers caractères du paiement>, puis
-- -2, -3… pour les suivants. Dérivé du paiement, donc sans compteur séparé à synchroniser.
create or replace function public.numero_prochain_recu(p_payment_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select 'REC-' || to_char(now(), 'YYYY') || '-' || substr(p_payment_id::text, 1, 8)
    || case when count(*) = 0 then '' else '-' || (count(*) + 1)::text end
  from public.invoices
  where payment_id = p_payment_id and numero like 'REC-%';
$$;

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

  insert into public.invoices (
    etablissement_id, student_id, numero, statut, objet, lignes,
    montant_ht, montant_tva, montant_ttc, date_emission, date_paiement, payment_id, created_by_profile_id
  )
  values (
    new.etablissement_id, new.student_id, v_numero, 'payee', v_objet,
    jsonb_build_array(jsonb_build_object('description', v_objet, 'quantite', 1, 'prix_unitaire_ht', v_montant, 'tva_pct', 0)),
    v_montant, 0, v_montant, current_date, coalesce(new.date_paiement, current_date),
    new.id, new.created_by_profile_id
  );

  insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
  values (new.etablissement_id, new.student_id, 'recu_paiement', 'Votre reçu est disponible', v_objet, '/mon-espace/paiements');

  return new;
end;
$$;

-- Fonctions utilitaires internes : appelées par les triggers et le service_role, jamais par un
-- navigateur (exposées sinon par défaut via /rest/v1/rpc).
revoke execute on function public.numero_prochain_recu(uuid) from public, anon, authenticated;
revoke execute on function public.heures_couvertes_paiement(uuid) from public, anon, authenticated;
