-- Expose le CIN de la directrice aux membres AUTHENTIFIÉS de l'établissement (jamais à un
-- visiteur anonyme) — demande client du 2026-10-05 : « rajoute son CIN également sur les
-- factures, devis et reçus ». Ces documents sont consultés par l'élève ou le professeur
-- concerné, pas seulement par l'admin qui les émet : `etablissement_identite_privee` (0097),
-- elle, reste strictement réservée à l'admin pour la GESTION (lecture/écriture du Profil HOC) —
-- cette vue est une fenêtre supplémentaire, en lecture seule, ouverte uniquement sur ce qui doit
-- apparaître sur un document, sans donner pour autant à l'élève/au professeur un accès à la
-- table elle-même.
--
-- Même patron que `google_integration_statut` (0041) et `annuaire_etablissement` (0090) : SANS
-- `security_invoker`, pour s'exécuter avec les droits du propriétaire et contourner ainsi la RLS
-- fermée de la table sous-jacente — c'est la clause WHERE, avec `current_etablissement_id()`, qui
-- porte seule la sécurité. Un visiteur anonyme de la page vitrine n'a pas de ligne `profiles` :
-- `current_etablissement_id()` lui renvoie NULL, et NULL n'est jamais égal à rien — il n'a donc
-- accès à aucune ligne ici, sans qu'il soit besoin de l'exclure explicitement.
create view public.etablissement_cin_directrice as
select eip.etablissement_id, eip.cin_directrice
from public.etablissement_identite_privee eip
where eip.etablissement_id = public.current_etablissement_id();

grant select on public.etablissement_cin_directrice to authenticated;
