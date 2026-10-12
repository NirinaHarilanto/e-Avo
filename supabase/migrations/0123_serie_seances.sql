-- Notion de « série » pour les séances de cours créées ensemble — demande client du 2026-10-12 :
-- « il faut lui demander si cela concerne uniquement le rendez-vous ou la série de rendez-vous »,
-- applicable aux DEUX façons de créer de la récurrence (Planning prévisionnel, et désormais
-- l'agenda lui-même).
--
-- Un événement de l'agenda Google (rendez-vous « autre ») porte déjà sa récurrence côté Google
-- (recurringEventId), lu en direct par FicheEvenementGoogle.tsx — rien à stocker ici pour ce
-- cas-là. Une séance de cours, elle, est une ligne `sessions` HOC-native, indépendante de toute
-- notion Google : il n'existe aujourd'hui AUCUN lien entre les N séances qu'un même lot crée
-- (Planning prévisionnel comme la nouvelle création récurrente depuis l'agenda), chacune
-- totalement autonome. `serie_id` comble ce manque : un même identifiant, partagé par toutes les
-- séances nées du même geste de planification, qui n'existe QUE pour ce besoin — aucune autre
-- table ne le référence, il ne sert qu'à retrouver « les autres séances de cette série » au
-- moment de modifier ou d'annuler une occurrence.
alter table public.sessions
  add column if not exists serie_id uuid;

comment on column public.sessions.serie_id is
  'Identifiant partagé par toutes les séances créées dans le même lot (Planning prévisionnel ou '
  'récurrence créée depuis l''agenda) — null pour une séance isolée. Sert uniquement à proposer '
  '« cette séance » / « toute la série » lors d''une modification ou annulation.';

create index if not exists idx_sessions_serie on public.sessions (serie_id) where serie_id is not null;
