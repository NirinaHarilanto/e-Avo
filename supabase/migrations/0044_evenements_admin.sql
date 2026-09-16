-- Rendez-vous / réunions créés directement par l'admin depuis son agenda, avec un ou plusieurs
-- étudiants et/ou professeurs déjà inscrits dans l'application — demande client du 2026-09-16 :
-- « il est possible pour l'admin de créer un meeting ». Table distincte de `rendez_vous` (0042),
-- qui reste strictement la demande d'appel diagnostic d'un PROSPECT (prospect_id not null,
-- workflow de validation en_attente/confirme/refuse) : mélanger les deux aurait imposé de rendre
-- prospect_id nullable sur une table déjà en production, avec le risque de régression que ça
-- comporte sur son index unique de créneau et son intégration Google Calendar existante. L'agenda
-- affiché à l'admin (RendezVousAdmin.tsx) fusionne simplement les deux sources à l'affichage.
--
-- Participants en tableaux (student_ids/teacher_ids) plutôt qu'une table de jonction : ce lot ne
-- lit ces listes que pour un affichage (noms, lien Meet, e-mails d'invitation) et jamais pour du
-- filtrage RLS fin par participant — un tableau suffit, une jonction n'aurait ajouté que de la
-- complexité sans bénéfice ici.
create table public.evenements_admin (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  titre text not null,
  debut timestamptz not null,
  duree_minutes integer not null check (duree_minutes between 5 and 480),
  student_ids uuid[] not null default '{}',
  teacher_ids uuid[] not null default '{}',
  notes text,
  -- Mêmes colonnes et même tolérance de panne que rendez_vous.lien_meet (0042) : un incident
  -- Google ne doit jamais empêcher la création de l'événement lui-même.
  google_event_id text,
  lien_meet text,
  -- Pas de workflow de validation ici (contrairement à rendez_vous) : l'admin qui crée l'événement
  -- l'a par définition déjà décidé. Seule décision possible ensuite : l'annuler.
  annule boolean not null default false,
  cree_par uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  -- Un événement sans aucun participant n'aurait pas de sens et ne pourrait recevoir aucune
  -- couleur dans l'agenda (jaune/bleu/vert/violet dépendent tous des participants).
  constraint evenements_admin_participants check (
    coalesce(array_length(student_ids, 1), 0) > 0 or coalesce(array_length(teacher_ids, 1), 0) > 0
  )
);

create index evenements_admin_etablissement_debut on public.evenements_admin (etablissement_id, debut);

alter table public.evenements_admin enable row level security;

create policy "evenements_admin_admin_all"
  on public.evenements_admin for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());
