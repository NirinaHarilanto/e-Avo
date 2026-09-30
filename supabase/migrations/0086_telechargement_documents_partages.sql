-- Corrige « Object not found » au téléchargement d'un document partagé, partageable (étage) ou
-- confidentiel à liste blanche — demande client du 2026-09-30 : « depuis l'espace étudiant, quand
-- je télécharge un document qui a été partagé par un professeur, il y a un message d'erreur
-- object not found. Il faut que tous les documents dans tous les espaces soient téléchargeables. »
--
-- Cause : `documents_storage_select` (policy sur storage.objects, posée en 0018, jamais retouchée
-- depuis) ne couvrait que 4 cas — propriétaire, uploadeur, professeur d'un élève propriétaire,
-- admin. Les règles de visibilité de la table `documents` elle-même ont pourtant grandi depuis :
-- partage explicite (`document_partages`, 0059), documents « partageables » vus par tout
-- l'établissement (`etablissement_wide`, 0033), documents confidentiels à liste blanche
-- (`document_permissions`, 0033). Chacune de ces policies a été ajoutée sur `documents`
-- (la métadonnée, donc la fiche est bien visible à l'écran) mais JAMAIS répercutée sur
-- `storage.objects` (le fichier lui-même) : Supabase Storage renvoie alors une 404 « Object not
-- found » sur le fichier refusé par RLS, plutôt qu'un 403 — d'où le message trompeur, qui laisse
-- croire que le fichier a disparu alors qu'il s'agit d'un simple défaut d'autorisation resté
-- non synchronisé.
--
-- Plutôt que de recopier une CINQUIÈME fois la liste des cas (et de rouvrir le même risque de
-- divergence à la prochaine règle de visibilité ajoutée un jour sur `documents`), cette policy
-- délègue entièrement à `documents` elle-même : un simple `exists (select 1 from documents ...)`,
-- exécuté avec les droits de l'appelant, est automatiquement filtré par TOUTES les policies SELECT
-- de `documents` combinées (RLS s'applique aux sous-requêtes comme aux requêtes de premier
-- niveau) — un seul jeu de règles à maintenir, ici comme sur la table.
drop policy "documents_storage_select" on storage.objects;

create policy "documents_storage_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name
    )
  );
