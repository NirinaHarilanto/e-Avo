-- Partage de la vue d'un document par TOUTE personne qui le voit — règle posée par le client le
-- 2026-10-10, après la correction partielle de 0110 :
--   « TOUTE personne dans HOC peut partager la vue d'un document même s'il n'est pas le
--     propriétaire du compte où le document a été initié. Je répète l'exigence, TOUT utilisateur
--     voyant un document dans son espace peut ajouter une vue du document à un autre utilisateur
--     même s'il n'est pas propriétaire. »
--
-- 0110 avait élargi le droit de partage au déposant et à l'administration ; cette migration lève
-- la dernière condition sur la provenance du document. La règle devient exactement celle énoncée :
-- VOIR un document suffit pour en ouvrir la vue à quelqu'un d'autre.
--
-- Pourquoi `exists (select 1 from documents d where d.id = document_id)` SUFFIT à dire « que je
-- vois » : dans une policy, la sous-requête est exécutée avec les droits de l'appelant, donc
-- filtrée par TOUTES les policies SELECT de `documents` combinées (RLS s'applique aux
-- sous-requêtes comme aux requêtes de premier niveau). Un document invisible pour moi — l'espace
-- personnel d'autrui, un confidentiel auquel je ne suis pas inscrit — ne ressort pas de cette
-- sous-requête, et reste donc impartageable par moi sans qu'il y ait une seule condition à écrire
-- ici. C'est la même délégation qu'en 0086 pour `storage.objects` : un seul jeu de règles de
-- visibilité, celui de `documents`, et aucune liste de cas à maintenir en double.
--
-- `partage_par_profile_id = auth.uid()` reste exigé : on ne partage jamais au nom de quelqu'un
-- d'autre, le destinataire doit lire le bon nom sous « Partagé avec vous par ».
--
-- CONSÉQUENCE ASSUMÉE : un document reçu en partage peut être re-partagé (c'est le sens littéral
-- de « TOUT utilisateur voyant un document »). Si A partage à B et que B partage à C, retirer le
-- partage de A à B ne retire pas celui de B à C — chaque partage est une ligne autonome. En
-- revanche, supprimer le document les emporte tous (`on delete cascade`, 0059), et le propriétaire
-- garde toujours ce dernier recours. Les documents qu'une personne dépose dans SON espace restent
-- invisibles des autres (0059), donc hors de ce mécanisme.

drop policy "document_partages_emetteur_all" on public.document_partages;

create policy "document_partages_emetteur_all"
  on public.document_partages for all
  to authenticated
  using (
    partage_par_profile_id = auth.uid()
    and exists (select 1 from public.documents d where d.id = document_id)
  )
  with check (
    partage_par_profile_id = auth.uid()
    and exists (select 1 from public.documents d where d.id = document_id)
  );
