-- Créneaux horaires des classes : une liste que l'administration allonge elle-même — demande
-- client du 2026-10-31, capture à l'appui de l'écran Paramètres : « il faudrait rajouter un
-- bouton "Ajouter créneau" afin que l'utilisateur puisse rajouter plus de choix au niveau des
-- créneaux. Les mises à jour seront instantanées dans toutes les informations de HOC. »
--
-- 0074 avait figé exactement trois créneaux, et à deux endroits à la fois : trois colonnes
-- `etablissements.creneau_matin / creneau_midi / creneau_soir` pour les heures, et un type enum
-- `creneau_classe` ('matin','midi','soir') pour la clé portée par chaque classe. Ajouter un
-- quatrième créneau demandait donc une migration à chaque fois — c'est ce que cette migration
-- supprime, pas seulement pour un créneau de plus.
--
-- Deux conséquences, assumées :
--   * `cohort_classes.creneau` passe de l'enum au texte. Postgres ne sait pas retirer une valeur
--     d'un enum, et un enum dont les valeurs sont saisies par l'utilisateur n'est plus un enum.
--     Les valeurs déjà écrites ('matin','midi','soir') sont conservées telles quelles : aucune
--     classe existante ne change de créneau, et les clés restent les mêmes côté application.
--   * les trois colonnes de `etablissements` ne sont PAS supprimées. Elles servent ici de source
--     d'amorçage, et des contrats déjà émis peuvent les citer. Plus rien ne les lit ensuite :
--     l'écran Paramètres écrit désormais dans la table ci-dessous.

create table public.creneaux_classes (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  /* Clé stable écrite dans `cohort_classes.creneau`. Jamais réécrite après coup : renommer un
     créneau change son libellé, pas sa clé, sinon les classes déjà rattachées la perdraient. */
  cle text not null check (btrim(cle) <> '' and cle ~ '^[a-z0-9_]+$'),
  libelle text not null check (btrim(libelle) <> ''),
  heure time not null,
  ordre integer not null default 0,
  /* Un créneau retiré de l'offre sans effacer les classes qui l'utilisent encore : il disparaît
     des listes de choix mais continue de s'afficher sur celles qui le portent. */
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index creneaux_classes_cle_unique on public.creneaux_classes (etablissement_id, cle);
create index creneaux_classes_etablissement on public.creneaux_classes (etablissement_id, ordre);

-- Amorçage depuis les trois colonnes en place, établissement par établissement : les heures déjà
-- réglées par l'administration sont reprises telles quelles, et les clés restent celles que les
-- classes portent déjà.
insert into public.creneaux_classes (etablissement_id, cle, libelle, heure, ordre)
select e.id, v.cle, v.libelle, v.heure, v.ordre
from public.etablissements e
cross join lateral (
  values
    ('matin', 'Matin', e.creneau_matin, 1),
    ('midi',  'Midi',  e.creneau_midi,  2),
    ('soir',  'Soir',  e.creneau_soir,  3)
) as v(cle, libelle, heure, ordre)
on conflict (etablissement_id, cle) do nothing;

alter table public.cohort_classes
  alter column creneau drop default;

alter table public.cohort_classes
  alter column creneau type text using creneau::text;

alter table public.cohort_classes
  alter column creneau set default 'soir';

comment on column public.cohort_classes.creneau is
  'Clé d''un créneau de `creneaux_classes` (0150). Était un enum figé à matin/midi/soir (0074).';

-- Volontairement PAS de clé étrangère vers `creneaux_classes` : supprimer un créneau devenu
-- inutile ne doit ni être bloqué par une vieille classe close, ni effacer son horaire. L'écran
-- propose « désactiver » pour le retirer des choix sans toucher à l'existant, et une clé inconnue
-- s'affiche telle quelle plutôt que de faire disparaître la ligne.

alter table public.creneaux_classes enable row level security;

/* Lecture ouverte à tout l'établissement : le créneau d'une classe s'affiche dans l'espace
   professeur et dans le dossier de l'élève, qui doivent pouvoir en lire le libellé. Rien de
   sensible — un horaire de cours. */
create policy "creneaux_classes_lecture"
  on public.creneaux_classes for select
  to authenticated
  using (etablissement_id = public.current_etablissement_id());

create policy "creneaux_classes_admin_all"
  on public.creneaux_classes for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());
