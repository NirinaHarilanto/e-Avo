-- Forme juridique de l'établissement (0101, demande client du 2026-10-07) : dernier champ
-- manquant au Profil HOC pour que les modèles de contrat n'aient plus aucune mention
-- administrative figée en dur — « [forme juridique à compléter] » dans les deux modèles de
-- contrat (voir api/.. pas de fonction serveur ici, juste la colonne). Même colonne publique
-- que le reste du Profil HOC (0097) : une forme juridique n'a rien de confidentiel, elle figure
-- sur n'importe quel document commercial public.
alter table public.etablissements
  add column forme_juridique text;

-- Valeur réelle communiquée par le client le 2026-10-07 : Entreprise Individuelle.
update public.etablissements
set forme_juridique = 'Entreprise Individuelle'
where slug = 'hari-online-course';
