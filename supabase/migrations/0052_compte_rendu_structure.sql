-- Compte rendu de séance structuré — demande client du 2026-09-21 : le résumé libre (thèmes +
-- texte) est remplacé par le template complet fourni (objectifs, contenu, vocabulaire, erreurs,
-- points forts/à améliorer, devoirs, progrès, priorités, conseils au prochain professeur).
--
-- `objectifs` en tableau de texte plutôt qu'en colonnes booléennes séparées : la liste
-- (grammar/vocabulary/speaking/listening/reading/writing) est une case à cocher multiple, pas
-- six colonnes à faire évoluer une par une si le client en ajoute une septième plus tard.
alter table public.session_reports
  add column objectifs text[] not null default '{}',
  add column lecons_abordees text,
  add column contenu_cours text,
  add column nouveau_vocabulaire text,
  add column erreurs_importantes text,
  add column points_forts text,
  add column points_a_ameliorer text,
  add column devoirs text,
  add column progres text check (progres in ('important', 'bon', 'modere', 'faible')),
  add column priorites_prochain_cours text,
  add column conseils_prochain_professeur text;

-- Reprise du seul compte rendu existant en production : `themes` couvrait ce que couvre
-- désormais « Leçons abordées », `resume` ce que couvre « Contenu du cours ».
update public.session_reports
  set lecons_abordees = themes, contenu_cours = resume
  where themes is not null or resume is not null;

alter table public.session_reports
  drop column themes,
  drop column resume;
