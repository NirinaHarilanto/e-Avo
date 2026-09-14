-- Permet de modifier l'heure/la durée d'une séance encore planifiée, avec justification
-- obligatoire et validation admin quand la demande vient du professeur. `debut_propose`/
-- `duree_minutes_propose` restent nulles hors changement en attente ; `debut`/`duree_minutes`
-- (colonnes existantes) ne bougent qu'une fois la demande approuvée — ou immédiatement si
-- c'est l'admin lui-même qui modifie (il est déjà le validateur).
--
-- Écriture réservée au backend (api/professeur/proposer-changement-seance.ts et
-- api/admin/valider-changement-seance.ts, service_role) plutôt qu'à une policy RLS cliente :
-- la règle « seul un admin peut valider, un justificatif est obligatoire dès que l'heure change »
-- porte sur la RELATION entre l'ancienne et la nouvelle valeur, que RLS ne peut pas exprimer
-- proprement sans trigger. Même choix que planifier-seance.ts/cloturer-seance.ts pour
-- session_enrollments/hour_ledger (voir teacherAuth.ts).
alter table public.sessions
  add column debut_propose timestamptz,
  add column duree_minutes_propose integer,
  add column justificatif_changement text,
  add column changement_demande_par uuid references public.profiles(id),
  add column changement_demande_le timestamptz,
  add column changement_statut text not null default 'aucun' check (changement_statut in ('aucun', 'en_attente'));
