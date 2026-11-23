-- Un reçu pour chaque paiement déjà encaissé — décision du client, le 2026-11-23 : « pour chaque
-- paiement effectué, il faut qu'il y ait un reçu généré ».
--
-- La migration 0168 règle l'avenir : tout paiement enregistré « payé » produit désormais son reçu,
-- qu'il le devienne ou qu'il le soit d'emblée. Celle-ci répare le passé.
--
-- 91 paiements « payés » sur 129 n'avaient jamais eu de reçu, pour 35 250 000 Ar — relevé en
-- production le 2026-11-23. L'essentiel vient de l'import du 2026-10-29, le reste de saisies
-- courantes passées par le chemin « déjà payé », celui qui ne déclenchait aucun trigger.
--
-- TROIS PRÉCAUTIONS.
--
-- 1. AUCUNE NOTIFICATION. Le trigger qui annonce un nouveau document (0167) est mis en sommeil
--    le temps de l'opération : prévenir 91 personnes d'un reçu vieux de plusieurs semaines
--    n'informerait personne et inquiéterait tout le monde. C'est le même piège que l'import du
--    2026-10-29, qui avait réveillé les relances. Le marqueur `notifie_le` reste donc vide pour
--    ces reçus, ce qui est la vérité : personne n'a été prévenu.
--
-- 2. LA DATE DU REÇU EST CELLE DU PAIEMENT, pas celle d'aujourd'hui. 78 de ces paiements n'ont
--    aucune `date_paiement` renseignée ; on retombe alors sur leur date d'ENREGISTREMENT, seule
--    approximation défendable. Les dater tous d'aujourd'hui gonflerait le mois de novembre de
--    35 millions d'ariary encaissés ailleurs.
--
-- 3. REJOUABLE SANS DOMMAGE. Le `not exists` écarte tout paiement qui a déjà son reçu : relancer
--    cette migration ne crée aucun doublon.
--
-- Vérifié avant écriture, sur les 91 lignes concernées : aucune sans élève, sans établissement,
-- sans auteur ni avec un montant nul, aucun identifiant dont les huit premiers caractères se
-- répètent, aucune collision avec un numéro de reçu existant.

begin;

/* En sommeil, pas supprimé — et seulement s'il existe : une base où 0167 n'aurait pas encore
   été appliquée n'a pas ce trigger, et `alter table ... disable trigger` échouerait sur ce seul
   motif, emportant le rattrapage avec lui. Le `enable` plus bas le rétablit, et la transaction
   le rétablirait de toute façon en cas d'échec. */
do $$
begin
  if exists (
    select 1 from pg_trigger
     where tgname = 'notifier_destinataire_nouveau_document'
       and tgrelid = 'public.invoices'::regclass
  ) then
    execute 'alter table public.invoices disable trigger notifier_destinataire_nouveau_document';
  end if;
end $$;

insert into public.invoices (
  etablissement_id, student_id, numero, statut, objet, lignes,
  montant_ht, montant_tva, montant_ttc, date_emission, date_paiement, payment_id, created_by_profile_id
)
select
  p.etablissement_id,
  p.student_id,
  -- Même forme que le trigger (0030) : « REC-<année>-<8 premiers caractères de l'identifiant> ».
  'REC-' || to_char(coalesce(p.date_paiement, p.created_at::date), 'YYYY') || '-' || substr(p.id::text, 1, 8),
  'payee',
  coalesce(
    'Reçu — forfait ' || f.type_programme::text || ' (' || f.total_heures || ' h)',
    'Reçu de paiement'
  ),
  jsonb_build_array(
    jsonb_build_object(
      'description',
      coalesce('Reçu — forfait ' || f.type_programme::text || ' (' || f.total_heures || ' h)', 'Reçu de paiement'),
      'quantite', 1,
      'prix_unitaire_ht', p.montant,
      'tva_pct', 0
    )
  ),
  p.montant,
  0,
  p.montant,
  coalesce(p.date_paiement, p.created_at::date),
  coalesce(p.date_paiement, p.created_at::date),
  p.id,
  p.created_by_profile_id
from public.student_payments p
left join public.packages f on f.id = p.package_id
where p.statut = 'paye'
  and not exists (select 1 from public.invoices i where i.payment_id = p.id);

do $$
begin
  if exists (
    select 1 from pg_trigger
     where tgname = 'notifier_destinataire_nouveau_document'
       and tgrelid = 'public.invoices'::regclass
  ) then
    execute 'alter table public.invoices enable trigger notifier_destinataire_nouveau_document';
  end if;
end $$;

commit;
