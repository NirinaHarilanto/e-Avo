-- Devis et factures — Phase 4 du chantier "Espace Admin & Espace Professeur". Suivi manuel
-- côté admin uniquement, enregistrement structuré + vue imprimable navigateur (pas de
-- librairie PDF, pas d'intégration de paiement en ligne — mêmes décisions que 0019).
-- Émis côté étudiant uniquement : la rémunération professeur est déjà couverte par
-- teacher_payments (migration 0019), pas de devis/facture côté professeur dans ce périmètre.

create type public.statut_devis as enum ('brouillon', 'envoye', 'accepte', 'refuse', 'expire');
create type public.statut_facture as enum ('emise', 'envoyee', 'payee', 'en_retard', 'annulee');

-- `lignes` en jsonb (tableau {description, quantite, prix_unitaire_ht, tva_pct}) plutôt
-- qu'une table enfant normalisée : le besoin actuel est un enregistrement structuré
-- imprimable, pas un moteur de facturation — à normaliser plus tard seulement si un
-- reporting ligne-à-ligne devient nécessaire. Les montants sont calculés côté client à partir
-- des lignes puis stockés ici pour un affichage/reporting rapide sans recalcul.
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  student_id uuid not null references public.profiles(id),
  numero text not null,
  statut public.statut_devis not null default 'brouillon',
  objet text,
  lignes jsonb not null default '[]',
  montant_ht numeric(10, 2) not null default 0,
  montant_tva numeric(10, 2) not null default 0,
  montant_ttc numeric(10, 2) not null default 0,
  date_emission date not null default current_date,
  date_validite date,
  notes text,
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (etablissement_id, numero)
);

alter table public.quotes enable row level security;

create policy "quotes_admin_select"
  on public.quotes for select
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "quotes_admin_insert"
  on public.quotes for insert
  to authenticated
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "quotes_admin_update"
  on public.quotes for update
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "quotes_student_select"
  on public.quotes for select
  to authenticated
  using (student_id = auth.uid());

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  student_id uuid not null references public.profiles(id),
  quote_id uuid references public.quotes(id),
  payment_id uuid references public.student_payments(id),
  numero text not null,
  statut public.statut_facture not null default 'emise',
  objet text,
  lignes jsonb not null default '[]',
  montant_ht numeric(10, 2) not null default 0,
  montant_tva numeric(10, 2) not null default 0,
  montant_ttc numeric(10, 2) not null default 0,
  date_emission date not null default current_date,
  date_echeance date,
  date_paiement date,
  notes text,
  created_by_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (etablissement_id, numero)
);

alter table public.invoices enable row level security;

create policy "invoices_admin_select"
  on public.invoices for select
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "invoices_admin_insert"
  on public.invoices for insert
  to authenticated
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "invoices_admin_update"
  on public.invoices for update
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "invoices_student_select"
  on public.invoices for select
  to authenticated
  using (student_id = auth.uid());
