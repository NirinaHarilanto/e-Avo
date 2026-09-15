-- Tous les comptes de la plateforme sont créés via `creerCompteSansEmail` (api/_lib/creerCompte.ts),
-- c'est-à-dire sans mot de passe choisi par l'utilisateur : Supabase en génère un aléatoire que
-- personne ne connaît. Cette colonne distingue un compte dont l'utilisateur a déjà défini son
-- propre mot de passe (via le lien de réinitialisation envoyé par Resend) d'un compte encore
-- « neuf », pour piloter l'écran de connexion : e-mail reconnu + mot de passe jamais défini =>
-- on incite à la réinitialisation plutôt que d'afficher un champ mot de passe inutilisable.
--
-- Colonne volontairement hors de la liste verrouillée par `empecher_promotion_profil` (0015) :
-- elle ne confère aucun privilège, contrairement à role/etablissement_id/status.
alter table public.profiles
  add column mot_de_passe_defini boolean not null default false;
