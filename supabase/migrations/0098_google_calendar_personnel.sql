-- Agenda Google personnel de chaque professeur/admin, affiché en lecture seule DANS son agenda
-- HOC — demande client du 2026-10-05, choix explicite parmi plusieurs options proposées : « ses
-- événements Google personnels apparaissent en superposition dans son calendrier HOC », aucun
-- sens inverse (rien ne part de HOC vers Google ici — voir google_integrations, 0040, qui reste
-- le SEUL chemin créant des liens Meet).
--
-- Même principe de stockage que l'intégration d'établissement (chiffrement du refresh token,
-- RLS sans aucune policy cliente, vue de statut non sensible pour l'écran) — mais une ligne PAR
-- PERSONNE, pas par établissement : chacun connecte son propre compte Gmail, aucun des deux
-- comptes ne voit ni ne modifie rien pour l'autre.
create table public.google_integrations_personnelles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  etablissement_id uuid not null references public.etablissements(id),
  google_email text not null,
  refresh_token_chiffre text not null,
  -- Lecture seule : contrairement à google_integrations (calendar.events, qui doit pouvoir CRÉER
  -- des événements pour les liens Meet), cette intégration ne fait jamais qu'afficher — demande
  -- client explicite, « rien ne part vers Google depuis HOC ». Un scope plus étroit limite aussi
  -- ce qu'une fuite de jeton pourrait permettre.
  scope text,
  connecte_le timestamptz not null default now(),
  derniere_erreur text
);

create index google_integrations_personnelles_etablissement on public.google_integrations_personnelles (etablissement_id);

alter table public.google_integrations_personnelles enable row level security;

-- Aucune policy cliente, délibérément : même chiffré, le jeton n'a rien à faire dans une réponse
-- au navigateur. Seules les fonctions api/ (clé service_role) le lisent, pour appeler Google à la
-- place de la personne et ne redescendre que des horaires et des titres d'événements — jamais le
-- jeton lui-même.

-- Vue de statut, SANS security_invoker (même correctif qu'en 0041 : avec, la table sous-jacente
-- serait évaluée sous les droits de l'appelant, qui n'a justement AUCUNE policy dessus, et la vue
-- ne renverrait jamais rien). C'est sa propre clause WHERE qui porte la sécurité :
-- `profile_id = auth.uid()` restreint toujours au SEUL compte connecté, quel que soit son rôle —
-- un admin ne voit pas plus la connexion personnelle d'un autre admin que celle d'un professeur.
create view public.google_integration_personnelle_statut as
select gip.google_email, gip.connecte_le, gip.derniere_erreur
from public.google_integrations_personnelles gip
where gip.profile_id = auth.uid();

grant select on public.google_integration_personnelle_statut to authenticated;
