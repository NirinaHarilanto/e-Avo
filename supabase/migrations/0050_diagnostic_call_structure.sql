-- Compte rendu structuré de l'appel diagnostic — demande client du 2026-09-21 (point 6).
-- L'interviewer remplissait jusqu'ici trois champs libres (niveau, rythme, notes) ; le client
-- fournit désormais un questionnaire complet à dérouler pendant l'appel (situation, objectifs,
-- niveau, disponibilités, notes internes).
--
-- Le questionnaire est stocké en jsonb plutôt qu'en colonnes : il est destiné à évoluer au fil
-- des retours terrain, et chaque ajout de question demanderait sinon une migration. Les trois
-- champs existants restent la source de vérité pour ce qui est lu ailleurs dans
-- l'application (niveau affiché sur la fiche prospect, rythme repris à la conversion) — le
-- jsonb ne les double pas, le formulaire les alimente directement.
alter table public.diagnostic_calls
  add column reponses jsonb not null default '{}'::jsonb;

comment on column public.diagnostic_calls.reponses is
  'Réponses au questionnaire de diagnostic (voir src/lib/diagnostic.ts pour la structure des champs).';

-- Un étudiant issu d'un prospect doit pouvoir être relié à son diagnostic sans re-scanner la
-- table : `profiles.prospect_id` existe depuis 0002, mais rien n'indexait le chemin inverse.
create index if not exists diagnostic_calls_prospect on public.diagnostic_calls (prospect_id);
