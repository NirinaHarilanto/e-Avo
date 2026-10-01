-- Section « Messages » dans les trois espaces — demande client du 2026-10-01 : « chaque personne
-- peut envoyer un message à toute personne enregistrée dans l'application HOC. L'admin pourra
-- envoyer et recevoir des messages. » Portée confirmée par le client : tout le monde vers tout le
-- monde, y compris d'élève à élève.
--
-- Distinct de `notifications` (0028), qui reste un signal SYSTÈME à sens unique (« votre séance a
-- été déplacée ») : ici, un humain écrit à un humain, avec un objet, un fil de réponses et un état
-- lu/non lu propre au destinataire.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  expediteur_profile_id uuid not null references public.profiles(id),
  destinataire_profile_id uuid not null references public.profiles(id),
  objet text not null,
  corps text not null,
  /* Réponse à un message existant : porte le fil. `on delete set null` et non cascade — supprimer
     un message ne doit pas faire disparaître les réponses qu'il a suscitées. */
  parent_id uuid references public.messages(id) on delete set null,
  lu boolean not null default false,
  created_at timestamptz not null default now()
);

create index messages_destinataire on public.messages (destinataire_profile_id, created_at desc);
create index messages_expediteur on public.messages (expediteur_profile_id, created_at desc);
create index messages_parent on public.messages (parent_id) where parent_id is not null;

alter table public.messages enable row level security;

/* Lecture : on voit un message dont on est l'expéditeur ou le destinataire, jamais celui de deux
   autres personnes — l'admin inclus. C'est volontaire : la section Messages est une messagerie
   personnelle, pas un journal de modération. */
create policy "messages_participant_select"
  on public.messages for select
  to authenticated
  using (expediteur_profile_id = auth.uid() or destinataire_profile_id = auth.uid());

/* Écriture : uniquement en son propre nom, et uniquement vers quelqu'un du même établissement.
   `current_etablissement_id()` (0023) borne les deux côtés, ce qui empêche d'écrire à un profil
   d'un autre établissement en forgeant son identifiant. */
create policy "messages_expediteur_insert"
  on public.messages for insert
  to authenticated
  with check (
    expediteur_profile_id = auth.uid()
    and etablissement_id = public.current_etablissement_id()
    and exists (
      select 1 from public.profiles p
      where p.id = destinataire_profile_id
        and p.etablissement_id = public.current_etablissement_id()
        and p.status <> 'suspended'
    )
  );

/* Le destinataire marque son message comme lu. Le `with check` interdit de détourner cet update
   pour réécrire l'objet, le corps ou l'expéditeur d'un message reçu : seules les colonnes
   inchangées passent le test (comparaison à l'ancienne ligne impossible en RLS, d'où le trigger
   ci-dessous qui verrouille le contenu). */
create policy "messages_destinataire_update"
  on public.messages for update
  to authenticated
  using (destinataire_profile_id = auth.uid())
  with check (destinataire_profile_id = auth.uid());

create function public.messages_verrouiller_contenu()
returns trigger
language plpgsql
as $$
begin
  /* Seul `lu` est modifiable après coup. Sans ce verrou, la policy d'update du destinataire
     (nécessaire pour marquer comme lu) lui permettrait de réécrire le message qu'il a reçu —
     et donc de fabriquer une preuve. */
  if new.objet <> old.objet
     or new.corps <> old.corps
     or new.expediteur_profile_id <> old.expediteur_profile_id
     or new.destinataire_profile_id <> old.destinataire_profile_id
     or new.etablissement_id <> old.etablissement_id
     or coalesce(new.parent_id::text, '') <> coalesce(old.parent_id::text, '')
     or new.created_at <> old.created_at then
    raise exception 'Un message envoyé ne peut plus être modifié (seul son état lu/non lu change).';
  end if;
  return new;
end;
$$;

create trigger messages_contenu_immuable
  before update on public.messages
  for each row execute function public.messages_verrouiller_contenu();

/* L'expéditeur peut supprimer un message qu'il a envoyé (et le destinataire le sien, côté boîte
   de réception) — pas de suppression douce ici : un message n'est pas une pièce comptable. */
create policy "messages_participant_delete"
  on public.messages for delete
  to authenticated
  using (expediteur_profile_id = auth.uid() or destinataire_profile_id = auth.uid());

-- Annuaire : la liste des personnes à qui écrire.
--
-- `profiles` ne laisse voir à un élève que lui-même et son professeur (0004/0017) : sans cette
-- vue, il n'a aucun moyen de choisir un destinataire. Élargir `profiles` exposerait à tous les
-- élèves les e-mails, téléphones, adresses et taux horaires de tout le monde — cette vue n'expose
-- QUE le nom et le rôle, ce qui suffit à adresser un message.
--
-- PAS `security_invoker` (contrairement à la règle générale du projet) : c'est précisément une
-- vue-fenêtre sur une table volontairement fermée, et c'est sa clause WHERE qui porte la sécurité
-- — même patron que `google_integration_statut` (0041), où `security_invoker = true` avait rendu
-- la vue systématiquement vide. Le filtre d'établissement empêche toute fuite entre établissements.
create view public.annuaire_etablissement as
select
  p.id,
  p.prenom,
  p.nom,
  p.role,
  p.etablissement_id
from public.profiles p
where p.etablissement_id = public.current_etablissement_id()
  and p.status <> 'suspended';

grant select on public.annuaire_etablissement to authenticated;

-- `notifications` porte déjà le type libre (text) : les nouveaux types « message_recu » n'ont
-- besoin d'aucune migration d'enum.
