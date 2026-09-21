-- Supprime la validation admin des changements d'horaire de séance (demande client du
-- 2026-09-17). Jusqu'ici (migration 0038), une reprogrammation demandée par un professeur
-- restait "en_attente" sur des colonnes debut_propose/duree_minutes_propose jusqu'à validation
-- d'un admin (api/admin/valider-changement-seance.ts, supprimé) — et ni l'élève ni le professeur
-- n'étaient jamais notifiés, ni pendant l'attente ni une fois le changement validé : cette étape
-- n'apportait donc que de la friction, sans réel contrôle exercé dessus.
--
-- Toute modification (reprogrammation ou annulation) s'applique désormais immédiatement, que ce
-- soit un professeur ou un admin qui agit. En contrepartie, chaque modification est tracée dans
-- une table dédiée plutôt que dans des colonnes "proposées" sur `sessions` (qui ne gardaient
-- jamais qu'UN SEUL changement en attente, jamais l'historique complet) — même philosophie que
-- teacher_assignments (0007) : une ligne par événement, jamais réécrite.

create table public.session_modifications (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  etablissement_id uuid not null references public.etablissements(id),
  modifie_par uuid not null references public.profiles(id),
  type_modification text not null check (type_modification in ('reprogrammee', 'annulee')),
  ancien_debut timestamptz not null,
  nouveau_debut timestamptz,
  ancienne_duree_minutes integer not null,
  nouvelle_duree_minutes integer,
  justificatif text,
  created_at timestamptz not null default now()
);

alter table public.session_modifications enable row level security;

-- Lecture : exactement les personnes qui peuvent déjà voir la séance elle-même (admin de
-- l'établissement, le professeur de la séance, les élèves qui y sont inscrits) — aucune règle
-- nouvelle inventée, juste reprise à l'identique pour cette table.
create policy "session_modifications_admin_select"
  on public.session_modifications for select
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create policy "session_modifications_teacher_select"
  on public.session_modifications for select
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_modifications.session_id and s.teacher_id = auth.uid()
    )
  );

create policy "session_modifications_student_select"
  on public.session_modifications for select
  to authenticated
  using (
    exists (
      select 1 from public.session_enrollments se
      where se.session_id = session_modifications.session_id and se.student_id = auth.uid()
    )
  );

-- Pas de policy insert cliente : écriture réservée au backend (api/professeur/modifier-seance.ts,
-- api/professeur/annuler-seance.ts, clé service_role) — même principe que hour_ledger (0011).

-- Le workflow de validation n'existe plus : ces colonnes de "proposition" (0038) n'ont plus
-- d'utilité, et laisser une colonne changement_statut plus jamais mise à jour serait trompeur.
alter table public.sessions
  drop column debut_propose,
  drop column duree_minutes_propose,
  drop column justificatif_changement,
  drop column changement_demande_par,
  drop column changement_demande_le,
  drop column changement_statut;
