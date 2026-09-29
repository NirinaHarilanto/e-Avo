-- TimeSheet des professeurs — demande client du 2026-09-29 : « dans l'espace personnel du
-- professeur, on doit pouvoir générer un TimeSheet correspondant aux heures enseignées et
-- l'envoyer pour validation à l'admin. Dans l'espace admin, il se présente sous forme de facture,
-- pour le paiement des heures enseignées. »
--
-- Un TimeSheet regroupe des crédits d'heures `hour_ledger` (credit_professeur, écrits à la
-- clôture de séance) encore non payés. Tant qu'il est soumis, ses lignes lui sont réservées
-- (`hour_ledger.timesheet_id`) pour qu'une même heure ne figure jamais sur deux relevés. À la
-- validation, l'admin génère la rémunération (`teacher_payments`) et sa facture (`invoices`) ;
-- au refus, les lignes sont libérées pour un prochain relevé.
--
-- Écritures uniquement côté serveur (api/professeur/soumettre-timesheet.ts,
-- api/admin/traiter-timesheet.ts, clé service_role) : aucune policy insert/update cliente.

create table public.timesheets (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id),
  numero text not null,
  periode_debut date not null,
  periode_fin date not null,
  total_heures numeric(8, 2) not null check (total_heures > 0),
  -- Taux connu au moment de l'envoi, pour l'estimation affichée ; le montant définitif est
  -- recalculé avec le taux en vigueur au moment de la validation.
  taux_horaire numeric(12, 2),
  montant numeric(12, 2),
  -- Détail figé des séances : [{ hour_ledger_id, session_id, debut, eleves, heures }].
  lignes jsonb not null default '[]'::jsonb,
  commentaire text,
  statut text not null default 'soumis' check (statut in ('soumis', 'valide', 'refuse')),
  motif_refus text,
  soumis_le timestamptz not null default now(),
  traite_le timestamptz,
  traite_par uuid references public.profiles(id),
  teacher_payment_id uuid references public.teacher_payments(id),
  invoice_id uuid references public.invoices(id),
  created_at timestamptz not null default now(),
  unique (etablissement_id, numero),
  check (periode_fin >= periode_debut)
);

create index timesheets_professeur on public.timesheets (teacher_id, soumis_le desc);

alter table public.timesheets enable row level security;

create policy "timesheets_admin_select"
  on public.timesheets for select
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "timesheets_teacher_select"
  on public.timesheets for select
  to authenticated
  using (teacher_id = auth.uid());

alter table public.hour_ledger
  add column timesheet_id uuid references public.timesheets(id);

comment on column public.hour_ledger.timesheet_id is
  'TimeSheet sur lequel ce crédit professeur a été déclaré (0081). Nul si non déclaré, ou libéré après refus.';

-- ---------------------------------------------------------------------------------------------
-- Devise des paiements : « EUR » par défaut depuis 0019, alors que tous les montants de
-- l'établissement sont en ariary (tarifs, forfaits, acomptes). La fenêtre de paiement affichait
-- donc « 35 000,00 EUR ». Relevé en vérifiant les acomptes le 2026-09-29.
-- ---------------------------------------------------------------------------------------------
alter table public.student_payments alter column devise set default 'Ar';
alter table public.teacher_payments alter column devise set default 'Ar';
update public.student_payments set devise = 'Ar' where devise = 'EUR';
update public.teacher_payments set devise = 'Ar' where devise = 'EUR';
