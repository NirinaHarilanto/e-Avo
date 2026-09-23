-- Échéancier de paiement et relances automatiques — demande client du 2026-09-23 (point 12).
--
-- Les acomptes existent déjà (0049 : `paiement_versements` + `montant_regle`). Ce qui manquait,
-- c'est l'autre moitié du besoin : « le reste en échéances », c'est-à-dire un calendrier de ce
-- qui reste dû, échéance par échéance, et une relance envoyée à l'approche de chacune.
--
-- Une échéance n'est PAS un versement : le versement constate un encaissement passé, l'échéance
-- annonce un encaissement attendu. Les deux se rattachent à la même ligne `student_payments`,
-- qui reste la source de vérité du montant total et du montant déjà réglé.
create table public.paiement_echeances (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  student_payment_id uuid not null references public.student_payments(id) on delete cascade,
  libelle text,
  montant numeric(12, 2) not null check (montant > 0),
  date_echeance date not null,
  -- Horodatage de la dernière relance envoyée : sert de garde-fou au job quotidien, qui ne doit
  -- pas renvoyer la même relance à chaque passage.
  relance_envoyee_le timestamptz,
  reglee_le date,
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index paiement_echeances_paiement on public.paiement_echeances (student_payment_id, date_echeance);
-- Index du job de relance : il ne balaie que les échéances non réglées, par date.
create index paiement_echeances_a_relancer on public.paiement_echeances (date_echeance)
  where reglee_le is null;

alter table public.paiement_echeances enable row level security;

create policy "paiement_echeances_admin_all"
  on public.paiement_echeances for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- L'étudiant voit son propre échéancier : c'est ce qu'on lui demande de respecter.
create policy "paiement_echeances_titulaire_select"
  on public.paiement_echeances for select
  to authenticated
  using (
    exists (
      select 1 from public.student_payments sp
      where sp.id = paiement_echeances.student_payment_id and sp.student_id = auth.uid()
    )
  );

-- Délai de prévenance des relances, paramétrable : certains établissements relancent une
-- semaine avant, d'autres la veille.
alter table public.etablissements
  add column relance_echeance_jours integer not null default 3
    check (relance_echeance_jours between 0 and 60);
