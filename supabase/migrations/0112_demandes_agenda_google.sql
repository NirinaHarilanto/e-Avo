-- Un professeur ne change pas seul l'adresse Gmail connectée à son agenda HOC — exigence client du
-- 2026-10-10 :
--   « un professeur est libre de faire la synchronisation de son compte gmail, avec un pop-up pour
--     bien vérifier son adresse mail avant la validation de la synchronisation. Le professeur, dans
--     son espace personnel, ne pourra pas modifier son adresse gmail déjà connectée à HOC sans
--     l'autorisation et la validation de l'admin. Le professeur pourra faire une demande à l'admin
--     depuis son espace personnel professeur, mais la validation sera faite uniquement par
--     l'admin. »
--
-- POURQUOI CE VERROU COMPTE VRAIMENT, au-delà de la demande : l'adresse connectée est celle qui
-- organise les réunions et invite les élèves, et chaque compte Google distinct qui passe l'écran de
-- consentement consomme DÉFINITIVEMENT une place sur le quota de 100 utilisateurs de l'application
-- Google non vérifiée (quota « lifetime of the project », non réinitialisable). Un professeur qui
-- se trompe de compte, ou qui en essaie plusieurs, brûle ce quota sans le savoir. D'où deux
-- garde-fous complémentaires : la PREMIÈRE connexion reste libre mais passe par une confirmation
-- explicite de l'adresse (vérifiée au retour de Google, voir google-oauth-callback.ts), et tout
-- CHANGEMENT ultérieur demande l'accord de l'administration.
--
-- La première connexion n'est volontairement PAS soumise à autorisation : « un professeur est libre
-- de faire la synchronisation de son compte gmail ». C'est le changement qui l'est.

create table public.demandes_agenda_google (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Adresse connectée au moment de la demande : conservée telle quelle, car l'intégration peut
  -- avoir changé entre la demande et sa relecture — c'est la trace de ce que l'admin a réellement
  -- approuvé de remplacer.
  google_email_actuel text,
  -- Adresse souhaitée, telle que le professeur l'a saisie. C'est elle que le callback OAuth
  -- comparera à l'adresse réellement renvoyée par Google : une autorisation porte sur UNE adresse
  -- précise, jamais sur « reconnecter n'importe quoi ».
  google_email_souhaite text not null,
  motif text,
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'approuvee', 'refusee', 'utilisee')),
  decide_par uuid references public.profiles(id),
  decide_le timestamptz,
  motif_refus text,
  created_at timestamptz not null default now()
);

create index demandes_agenda_google_etablissement on public.demandes_agenda_google (etablissement_id, statut);

-- Une seule demande vivante par professeur : en attente (l'admin ne doit pas arbitrer une pile de
-- demandes contradictoires) ou approuvée mais pas encore utilisée (sinon deux autorisations
-- ouvertes permettraient de connecter deux adresses successives avec un seul accord).
create unique index demandes_agenda_google_une_vivante
  on public.demandes_agenda_google (profile_id)
  where statut in ('en_attente', 'approuvee');

alter table public.demandes_agenda_google enable row level security;

-- Le professeur voit ses propres demandes et peut en déposer une. Il n'a AUCUNE policy d'update :
-- c'est ce qui rend « la validation sera faite uniquement par l'admin » structurel et non
-- cosmétique — même en appelant l'API directement, il ne peut pas approuver sa propre demande.
-- Le `with check` impose aussi le statut de départ : rien ne naît approuvé.
create policy "demandes_agenda_google_proprietaire_select"
  on public.demandes_agenda_google for select
  to authenticated
  using (profile_id = auth.uid());

create policy "demandes_agenda_google_proprietaire_insert"
  on public.demandes_agenda_google for insert
  to authenticated
  with check (
    profile_id = auth.uid()
    and etablissement_id = public.current_etablissement_id()
    and statut = 'en_attente'
    and decide_par is null
    and decide_le is null
  );

-- Il peut en revanche retirer sa demande tant qu'elle n'est pas tranchée : une demande déposée par
-- erreur ne doit pas rester à encombrer l'écran de l'admin, et l'annuler ne lui accorde rien.
create policy "demandes_agenda_google_proprietaire_delete"
  on public.demandes_agenda_google for delete
  to authenticated
  using (profile_id = auth.uid() and statut = 'en_attente');

create policy "demandes_agenda_google_admin_all"
  on public.demandes_agenda_google for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- Vue pour l'écran d'administration : les demandes avec le nom du professeur, sans jointure à
-- écrire côté client. Mêmes restrictions que `google_agendas_professeurs_statut` (0107) — portée à
-- l'établissement courant et aux seuls admins, par la clause WHERE puisque la vue n'est pas
-- `security_invoker`.
create view public.demandes_agenda_google_admin as
select
  d.id,
  d.profile_id,
  p.prenom,
  p.nom,
  p.email,
  d.google_email_actuel,
  d.google_email_souhaite,
  d.motif,
  d.statut,
  d.motif_refus,
  d.decide_le,
  d.created_at
from public.demandes_agenda_google d
join public.profiles p on p.id = d.profile_id
where d.etablissement_id = public.current_etablissement_id()
  and public.is_admin_etablissement();

grant select on public.demandes_agenda_google_admin to authenticated;
