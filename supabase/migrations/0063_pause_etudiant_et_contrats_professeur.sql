-- Demandes client du 2026-09-23 :
--   2) Mettre un étudiant en pause (bouton à côté de Supprimer), avec motif obligatoire.
--   5/6) Le bloc étudiant et le dossier de l'espace professeur doivent reprendre exactement les
--        mêmes attributs que l'espace admin — dont le badge de statut de contrat, qu'aucune
--        policy RLS n'ouvrait encore au professeur.

-- ---------------------------------------------------------------------------------------------
-- 1) Pause d'un compte étudiant
-- ---------------------------------------------------------------------------------------------
-- Nouvelle valeur d'enum plutôt que de réutiliser 'suspended' : ce dernier sert déjà à la
-- suppression douce (api/admin/supprimer-utilisateur.ts) et fait disparaître le compte de toutes
-- les listes — une pause doit au contraire rester visible (l'admin doit pouvoir la lever), donc a
-- besoin de sa propre valeur, distincte et réversible. Ajoutée seule dans cette migration, sans
-- rien qui l'utilise dans la foulée : Postgres refuse qu'une nouvelle valeur d'enum serve dans la
-- même transaction que celle qui l'ajoute.
alter type public.statut_profil add value 'en_pause';

alter table public.profiles
  add column motif_pause text,
  add column pause_le timestamptz,
  add column pause_par uuid references public.profiles(id);

comment on column public.profiles.motif_pause is
  'Motif de la dernière mise en pause (obligatoire à la pause). Conservé après une réactivation, comme historique — pas remis à null.';

-- ---------------------------------------------------------------------------------------------
-- 2) Parité professeur : badge de statut de contrat de ses élèves
-- ---------------------------------------------------------------------------------------------
-- `contracts_destinataire_select` (0021/0054) ne couvre que la personne concernée par SON PROPRE
-- contrat ; aucune policy n'ouvrait la lecture à un professeur pour le contrat d'un de ses
-- élèves. Same fonction `is_teacher_of_student()` déjà utilisée pour documents/packages/hour_ledger
-- (0018/0061) — lecture seule, la policy admin reste la seule à permettre l'écriture.
create policy "contracts_teacher_select"
  on public.contracts for select
  to authenticated
  using (public.is_teacher_of_student(destinataire_profile_id));
