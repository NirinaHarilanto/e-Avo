-- « A1 » au lieu de « A1 (débutant) » — demande client du 2026-10-11 : « pour les cours
-- collectifs, remplace tous les "A1 (débutant)" par "A1" dans toute l'application ».
--
-- Le même jour, un premier correctif n'avait raccourci que l'AFFICHAGE (libelleNiveauCecrl),
-- en laissant la valeur stockée inchangée. Le client demande cette fois le libellé lui-même :
-- la valeur change donc en base comme en code, et la fonction d'affichage disparaît — elle
-- n'aurait plus rien à traduire, et deux écritures d'un même niveau finissent toujours par
-- diverger quelque part.
--
-- Deux catégories de colonnes, traitées différemment :
--
--   1. Celles qui PORTENT le niveau (niveau_evalue, niveau_estime, niveau_final). Remplacement
--      exact : c'est la valeur comparée par categorieDepuisNiveauEstime() pour décider de la
--      classe et du montant des frais d'inscription. Les laisser à l'ancien libellé, maintenant
--      que le code écrit « A1 », ferait cohabiter deux orthographes d'un même niveau.
--   2. Celles qui le CITENT dans une phrase générée par l'application (bilan du quiz, notes de
--      l'appel diagnostic, message de notification). Remplacement de la sous-chaîne, pour que ces
--      textes ne continuent pas d'afficher une mention que plus rien n'emploie ailleurs. Ce sont
--      des textes produits par l'application, jamais saisis par quelqu'un : les réécrire ne
--      réécrit l'intention de personne.
--
-- Rien d'autre n'est touché. En particulier, aucune ligne de paiement, de facture ni de reçu ne
-- mentionne le niveau : ces documents-là restent figés, comme toujours sur ce projet.

update public.diagnostic_calls
   set niveau_evalue = 'A1'
 where niveau_evalue = 'A1 (débutant)';

update public.test_positionnement_inscriptions
   set niveau_estime = 'A1'
 where niveau_estime = 'A1 (débutant)';

update public.test_positionnement_inscriptions
   set niveau_final = 'A1'
 where niveau_final = 'A1 (débutant)';

update public.test_positionnement_inscriptions
   set bilan = replace(bilan, 'A1 (débutant)', 'A1')
 where bilan like '%A1 (débutant)%';

update public.diagnostic_calls
   set notes = replace(notes, 'A1 (débutant)', 'A1')
 where notes like '%A1 (débutant)%';

update public.notifications
   set message = replace(message, 'A1 (débutant)', 'A1')
 where message like '%A1 (débutant)%';
