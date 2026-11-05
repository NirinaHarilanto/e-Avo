-- Correction manuelle du compteur d'heures d'un élève depuis l'espace admin — demande client du
-- 2026-11-05 : « Rendre heures suivies modifiable depuis l'espace admin [...] l'admin puisse
-- modifier le comptage, et gérer les impacts des modifications pour le professeur et l'étudiant
-- concernée. »
--
-- Pourquoi une migration, et pas seulement un écran : `hour_ledger` porte trois verrous qui
-- interdisent tels quels une correction manuelle.
--   1. `hour_ledger_une_seule_source` (0131, étendue en 0140) exige qu'une écriture vienne d'UNE
--      séance, d'UNE prestation externe ou d'UN forfait. Une correction ne vient d'aucun des
--      trois : il lui faut sa propre origine.
--   2. `hour_ledger_reprise_debit_etudiant` (0140) interdit à une écriture rattachée à un forfait
--      de créditer un professeur — ce qui bloquerait précisément la répercussion demandée.
--   3. `hour_ledger_reprise_unique` (0140) n'autorise qu'une écriture par forfait, déjà prise par
--      la reprise d'antériorité.
--
-- Principe retenu : une correction N'EST JAMAIS UNE RÉÉCRITURE. Elle ajoute une écriture de plus,
-- positive ou négative, comme en comptabilité. C'est ce qui rend l'historique fiable, ce qui
-- protège une fiche de paie déjà émise (jamais touchée : la correction se présente comme une
-- ligne de plus à régler), et ce qui permet de tout relire après coup.

begin;

-- Une correction, telle que l'admin la saisit : d'où à combien, pourquoi, et qui l'a faite.
-- Table à part plutôt que des colonnes sur `hour_ledger` : une correction peut donner DEUX
-- écritures (l'élève, et le professeur si l'admin répercute), qui doivent rester rattachées au
-- même geste — c'est ce couple qui se relit dans le bloc d'historique.
create table public.ajustements_heures (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  student_id uuid not null references public.profiles(id) on delete cascade,
  /* Renseigné seulement si l'admin a choisi de répercuter : c'est LE professeur qu'il a désigné
     dans le pop-up, jamais déduit — un élève peut en avoir plusieurs depuis 0138, et en choisir
     un au hasard remplirait la paie de quelqu'un que personne n'a désigné. */
  teacher_id uuid references public.profiles(id) on delete set null,
  heures_avant numeric not null,
  heures_apres numeric not null,
  /* Obligatoire, à la demande du client (2026-11-04, « avec une justification obligatoire ») :
     un compteur d'heures porte une conséquence financière, une correction sans motif serait
     illisible six mois plus tard. `check` sur la chaîne vide, sans quoi `not null` laisserait
     passer « ». */
  justification text not null check (length(btrim(justification)) > 0),
  ajuste_par uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index ajustements_heures_student on public.ajustements_heures (student_id, created_at desc);

alter table public.ajustements_heures enable row level security;

-- L'admin écrit et relit tout. L'écriture passe malgré tout par une route serveur (clé de
-- service) : `hour_ledger` n'a aucune policy d'insert, et une correction qui ne poserait que la
-- ligne d'historique sans l'écriture correspondante mentirait.
create policy "ajustements_heures_admin_all"
  on public.ajustements_heures for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- L'élève et le professeur concernés lisent ce qui les regarde : leur compteur a bougé, ils
-- doivent pouvoir savoir pourquoi.
create policy "ajustements_heures_student_select"
  on public.ajustements_heures for select
  to authenticated
  using (student_id = auth.uid());

create policy "ajustements_heures_teacher_select"
  on public.ajustements_heures for select
  to authenticated
  using (teacher_id = auth.uid());

-- Quatrième origine d'une écriture du grand livre, à côté de la séance (0011), de la prestation
-- externe (0131) et du forfait (0140).
alter table public.hour_ledger
  add column ajustement_id uuid references public.ajustements_heures(id) on delete cascade;

comment on column public.hour_ledger.ajustement_id is
  'Correction manuelle du compteur, saisie par un admin (0159). Exclusive avec session_id, '
  'prestation_externe_id et package_id. Les heures peuvent être NÉGATIVES : c''est ainsi qu''on '
  'retire des heures sans réécrire les écritures d''origine.';

create index hour_ledger_ajustement on public.hour_ledger (ajustement_id) where ajustement_id is not null;

-- La contrainte d'origine unique passe de trois sources à quatre.
alter table public.hour_ledger drop constraint hour_ledger_une_seule_source;

alter table public.hour_ledger
  add constraint hour_ledger_une_seule_source
  check (num_nonnulls(session_id, prestation_externe_id, package_id, ajustement_id) = 1);

commit;
