-- Prise de rendez-vous d'appel diagnostic directement dans l'application, en remplacement du
-- renvoi vers Calendly (lien externe : le prospect quittait le site, ses réponses n'arrivaient
-- jamais en base, et l'établissement devait recopier le rendez-vous à la main).
--
-- Trois briques : les paramètres de réservation de l'établissement, ses plages de disponibilité
-- hebdomadaires, et les demandes de rendez-vous elles-mêmes. Les créneaux réellement proposés au
-- visiteur ne sont stockés nulle part : ils sont calculés à la demande (api/prospects/creneaux)
-- en retranchant des plages ci-dessous les rendez-vous déjà pris ET les événements réels de
-- l'agenda Google de l'établissement. Les matérialiser en base aurait imposé de les regénérer
-- sans arrêt pour rester à jour, pour une information entièrement dérivable.

create type public.statut_rendez_vous as enum ('en_attente', 'confirme', 'refuse', 'annule');

create table public.reservation_parametres (
  etablissement_id uuid primary key references public.etablissements(id) on delete cascade,
  -- Durée d'un appel diagnostic. 15 min par défaut, comme annoncé sur la page vitrine.
  duree_minutes integer not null default 15 check (duree_minutes between 5 and 240),
  -- Pas de réservation à la dernière minute : l'établissement doit avoir le temps de valider.
  delai_minimum_heures integer not null default 12 check (delai_minimum_heures between 0 and 720),
  -- Jusqu'où le visiteur peut réserver à l'avance.
  horizon_jours integer not null default 21 check (horizon_jours between 1 and 180),
  -- Respiration entre deux rendez-vous, pour ne pas enchaîner sans pause.
  pause_minutes integer not null default 15 check (pause_minutes between 0 and 120),
  -- Tous les calculs de créneaux se font dans ce fuseau, jamais dans celui du navigateur du
  -- visiteur : un prospect en France doit voir les heures d'ouverture malgaches, converties.
  fuseau text not null default 'Indian/Antananarivo',
  -- Validation manuelle par l'admin avant que le rendez-vous ne devienne ferme. Laisser à false
  -- confirmerait automatiquement à la réservation (non utilisé pour l'instant, mais la colonne
  -- évite d'avoir à migrer le jour où l'établissement voudra ce mode).
  validation_requise boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.reservation_parametres enable row level security;

-- Lecture publique volontaire : la page vitrine doit annoncer la durée de l'appel avant même
-- qu'un créneau soit choisi. Aucune donnée sensible ici, uniquement des réglages d'affichage.
create policy "reservation_parametres_public_select"
  on public.reservation_parametres for select
  to anon, authenticated
  using (true);

create policy "reservation_parametres_admin_all"
  on public.reservation_parametres for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- Plages hebdomadaires récurrentes. Modèle volontairement simple (pas de dates d'exception) :
-- les absences ponctuelles sont déjà portées par l'agenda Google, que le calcul des créneaux
-- interroge — les dupliquer ici ferait deux sources de vérité à tenir d'accord.
create table public.creneaux_disponibilites (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  -- 0 = dimanche … 6 = samedi, même convention que Date.getDay() en JavaScript.
  jour_semaine smallint not null check (jour_semaine between 0 and 6),
  heure_debut time not null,
  heure_fin time not null,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  constraint creneaux_disponibilites_ordre check (heure_fin > heure_debut)
);

create index creneaux_disponibilites_etablissement
  on public.creneaux_disponibilites (etablissement_id, jour_semaine);

alter table public.creneaux_disponibilites enable row level security;

create policy "creneaux_disponibilites_admin_all"
  on public.creneaux_disponibilites for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create table public.rendez_vous (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  debut timestamptz not null,
  duree_minutes integer not null check (duree_minutes between 5 and 240),
  statut public.statut_rendez_vous not null default 'en_attente',
  -- Renseignés à la confirmation seulement : l'événement Google n'est créé qu'une fois le
  -- rendez-vous accepté, pour ne pas polluer l'agenda de demandes jamais validées.
  google_event_id text,
  lien_meet text,
  message text,
  motif_refus text,
  valide_par uuid references public.profiles(id),
  valide_le timestamptz,
  created_at timestamptz not null default now()
);

create index rendez_vous_etablissement_debut on public.rendez_vous (etablissement_id, debut);

-- Deux visiteurs qui cliquent sur le même créneau à quelques secondes d'intervalle : sans cet
-- index, les deux insertions passent (la vérification côté serveur lit un état déjà périmé au
-- moment du COMMIT). Partiel sur les seuls statuts qui occupent réellement le créneau, pour
-- qu'un refus ou une annulation le libère aussitôt.
create unique index rendez_vous_creneau_unique
  on public.rendez_vous (etablissement_id, debut)
  where statut in ('en_attente', 'confirme');

alter table public.rendez_vous enable row level security;

-- Aucune policy insert cliente : la réservation passe obligatoirement par
-- api/prospects/reserver (service_role), qui revérifie que le créneau tombe bien dans une plage
-- ouverte, qu'il est encore libre et qu'il respecte le délai minimum. Laisser un visiteur
-- anonyme écrire directement dans cette table reviendrait à accepter n'importe quelle date.
create policy "rendez_vous_admin_all"
  on public.rendez_vous for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- Valeurs de départ pour les établissements existants, sinon la page vitrine n'aurait aucun
-- créneau à proposer tant qu'un admin n'a pas ouvert l'écran de configuration.
insert into public.reservation_parametres (etablissement_id)
select id from public.etablissements
on conflict (etablissement_id) do nothing;

-- Du lundi au vendredi, 9h-12h et 14h-17h : base modifiable depuis l'écran d'administration.
insert into public.creneaux_disponibilites (etablissement_id, jour_semaine, heure_debut, heure_fin)
select e.id, j.jour, plage.debut, plage.fin
from public.etablissements e
cross join (values (1), (2), (3), (4), (5)) as j(jour)
cross join (values ('09:00'::time, '12:00'::time), ('14:00'::time, '17:00'::time)) as plage(debut, fin);
