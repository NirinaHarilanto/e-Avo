-- Rémunération professeur au forfait horaire ou mensuel, et factures professeur — Phase 3 du
-- chantier "Hari Online Club" (2026-09-13). Réutilise la table `invoices` existante (section
-- Facturation) plutôt qu'une table parallèle : décision qui annule le périmètre initial de
-- 0020 ("pas de facture côté professeur"), la demande client l'exige désormais.

alter table public.profiles add column taux_horaire numeric(10, 2);

alter table public.teacher_payments
  add column mode_remuneration text not null default 'mensuel'
    check (mode_remuneration in ('horaire', 'mensuel'));

-- Marque les écritures hour_ledger déjà incluses dans un paiement, pour calculer sans
-- ambiguïté les heures enseignées NON payées d'un professeur. Pas de policy update cliente
-- ajoutée : comme le reste de cette table, l'écriture reste réservée au service_role
-- (voir api/admin/payer-professeur.ts).
alter table public.hour_ledger
  add column teacher_payment_id uuid references public.teacher_payments(id);

alter table public.invoices
  alter column student_id drop not null,
  add column teacher_id uuid references public.profiles(id),
  add constraint invoices_destinataire_unique check (
    (student_id is not null and teacher_id is null) or (student_id is null and teacher_id is not null)
  );

-- invoices_admin_insert/update (0020) ne référencent ni student_id ni teacher_id : elles
-- couvrent déjà l'insertion d'une facture professeur sans modification.
create policy "invoices_teacher_select"
  on public.invoices for select
  to authenticated
  using (teacher_id = auth.uid());
