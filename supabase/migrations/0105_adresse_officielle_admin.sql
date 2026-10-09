-- Adresse officielle de l'administration : `admin@harionlineclub.com` remplace la boîte Gmail
-- `harionlineclub.app@gmail.com` (demande client du 2026-10-09 — « brancher toutes les
-- fonctionnalités et liens liés à harionlineclub.app@gmail.com au nouvel adresse mail officiel de
-- l'admin »).
--
-- Cette adresse n'était en base qu'à un seul endroit, `etablissements.email`, mais cet endroit
-- alimente tout ce qui nomme l'établissement : l'en-tête des factures, reçus, devis et contrats
-- (MentionsEtablissement.tsx), la variable {{etablissement_email}} des modèles de contrat
-- (lib/contrats.ts) et l'écran « Profil HOC », depuis lequel le client peut d'ailleurs la
-- remodifier lui-même à tout moment.
--
-- Condition sur l'ancienne valeur plutôt qu'un update sec : si le client a déjà corrigé l'adresse
-- depuis l'écran « Profil HOC » entre l'écriture et l'application de cette migration, sa saisie
-- doit l'emporter sur ce script.
update public.etablissements
   set email = 'admin@harionlineclub.com'
 where email = 'harionlineclub.app@gmail.com';

-- Mêmes accès que `stephane.rakotonjanahary@outlook.com` (demande explicite du client, même
-- jour). Ce compte avait déjà le rôle `admin_etablissement` ; ce qui lui manquait, c'est la
-- présence dans `platform_admins` (0022) — seule table qui ouvre l'espace « Admin plateforme » et
-- qui, via is_admin_etablissement() (0023), autorise le cumul des trois espaces admin/professeur/
-- étudiant du même établissement.
--
-- À signaler au client, car ce n'est pas un détail d'affichage : un administrateur plateforme peut
-- créer d'autres établissements et inviter leurs administrateurs. C'est bien ce qui était demandé
-- (« les mêmes accès »), pas un effet de bord.
--
-- Lu depuis `profiles` par adresse e-mail, et non avec l'identifiant en dur : une migration doit
-- rester rejouable sur une base repartie de zéro, où cet identifiant serait différent.
insert into public.platform_admins (id, email, nom, prenom)
select p.id, p.email, p.nom, p.prenom
  from public.profiles p
 where p.email = 'admin@harionlineclub.com'
on conflict (id) do nothing;
