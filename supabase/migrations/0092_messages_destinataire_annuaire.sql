-- Correctif de `messages_expediteur_insert` (0090) : la policy vérifiait l'existence du
-- destinataire par une sous-requête sur `public.profiles`. Or une sous-requête dans une policy est
-- elle-même soumise à la RLS de la table interrogée (piège déjà rencontré et exploité à l'inverse
-- en 0086) : un élève ne voit que sa propre ligne de `profiles` (0004/0017), donc le `exists` ne
-- trouvait JAMAIS le professeur à qui il écrit et tout envoi d'élève était refusé
-- (« new row violates row-level security policy »). Constaté en rejouant un envoi réel sous
-- l'identité d'une élève avant même la mise en service.
--
-- La vue `annuaire_etablissement` (0090) est précisément la réponse : security definer, déjà
-- bornée à l'établissement courant et aux comptes non suspendus. Elle devient la définition unique
-- de « toute personne enregistrée dans l'application HOC » — celle que le sélecteur de
-- destinataires affiche à l'écran ET celle que la policy d'écriture autorise. Les deux ne peuvent
-- plus divergir.

drop policy "messages_expediteur_insert" on public.messages;

create policy "messages_expediteur_insert"
  on public.messages for insert
  to authenticated
  with check (
    expediteur_profile_id = auth.uid()
    and etablissement_id = public.current_etablissement_id()
    and exists (
      select 1 from public.annuaire_etablissement a
      where a.id = destinataire_profile_id
    )
  );
