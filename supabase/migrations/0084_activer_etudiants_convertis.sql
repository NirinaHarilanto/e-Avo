-- Régularisation des étudiants convertis depuis un prospect (bug constaté le 2026-09-29) :
-- api/admin/convert-prospect.ts ne passait pas le compte en 'approved', contrairement à
-- l'invitation directe (inviter-etudiant.ts). Ces étudiants restaient « En attente d'activation »
-- — refusés par l'agenda étudiant (api/etudiant/mon-rendez-vous.ts) et exposés à la suppression
-- par l'auto-nettoyage des invitations jamais activées (api/_lib/creerCompte.ts). Corrigé à la
-- source ; cette migration aligne les comptes déjà créés.
update public.profiles
set status = 'approved'
where role = 'etudiant'
  and status = 'pending'
  and prospect_id is not null;
