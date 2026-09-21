-- Demandes client du 2026-09-21 (suite) :
--   3) Forfait choisi par le prospect, rattaché à `prospects` et repris automatiquement à la
--      conversion en étudiant.
--   4) Refonte du DUO : les deux personnes réservent ensemble depuis la landing, partagent un
--      seul espace étudiant une fois converties.

-- ---------------------------------------------------------------------------------------------
-- 3) Forfait choisi
-- ---------------------------------------------------------------------------------------------

alter table public.prospects
  add column tarif_choisi_id uuid references public.tarifs(id) on delete set null;

comment on column public.prospects.tarif_choisi_id is
  'Tarif choisi par le prospect (parmi ceux de son type_programme), renseigné à l''appel diagnostic. Repris automatiquement en packages à la conversion (api/admin/convert-prospect.ts) pour individuel/duo.';

-- ---------------------------------------------------------------------------------------------
-- 4) DUO — deux personnes, un seul espace étudiant
-- ---------------------------------------------------------------------------------------------

-- Au stade prospect : lien symétrique entre les deux dossiers (aucune notion de « principal »
-- n'a de sens tant qu'il n'y a pas encore de forfait/séances à rattacher quelque part), plus un
-- nom de groupe optionnel dupliqué sur les deux lignes pour un affichage simple sans jointure.
alter table public.prospects
  add column duo_partenaire_id uuid references public.prospects(id) on delete set null,
  add column duo_nom_groupe text;

-- Au stade profil (étudiant) : lien ASYMÉTRIQUE. La personne convertie EN PREMIER devient de
-- fait la « principale » — c'est sur SON id que continuent de vivre packages/sessions/paiements/
-- contrats, exactement comme un étudiant individuel aujourd'hui. La seconde personne convertie
-- est la « secondaire » : son propre profil existe (son propre compte, son propre login), mais
-- `duo_partenaire_id` pointe vers la principale, et c'est ce qui lui ouvre l'accès en lecture
-- aux données de la principale (voir les policies étendues plus bas). Cette asymétrie évite de
-- dupliquer packages/sessions/hour_ledger/paiements pour chaque duo — une seule source de
-- vérité, comme pour un étudiant seul.
alter table public.profiles
  add column duo_partenaire_id uuid references public.profiles(id) on delete set null,
  add column duo_nom_groupe text;

comment on column public.profiles.duo_partenaire_id is
  'Si renseigné, ce profil est le second (secondaire) d''un binôme DUO : il partage en lecture le dossier du profil référencé (le premier converti, "principal"). Jamais l''inverse — le principal n''a pas ce champ renseigné.';

-- Fonction security definer, même principe que is_admin_etablissement()/is_teacher_of_student() :
-- un test direct "exists (select ... from profiles ...)" DANS une policy sur `profiles` créerait
-- une récursion (déjà rencontré et documenté ailleurs dans ce schéma). Elle ne lit que la ligne
-- de l'appelant (id = auth.uid()), déjà autorisée par les policies existantes, mais passer par
-- security definer évite tout risque de cycle quand la fonction est appelée depuis la policy
-- D'UNE AUTRE table (packages, sessions, etc.) qui, elle, doit lire `profiles`.
create function public.est_partenaire_duo(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and duo_partenaire_id = p_id
  )
$$;

-- La secondaire doit pouvoir lire le profil de sa principale (nom, informations personnelles
-- affichées dans le dossier partagé).
create policy "profiles_duo_partenaire_select"
  on public.profiles for select
  to authenticated
  using (public.est_partenaire_duo(profiles.id));

-- Étend chaque policy "l'étudiant voit ses propres données" pour inclure sa secondaire DUO.
-- Reprise à l'identique des policies existantes, avec la seule addition `or
-- public.est_partenaire_duo(...)`. Périmètre volontairement limité au cœur pédagogique et
-- financier (forfait, séances, heures, paiements, factures, contrats, niveau) — documents et
-- notifications restent personnels à chaque login, pas de policy touchée pour ces deux tables.

drop policy "teacher_assignments_student_select" on public.teacher_assignments;
create policy "teacher_assignments_student_select"
  on public.teacher_assignments for select
  to authenticated
  using (student_id = auth.uid() or public.est_partenaire_duo(student_id));

drop policy "session_enrollments_student_select" on public.session_enrollments;
create policy "session_enrollments_student_select"
  on public.session_enrollments for select
  to authenticated
  using (student_id = auth.uid() or public.est_partenaire_duo(student_id));

-- sessions_student_select (0016) passe par cette fonction plutôt que par une policy directe :
-- create or replace ne change pas sa signature, aucun risque de 42P13.
create or replace function public.est_inscrit_a_la_seance(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.session_enrollments
    where session_id = p_session_id
      and (student_id = auth.uid() or public.est_partenaire_duo(student_id))
  )
$$;

drop policy "video_sessions_student_select" on public.video_sessions;
create policy "video_sessions_student_select"
  on public.video_sessions for select
  to authenticated
  using (
    exists (
      select 1 from public.session_enrollments se
      where se.session_id = video_sessions.session_id
        and (se.student_id = auth.uid() or public.est_partenaire_duo(se.student_id))
    )
  );

drop policy "hour_ledger_student_select" on public.hour_ledger;
create policy "hour_ledger_student_select"
  on public.hour_ledger for select
  to authenticated
  using (student_id = auth.uid() or public.est_partenaire_duo(student_id));

drop policy "packages_student_select" on public.packages;
create policy "packages_student_select"
  on public.packages for select
  to authenticated
  using (student_id = auth.uid() or public.est_partenaire_duo(student_id));

drop policy "quotes_student_select" on public.quotes;
create policy "quotes_student_select"
  on public.quotes for select
  to authenticated
  using (student_id = auth.uid() or public.est_partenaire_duo(student_id));

drop policy "invoices_student_select" on public.invoices;
create policy "invoices_student_select"
  on public.invoices for select
  to authenticated
  using (student_id = auth.uid() or public.est_partenaire_duo(student_id));

drop policy "student_payments_student_select" on public.student_payments;
create policy "student_payments_student_select"
  on public.student_payments for select
  to authenticated
  using (student_id = auth.uid() or public.est_partenaire_duo(student_id));

drop policy "niveau_evaluations_student_select" on public.niveau_evaluations;
create policy "niveau_evaluations_student_select"
  on public.niveau_evaluations for select
  to authenticated
  using (student_id = auth.uid() or public.est_partenaire_duo(student_id));

drop policy "contracts_destinataire_select" on public.contracts;
create policy "contracts_destinataire_select"
  on public.contracts for select
  to authenticated
  using (destinataire_profile_id = auth.uid() or public.est_partenaire_duo(destinataire_profile_id));

drop policy "session_modifications_student_select" on public.session_modifications;
create policy "session_modifications_student_select"
  on public.session_modifications for select
  to authenticated
  using (
    exists (
      select 1 from public.session_enrollments se
      where se.session_id = session_modifications.session_id
        and (se.student_id = auth.uid() or public.est_partenaire_duo(se.student_id))
    )
  );

drop policy "paiement_versements_titulaire_select" on public.paiement_versements;
create policy "paiement_versements_titulaire_select"
  on public.paiement_versements for select
  to authenticated
  using (
    exists (
      select 1 from public.student_payments sp
      where sp.id = paiement_versements.student_payment_id
        and (sp.student_id = auth.uid() or public.est_partenaire_duo(sp.student_id))
    )
    or exists (
      select 1 from public.teacher_payments tp
      where tp.id = paiement_versements.teacher_payment_id and tp.teacher_id = auth.uid()
    )
  );
