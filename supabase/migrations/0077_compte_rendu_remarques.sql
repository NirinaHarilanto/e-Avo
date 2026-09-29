-- Compte rendu de séance allégé (demande client du 2026-09-29 : « trop de cases à renseigner »).
-- Le formulaire ne garde que : objectif, a été vu (contenu_cours), points à améliorer, progrès,
-- remarques. Seule « remarques » est nouvelle ; les colonnes de l'ancien template (0052) restent
-- en place pour ne rien perdre des comptes rendus déjà rédigés, affichés en lecture seule.
alter table public.session_reports
  add column remarques text;
