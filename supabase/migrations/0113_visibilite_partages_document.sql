-- Qui a déjà la vue d'un document, visible de quiconque peut voir ce document — demande client du
-- 2026-10-10, sur deux écrans distincts qui posent exactement la même question :
--   1. Avant de PARTAGER (PartagerDocumentModale) : « n'exclus plus personne des suggestions ;
--      après validation, partage uniquement aux personnes qui ne l'ont pas encore, et affiche un
--      pop-up listant qui avait déjà accès et qui vient de l'obtenir. »
--   2. Avant de SUPPRIMER, pour le propriétaire (DetailDocumentModale) : « affiche dans un pop-up
--      les personnes qui partagent la vue sur ce document. »
--
-- CE QUI MANQUAIT. Les policies de lecture de `document_partages` (0059, resserrées en 0111) ne
-- couvrent chacune qu'une ligne À LA FOIS : celle que j'ai moi-même émise
-- (`document_partages_emetteur_all`), ou celle dont je suis destinataire
-- (`document_partages_destinataire_select`). Aucune ne donne la VUE D'ENSEMBLE — par exemple, un
-- admin qui partage le document d'un étudiant à un professeur reste aujourd'hui invisible à
-- l'étudiant propriétaire : il croirait son document partagé avec personne, et le sharer d'un
-- document qu'il ne gère pas lui-même ne peut pas savoir qui l'a déjà reçu.
--
-- Même condition que le droit de PARTAGER (0111) : voir le document suffit. Ce n'est pas une fuite
-- nouvelle — qui peut déjà re-partager un document à qui bon lui semble n'apprend rien de plus en
-- voyant la liste de ceux qui l'ont déjà ; c'est l'information qui rend ce droit de partage réparti
-- utilisable sans créer de doublons à l'aveugle.
create policy "document_partages_lecteur_select"
  on public.document_partages for select
  to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id));
