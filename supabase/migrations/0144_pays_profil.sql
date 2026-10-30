-- Pays dans les informations personnelles d'un étudiant ou d'un professeur.
--
-- Demande client du 2026-10-30 : « dans les informations personnelles des étudiants et
-- professeurs, rajoute la zone "Pays" ». Jusqu'ici seules `adresse` et `ville` existaient
-- (le lieu de naissance a été retiré le 2026-09-29, jugé non pertinent) — aucune des deux ne
-- donne le pays de résidence, utile pour une audience internationale (cours en visio).
--
-- Nullable, comme `adresse`/`ville` : un dossier existant reste valide sans cette information,
-- à compléter à l'écran quand elle est connue.
alter table public.profiles
  add column pays text;
