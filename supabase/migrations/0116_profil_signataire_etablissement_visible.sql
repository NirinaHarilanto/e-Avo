-- Le nom et la signature de l'admin ayant signé pour l'établissement n'apparaissaient que côté
-- admin — demande client du 2026-10-11 : « pourquoi l'étudiant ne voit pas le nom et la signature
-- du CEO Harinjo sur son contrat, alors que c'est visible du côté de l'admin ».
--
-- Cause : `ContratImprimable.tsx` affiche `signataireEtablissement`, résolu par `useContrats.ts`
-- via une lecture `profiles` sur `contracts.signe_etablissement_par`. Aucune policy n'ouvrait
-- cette lecture à un destinataire (étudiant ou professeur, `contracts_destinataire_select`,
-- 0021/0054/0066) pour le profil de l'admin qui a signé SON contrat — seul `profiles_self_select`
-- (sa propre ligne) et `profiles_admin_select_etablissement` (côté admin) s'appliquaient. La
-- requête de `useContrats.ts` revenait donc sans cette ligne, et `SignatureAffichee`
-- (ContratImprimable.tsx) retombait sur son repli générique « Lu et approuvé par le signataire »,
-- sans nom ni image.
--
-- Portée volontairement étroite : seul le profil RÉFÉRENCÉ comme signataire établissement d'un
-- contrat dont JE suis destinataire (principal ou secondaire, 0066) devient lisible — pas
-- n'importe quel profil admin de l'établissement, qui resterait hors de portée d'un élève ou
-- d'un professeur.
--
-- Aucun risque de récursion : cette policy sur `profiles` interroge `contracts`, dont aucune
-- policy ne relit `profiles` directement — `contracts_admin_all`/`contracts_teacher_select`
-- passent par `is_admin_etablissement()`/`is_teacher_of_student()`, toutes deux `security
-- definer` et ownées par `postgres` (BYPASSRLS sur Supabase, voir 0003) : leur lecture interne de
-- `profiles` ne déclenche aucune évaluation RLS. Même raisonnement que 0017/0054.
create policy "profiles_signataire_contrat_select"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.contracts c
      where c.signe_etablissement_par = profiles.id
        and (c.destinataire_profile_id = auth.uid() or c.destinataire_secondaire_profile_id = auth.uid())
    )
  );
