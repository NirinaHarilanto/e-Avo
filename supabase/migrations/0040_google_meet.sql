-- Visioconférence réelle : liens Google Meet créés automatiquement pour chaque séance
-- planifiée, via l'API Google Calendar (un événement Calendar avec `conferenceData` fait naître
-- un lien Meet — c'est le seul moyen gratuit et automatisable d'en obtenir un).
--
-- L'établissement connecte UNE fois son compte Google ; le jeton de rafraîchissement obtenu est
-- conservé ici et rejoué côté serveur à chaque création de séance. Aucun professeur n'a de
-- compte Google à connecter, et aucun élève n'a rien à autoriser.

create table public.google_integrations (
  etablissement_id uuid primary key references public.etablissements(id) on delete cascade,
  google_email text not null,
  -- Chiffré en AES-GCM côté serveur (api/_lib/google.ts, clé GOOGLE_TOKEN_KEY) : même si une
  -- fuite de lecture survenait un jour, le contenu reste inexploitable sans la clé, qui ne vit
  -- que dans les variables d'environnement Vercel.
  refresh_token_chiffre text not null,
  scope text,
  connecte_par uuid references public.profiles(id),
  connecte_le timestamptz not null default now(),
  derniere_erreur text
);

alter table public.google_integrations enable row level security;

-- Aucune policy cliente : même un admin ne doit jamais pouvoir lire cette table depuis le
-- navigateur, le jeton (fût-il chiffré) n'a rien à y faire. Les fonctions `api/` y accèdent avec
-- la clé service_role, qui contourne RLS. Le même choix protège déjà hour_ledger (0011).
-- L'écran d'administration lit l'état de la connexion par la vue ci-dessous, qui n'expose aucun
-- secret.
create view public.google_integration_statut
with (security_invoker = true)
as
select
  gi.etablissement_id,
  gi.google_email,
  gi.connecte_le,
  gi.derniere_erreur
from public.google_integrations gi
where gi.etablissement_id = public.current_etablissement_id()
  and public.is_admin_etablissement();

-- security_invoker = true : la vue s'exécute avec les droits de l'appelant, donc la clause
-- ci-dessus suffit à borner ce qu'un admin voit (même principe que les vues d'heures, 0012).
grant select on public.google_integration_statut to authenticated;

-- Rattachement d'une séance à son événement Google : indispensable pour déplacer ou supprimer
-- l'événement quand la séance est reprogrammée ou annulée, sans jamais recréer un lien Meet
-- différent de celui déjà communiqué aux élèves.
alter table public.video_sessions
  add column google_event_id text,
  add column organisateur_email text;
