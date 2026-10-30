-- Confirmation manuelle qu'un dossier étudiant est complet, après vérification de l'admin.
--
-- Demande client du 2026-10-30 : « rajoute un bouton "Complet ?" à côté de modifié. Quand
-- l'utilisateur clique dessus, cela voudra dire que le dossier est complet après vérification,
-- donc l'étiquette "Dossier incomplet" doit disparaître ». Jusqu'ici, `informationsPersonnellesCompletes`
-- (InformationsPersonnelles.tsx) se basait SEULEMENT sur téléphone + adresse + ville tous les
-- trois renseignés — aucun moyen pour l'admin de dire « j'ai vérifié, c'est bon » quand, par
-- exemple, un de ces champs restera volontairement vide pour cet élève précis.
--
-- `not null default false` : chaque dossier existant repart non confirmé, sans rien changer à
-- l'affichage actuel (le badge continue de dépendre des trois champs tant que personne n'a cliqué
-- le bouton).
alter table public.profiles
  add column dossier_complet_confirme boolean not null default false;
