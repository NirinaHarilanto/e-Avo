-- Partager la vue d'un document qu'on gère sans en être le propriétaire de l'espace — demande
-- client du 2026-10-10 : « quand je clique sur un document dans HOC, il faut que je puisse
-- partager la vue de ce document avec d'autres personnes dans HOC. C'est la règle que l'on s'est
-- fixé. »
--
-- CE QUI NE MARCHAIT PAS. La policy `document_partages_proprietaire_all` (0059) exige
-- `documents.owner_profile_id = auth.uid()` : seul le propriétaire de l'ESPACE où le fichier est
-- rangé pouvait le partager. Conséquence, invisible à la lecture de cette seule règle : depuis
-- l'espace admin, le bouton « Partager » n'apparaissait pratiquement jamais —
--   * onglet Étudiants / Professeurs : le fichier est rangé chez la personne, pas chez l'admin ;
--   * onglet Partageables : `owner_profile_id` vaut bien l'admin déposant, mais un document
--     déposé par un AUTRE administrateur ne l'est pas ;
--   * onglet Confidentiels : même cas.
-- L'administration pouvait donc déposer, corriger et supprimer n'importe quel document de
-- l'établissement, mais pas en ouvrir la vue à quelqu'un — alors que c'est précisément son
-- métier de faire circuler un règlement, un support ou une pièce de dossier.
--
-- LA RÈGLE RETENUE. On peut partager la vue d'un document sur lequel on a déjà autorité :
--   1. on est le propriétaire de l'espace qui le contient (règle de 0059, conservée telle quelle) ;
--   2. on l'a déposé soi-même — y compris dans l'espace de quelqu'un d'autre (un professeur qui
--      remet une correction à un élève peut la partager à un second élève) ;
--   3. on est administrateur de l'établissement, qui a déjà l'écriture sur tous ses documents
--      (`documents_admin_insert` / `_update` / `_delete`, 0059).
--
-- Ce que cela n'ouvre PAS : l'espace personnel d'autrui. Un document que la personne a déposé
-- elle-même chez elle (`uploaded_by_profile_id = owner_profile_id`) reste invisible de l'admin
-- comme du professeur (`documents_admin_select`, 0059) ; ne pouvant pas le lire, ils ne peuvent
-- pas davantage le partager — la sous-requête `exists (select 1 from documents ...)` ci-dessous
-- est elle-même filtrée par les policies SELECT de `documents`, puisque RLS s'applique aux
-- sous-requêtes comme aux requêtes de premier niveau (même mécanique que 0086).
--
-- `partage_par_profile_id = auth.uid()` reste exigé dans tous les cas : on ne partage jamais au
-- nom de quelqu'un d'autre, le destinataire doit lire le bon nom sous « Partagé avec vous par ».

drop policy "document_partages_proprietaire_all" on public.document_partages;

create policy "document_partages_emetteur_all"
  on public.document_partages for all
  to authenticated
  using (
    partage_par_profile_id = auth.uid()
    and exists (
      select 1 from public.documents d
      where d.id = document_id
        and (
          d.owner_profile_id = auth.uid()
          or d.uploaded_by_profile_id = auth.uid()
          or (d.etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
        )
    )
  )
  with check (
    partage_par_profile_id = auth.uid()
    and exists (
      select 1 from public.documents d
      where d.id = document_id
        and (
          d.owner_profile_id = auth.uid()
          or d.uploaded_by_profile_id = auth.uid()
          or (d.etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
        )
    )
  );
