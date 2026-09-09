create type public.type_ecriture_heures as enum ('credit_professeur', 'debit_etudiant');

create table public.hour_ledger (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  session_id uuid not null references public.sessions(id),
  student_id uuid references public.profiles(id),
  teacher_id uuid references public.profiles(id),
  type_ecriture public.type_ecriture_heures not null,
  heures numeric not null,
  created_at timestamptz not null default now()
);

-- Deux index uniques PARTIELS plutôt qu'une contrainte unique classique sur
-- (session_id, type_ecriture, student_id) : une écriture de crédit professeur a
-- systématiquement student_id = null, et en SQL deux NULL ne sont jamais égaux — une
-- contrainte unique classique n'aurait donc rien empêché pour ces lignes-là. Ces deux index
-- ciblent chaque cas séparément et empêchent bien un double crédit/débit si la clôture de
-- séance est rejouée (ex. webhook relivré).
create unique index hour_ledger_credit_unique
  on public.hour_ledger (session_id, teacher_id)
  where type_ecriture = 'credit_professeur';

create unique index hour_ledger_debit_unique
  on public.hour_ledger (session_id, student_id)
  where type_ecriture = 'debit_etudiant';

alter table public.hour_ledger enable row level security;

-- Table d'audit : lecture par le titulaire ou l'admin de l'établissement, écriture réservée
-- au backend (clé service_role, qui bypasse RLS) — jamais d'insert direct depuis le client,
-- même admin, pour garantir qu'une écriture correspond toujours à un événement métier réel
-- (clôture de séance).
create policy "hour_ledger_student_select"
  on public.hour_ledger for select
  to authenticated
  using (student_id = auth.uid());

create policy "hour_ledger_teacher_select"
  on public.hour_ledger for select
  to authenticated
  using (teacher_id = auth.uid());

create policy "hour_ledger_admin_select"
  on public.hour_ledger for select
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());
