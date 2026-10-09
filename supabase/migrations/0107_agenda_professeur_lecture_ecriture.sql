-- L'agenda Google personnel d'un professeur devient la SOURCE des réunions de ses cours.
--
-- Demande client du 2026-10-09, qui renverse la règle posée en 0098 (« rien ne part de HOC vers
-- Google » pour cette intégration) et celle de 0040 (un seul compte, celui de l'établissement,
-- crée toutes les réunions) :
--   « Chaque professeur doit avoir son propre compte google gmail. Chaque professeur doit
--     synchroniser son agenda gmail avec son agenda de l'application HOC : mode écriture et read,
--     avec une synchronisation instantanée et complète. Quand un professeur veut organiser une
--     séance de cours [...] l'invitation et la génération de lien se fera à partir de son compte
--     personnel professeur. Par défaut, l'admin n'est pas censé recevoir automatiquement et
--     systématiquement d'invitation [...] sauf si l'initiateur a invité manuellement [...] l'admin
--     dans sa liste de participants. [...] Quand l'admin planifie les cours d'un étudiant et
--     professeur depuis l'espace admin, les invitations devraient être initiés à partir du compte
--     gmail du professeur. »
--
-- Rien à migrer dans les données : la table `google_integrations_personnelles` (0098) convient
-- telle quelle, c'est le SCOPE demandé à Google qui change (`calendar.readonly` →
-- `calendar.events`, voir SCOPE_GOOGLE_PERSONNEL dans api/_lib/google.ts). Les comptes déjà
-- connectés gardent donc leur jeton en lecture seule jusqu'à leur prochaine reconnexion — d'où
-- l'intérêt d'exposer `scope` aux écrans, ci-dessous : c'est la seule façon de distinguer un
-- professeur qui peut créer ses réunions d'un professeur qui doit reconnecter son compte.

comment on column public.google_integrations_personnelles.scope is
  'Permissions réellement accordées par Google (ce que l''utilisateur a COCHÉ, pas ce qui a été demandé). Depuis le 2026-10-09, calendar.events est attendu : l''agenda personnel d''un professeur reçoit les séances qu''il planifie dans HOC, et c''est son compte qui invite les élèves. Une valeur sans calendar.events = compte connecté avant ce changement, encore en lecture seule.';

-- Vue de statut personnelle, recréée pour porter `scope` — même raison qu'en 0106 pour
-- l'établissement : sans lui, l'écran ne peut pas dire si l'intégration sait écrire, et un
-- professeur resté en lecture seule croit son agenda complet alors que ses réunions continuent
-- de partir du compte de l'établissement. Aucun secret ajouté : des URL de permissions Google,
-- jamais le jeton de rafraîchissement.
--
-- Toujours SANS `security_invoker` (0098, 0041) : la table a RLS active et aucune policy cliente,
-- c'est la clause WHERE qui porte la sécurité — `profile_id = auth.uid()` restreint au seul
-- compte connecté, quel que soit son rôle.
drop view if exists public.google_integration_personnelle_statut;

create view public.google_integration_personnelle_statut as
select
  gip.google_email,
  gip.connecte_le,
  gip.derniere_erreur,
  gip.scope
from public.google_integrations_personnelles gip
where gip.profile_id = auth.uid();

grant select on public.google_integration_personnelle_statut to authenticated;

-- Suivi, pour l'administration, de QUI a connecté son agenda Google.
--
-- Nécessaire à l'exigence « chaque professeur doit avoir son propre compte google gmail » : sans
-- cette vue, l'admin n'a aucun moyen de voir quels professeurs manquent à l'appel, alors que c'est
-- lui qui doit les relancer — et un professeur sans compte connecté voit ses réunions créées par
-- le compte de l'établissement (repli de `integrationHoteDeSeance`), donc l'écart est invisible à
-- l'usage.
--
-- N'expose QUE l'état de la connexion, jamais le contenu de l'agenda : l'admin apprend qu'un
-- professeur a branché telle adresse Gmail le tel jour, pas ce qu'elle contient. Le jeton reste
-- hors de la vue, comme partout ailleurs.
--
-- Restreinte aux professeurs de SON établissement, et aux seuls admins (`is_admin_etablissement()`,
-- qui couvre aussi les admins de plateforme depuis 0023) : un professeur n'a rien à savoir des
-- connexions de ses collègues.
create view public.google_agendas_professeurs_statut as
select
  p.id as profile_id,
  p.prenom,
  p.nom,
  p.email,
  gip.google_email,
  gip.connecte_le,
  gip.derniere_erreur,
  gip.scope
from public.profiles p
left join public.google_integrations_personnelles gip on gip.profile_id = p.id
where p.role = 'professeur'
  and p.etablissement_id = public.current_etablissement_id()
  and public.is_admin_etablissement();

grant select on public.google_agendas_professeurs_statut to authenticated;
