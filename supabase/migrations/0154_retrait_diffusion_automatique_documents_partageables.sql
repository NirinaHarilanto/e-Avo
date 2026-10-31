-- Un document « partageable » n'est plus visible de tout l'établissement d'un coup — demande
-- client du 2026-10-31, capture à l'appui, corrigeant une décision de conception du 2026-09-13
-- (0033) : « l'instruction n'est pas correcte. Tout dossier ici est partageable mais pas
-- immédiatement visible par tous les étudiants et professeurs. Le détenteur de l'espace est
-- libre de donner une vue du document à une autre personne dans l'application HOC, c'est
-- l'exigence de base. »
--
-- Ce que 0033 avait posé, sans qu'aucune demande client ne le dise en ces termes : déposer un
-- fichier dans Documents › Partageables (`documents.etablissement_wide = true`) lui donnait
-- aussitôt un `SELECT` ouvert à TOUT l'établissement (`documents_etablissement_wide_select`), et
-- 0149 avait étendu la même règle à l'arborescence de dossiers le jour même. Ce que le client
-- vient de préciser contredit directement cette diffusion automatique — et recoupe une règle
-- qu'il avait lui-même posée un mois plus tôt, dans des termes presque identiques (0111, le
-- 2026-10-10) : « TOUT utilisateur voyant un document dans son espace peut ajouter une vue du
-- document à un autre utilisateur même s'il n'est pas propriétaire. » C'est ce mécanisme de
-- partage explicite, document par document, qui fait foi — pas une diffusion globale.
--
-- Cette migration retire donc les deux policies qui accordaient cette visibilité automatique.
-- Rien d'autre ne change :
--   * les colonnes `etablissement_wide` (`documents`, `document_dossiers`) restent en place —
--     elles continuent de distinguer, DANS L'ESPACE DE L'ADMIN QUI DÉPOSE, « mes documents à
--     vocation de partage » de ses autres documents personnels. Un simple repère d'organisation,
--     plus un laissez-passer ;
--   * le bouton « Partager » de chaque fichier reste actif sur ces documents comme sur tous les
--     autres (`peutPartager`, DocumentsAdmin.tsx) — c'est lui, et lui seul désormais, qui ouvre
--     la vue d'un document à quelqu'un ;
--   * `documents_admin_all` (0018) continue de donner à TOUT admin de l'établissement l'accès
--     complet à ces documents, quel que soit celui qui les a déposés : aucune régression pour
--     l'administration elle-même ;
--   * le document reste invisible d'un établissement À UN AUTRE, comme avant (la policy exigeait
--     déjà `etablissement_id = current_etablissement_id()`, seul le SELECT ouvert à l'intérieur
--     de l'établissement disparaît).

drop policy if exists "documents_etablissement_wide_select" on public.documents;
drop policy if exists "document_dossiers_etablissement_wide_select" on public.document_dossiers;

comment on column public.documents.etablissement_wide is
  'Catégorise un document comme destiné au partage, dans l''espace de son déposant (0033). '
  'N''accorde PLUS aucune visibilité automatique depuis le 2026-10-31 (0154) : seul le partage '
  'explicite, document par document (document_partages, 0111), rend un fichier visible à '
  'quelqu''un d''autre que son propriétaire et les admins de l''établissement.';

comment on column public.document_dossiers.etablissement_wide is
  'Dossier de l''espace documentaire du déposant, catégorisé « à vocation de partage » (0149). '
  'N''accorde PLUS aucune visibilité automatique depuis le 2026-10-31 (0154) — voir le '
  'commentaire de documents.etablissement_wide, qui porte la même correction.';
