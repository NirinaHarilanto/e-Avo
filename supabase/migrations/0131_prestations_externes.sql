-- Cours corporate et chat & chill — demande client du 2026-10-19, précisée le même jour : « ces
-- taux ne sont pas applicables à des étudiants en interne de HOC. Il faut donc que l'on ait un
-- bloc spécifique pour ces taux dans la fiche professeur de l'espace admin, à partir de laquelle
-- l'admin pourra créer et suivre l'historique des cours corporate & chat & chill par chaque
-- professeur. Le bloc devra être également visible dans l'espace professeur. Une fois une séance
-- terminée, la séance pourra être facturée dans la timesheet du professeur. »
--
-- Ce sont des PRESTATIONS EXTERNES : elles n'ont ni élève inscrit, ni forfait, ni vague, ni
-- compteur d'heures côté étudiant. D'où une table à part plutôt qu'un type de plus sur
-- `sessions`, qui porte partout des inscriptions, un cohort_id, une visio et un débit d'heures
-- élève — autant de colonnes qui n'auraient aucun sens ici, et autant d'écrans (agendas,
-- dossiers, suivi collectif) qui se seraient mis à montrer des cours sans élève.
--
-- En revanche, le CRÉDIT du professeur passe bien par `hour_ledger`, comme n'importe quelle
-- séance clôturée : c'est ce qui fait entrer la prestation dans le TimeSheet sans toucher d'une
-- ligne au mécanisme de collecte, de réservation et de paiement déjà en place (0081).

create table public.prestations_externes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('corporate', 'chat_chill')),
  /* L'entreprise ou la personne pour qui la prestation est donnée. Obligatoire : c'est le seul
     intitulé de la ligne au TimeSheet, une prestation sans client y serait anonyme. */
  client text not null,
  debut timestamptz not null,
  duree_minutes integer not null check (duree_minutes > 0 and duree_minutes <= 600),
  /* Libre : « En ligne », « Locaux du client », une adresse… Rien n'en dépend. */
  lieu text,
  notes text,
  statut text not null default 'planifiee' check (statut in ('planifiee', 'terminee', 'annulee')),
  terminee_le timestamptz,
  terminee_par uuid references public.profiles(id) on delete set null,
  motif_annulation text,
  cree_par uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Une prestation terminée porte toujours sa date de clôture, et réciproquement : c'est elle qui
  -- déclenche l'écriture d'heures, les deux ne peuvent pas diverger.
  constraint prestations_externes_cloture_coherente check ((statut = 'terminee') = (terminee_le is not null))
);

create index prestations_externes_professeur_idx on public.prestations_externes (teacher_id, debut desc);
create index prestations_externes_etablissement_idx on public.prestations_externes (etablissement_id, statut, debut desc);

alter table public.prestations_externes enable row level security;

-- L'admin crée, modifie, annule et supprime depuis la fiche du professeur.
create policy "prestations_externes_admin_all"
  on public.prestations_externes for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

-- Le professeur voit les siennes (« le bloc devra être également visible dans l'espace
-- professeur »), en lecture seule : il ne se crée pas de prestations à lui-même, et la clôture
-- passe par le serveur puisqu'elle écrit dans `hour_ledger` (voir api/prestations/cloturer.ts).
create policy "prestations_externes_teacher_select"
  on public.prestations_externes for select
  to authenticated
  using (teacher_id = auth.uid());

create trigger prestations_externes_touch
  before update on public.prestations_externes
  for each row execute function public.horodater_updated_at();


-- ───────────── Le crédit d'heures d'une prestation externe, dans le même registre ─────────────

-- `session_id` était `not null` (0011) : il devient nullable pour accueillir une écriture qui ne
-- vient pas d'une séance. L'écriture en porte alors une autre source, et exactement une des deux.
alter table public.hour_ledger alter column session_id drop not null;

alter table public.hour_ledger
  add column prestation_externe_id uuid references public.prestations_externes(id) on delete cascade;

comment on column public.hour_ledger.prestation_externe_id is
  'Prestation externe (corporate, chat & chill) à l''origine de ce crédit professeur (0131). Exclusif avec session_id.';

alter table public.hour_ledger
  add constraint hour_ledger_une_seule_source check (num_nonnulls(session_id, prestation_externe_id) = 1);

-- `hour_ledger_credit_unique (session_id, teacher_id)` (0011) empêche un double crédit sur une
-- même séance ; il ne protège rien quand `session_id` est nul (deux NULL ne sont jamais égaux en
-- SQL — exactement le piège que le commentaire de 0011 relevait déjà pour `student_id`). Son
-- pendant pour les prestations externes :
create unique index hour_ledger_credit_prestation_unique
  on public.hour_ledger (prestation_externe_id, teacher_id)
  where type_ecriture = 'credit_professeur';

-- `type_facturation` (0126) ne connaissait que les trois types de cours HOC. Les deux nouveaux
-- s'y ajoutent : c'est lui qui décide ensuite quel taux horaire s'applique à la ligne
-- (src/lib/remuneration.ts).
--
-- 0126 l'avait écrite en contrainte de colonne, donc SANS nom explicite : Postgres en a généré un
-- (`hour_ledger_type_facturation_check` dans le cas général, mais rien ne le garantit s'il devait
-- lever une collision). On la retrouve par ce qu'elle porte plutôt que par un nom supposé — sans
-- quoi cette migration échouerait sur une base où il diffère, et il n'y a pas de seconde chance
-- en production.
do $$
declare
  nom_contrainte text;
begin
  select con.conname into nom_contrainte
  from pg_constraint con
  join pg_class cls on cls.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = cls.relnamespace
  where nsp.nspname = 'public'
    and cls.relname = 'hour_ledger'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%type_facturation%'
  limit 1;

  if nom_contrainte is not null then
    execute format('alter table public.hour_ledger drop constraint %I', nom_contrainte);
  end if;
end
$$;

alter table public.hour_ledger
  add constraint hour_ledger_type_facturation_check
  check (type_facturation in ('individuel', 'collectif', 'duo', 'corporate', 'chat_chill'));

comment on column public.hour_ledger.type_facturation is
  'Type de séance au moment de la clôture, pour choisir le taux horaire applicable (0126, étendu aux prestations externes en 0131). NULL = antérieure à 0126, traitée comme ''individuel''.';
