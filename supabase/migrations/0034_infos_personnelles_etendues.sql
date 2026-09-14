-- Complète la fiche étudiant/professeur : date et lieu de naissance, ville (distincte de
-- l'adresse postale complète), et un numéro WhatsApp facultatif quand il diffère du téléphone.
alter table public.profiles
  add column date_naissance date,
  add column lieu_naissance text,
  add column ville text,
  add column whatsapp text;

-- Corrige un bug pré-existant plutôt qu'un manque lié à ces seules nouvelles colonnes :
-- "profiles_self_update" (0004) est la SEULE policy UPDATE sur profiles, restreinte à
-- `id = auth.uid()`. Le panneau "Informations personnelles" (InformationsPersonnelles.tsx),
-- utilisé UNIQUEMENT par un admin pour éditer la fiche d'un étudiant ou d'un professeur (jamais
-- en self-service — cf. le message "signalez-le à l'administration" côté élève), appelait donc
-- depuis toujours un update RLS qui ne matchait aucune ligne : succès silencieux côté client
-- (aucune erreur PostgREST sur un update à zéro ligne), aucune écriture réelle en base. Vérifié
-- en interrogeant pg_policies sur la base de production le 2026-09-14 : aucune policy UPDATE
-- pour un admin sur un autre profil de son établissement n'a jamais existé.
--
-- Le trigger "empecher_promotion_profil" (0015) continue de bloquer role/etablissement_id/status
-- pour tout appelant hors service_role/postgres — cette policy ne l'affaiblit pas : un admin
-- gagne l'écriture des colonnes d'identité (nom, coordonnées, ces 4 nouvelles), pas celle des
-- colonnes privilégiées, déjà indépendamment verrouillées au niveau trigger.
create policy "profiles_admin_update_etablissement"
  on public.profiles for update
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());
