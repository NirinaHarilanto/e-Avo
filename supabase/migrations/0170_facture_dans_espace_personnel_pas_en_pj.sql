-- Le modèle 2.3 ment sur la façon dont l'élève reçoit sa facture — demande client du 2026-11-24.
--
-- Son corps promet « vous trouverez votre facture en pièce jointe ». Or ce modèle est envoyé
-- AUTOMATIQUEMENT par le cron `relances-echeances.ts` (`annoncerRecus`) sans joindre aucun
-- fichier : la facture vit dans l'espace personnel de l'élève (`/mon-espace/paiements`), jamais en
-- pièce jointe d'un e-mail. Seul l'envoi manuel depuis Gmail (`UtiliserTemplateModale.tsx`)
-- pouvait littéralement joindre un fichier, et seulement si l'admin le faisait elle-même.
--
-- Deux corrections, toutes deux sur le modèle 2.3 uniquement :
--
-- 1. Le corps renvoie désormais vers l'espace personnel, pas vers une pièce jointe — et la
--    signature perd le prénom au profit du seul nom de la maison, comme demandé.
-- 2. `piece_jointe_attendue` ('La facture') n'a plus de sens une fois cette promesse retirée du
--    corps : il affichait un badge « Pièce jointe : La facture » dans l'écran Templates emails et
--    invitait l'admin à joindre le PDF à la main dans Gmail — exactement le geste qui n'est plus
--    nécessaire. Le laisser aurait recréé la même confusion sous une autre forme.
update public.email_templates
set corps = $txt$Bonjour {{prenom}},

Nous avons bien reçu votre paiement de {{montant}}, merci ! Vous trouverez votre facture dans votre espace personnel sur la plateforme en ligne Hari Online Club (HOC).

Prochaine étape : nous organisons votre premier cours avec votre formateur. Vous recevrez très vite un email de bienvenue avec toutes les informations pratiques dans votre espace personnel.

Bien cordialement,

Hari Online Club$txt$,
    piece_jointe_attendue = null
where reference = '2.3';
