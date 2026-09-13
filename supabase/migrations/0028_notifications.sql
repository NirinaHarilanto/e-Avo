-- Notifications internes — fondation transverse pour les Phases 3/4/6 du chantier "Hari
-- Online Club" (factures/reçus/contrats à signer/rappels). Décision actée avec le client
-- (2026-09-13) : tout se fait EN INTERNE dans l'application (pas d'e-mail transactionnel type
-- Resend) — une notification pointe vers une page de l'espace du destinataire où l'élément
-- concerné (facture, contrat...) est déjà visible via les policies RLS existantes.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  destinataire_profile_id uuid not null references public.profiles(id),
  type text not null,
  titre text not null,
  message text,
  lien text,
  lu boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "notifications_destinataire_select"
  on public.notifications for select
  to authenticated
  using (destinataire_profile_id = auth.uid());

-- RLS ne filtre pas par colonne : cette policy autorise techniquement le destinataire à
-- modifier titre/message/lien de SA PROPRE notification, pas seulement `lu`. Accepté (risque
-- nul au-delà de son propre fil) plutôt que d'ajouter un trigger de garde pour un cas aussi
-- peu sensible.
create policy "notifications_destinataire_update"
  on public.notifications for update
  to authenticated
  using (destinataire_profile_id = auth.uid())
  with check (destinataire_profile_id = auth.uid());

-- Pas de policy insert/delete côté client : une notification doit toujours correspondre à un
-- événement métier réel (facture émise, contrat à signer...), créée par du code serveur
-- (clé service_role) ou par un trigger security definer — même principe que hour_ledger (0011).
