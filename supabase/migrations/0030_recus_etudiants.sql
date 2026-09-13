-- Reçu automatique à l'étudiant quand un paiement passe à "payé" — Phase 3 (point 6) du
-- chantier "Hari Online Club". Un trigger plutôt qu'un appel client : garantit la génération
-- quel que soit le chemin qui fait passer `student_payments.statut` à 'paye' (aujourd'hui le
-- <select> de PaiementsAdmin, potentiellement autre chose demain), sans dépendre du front.

create function public.generer_recu_paiement_etudiant()
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
  if new.statut is distinct from 'paye' or old.statut = 'paye' then
    return new;
  end if;
  -- Idempotence : si le statut ressort de 'paye' puis y repasse, ne pas dupliquer le reçu.
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

  insert into public.notifications (etablissement_id, destinataire_profile_id, type, titre, message, lien)
  values (new.etablissement_id, new.student_id, 'recu_paiement', 'Votre reçu est disponible', v_objet, '/mon-espace/paiements');

  return new;
end;
$$;

create trigger student_payments_generer_recu
  after update on public.student_payments
  for each row execute function public.generer_recu_paiement_etudiant();
