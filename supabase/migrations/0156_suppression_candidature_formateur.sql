-- Supprimer un candidat formateur à n'importe quelle étape du recrutement — demande client du
-- 2026-10-31 : « rajoute la possibilité de supprimer le candidat professeur à chaque étape du
-- processus, si ce n'est pas déjà fait ». Ce ne l'était pas : une candidature entrée dans le
-- processus ne pouvait qu'avancer ou être refusée, jamais disparaître — un doublon, un envoi de
-- test ou une candidature déposée par erreur restait à l'écran pour toujours.
--
-- Soft-delete et non `delete`, comme partout ailleurs chez HOC pour une ligne qui a une histoire
-- (0049 pour les paiements, 0127 pour les prospects) : un recrutement se raconte — qui a écarté
-- qui, quand, et pourquoi. La ligne sort des listes et des compteurs, elle ne s'évapore pas.
-- C'est aussi ce qui permet de ne PAS casser la clé étrangère `professeur_id` d'un candidat déjà
-- intégré, dont le profil et les contrats, eux, restent bien là.
alter table public.candidatures_formateurs
  add column supprime_le timestamptz,
  add column supprime_par uuid references public.profiles(id),
  add column motif_suppression text;

comment on column public.candidatures_formateurs.supprime_le is
  'Retrait de la candidature du recrutement (0156). Non nul = la ligne sort des listes, des '
  'onglets et des compteurs, à toutes les étapes. Ne supprime ni le profil professeur lié ni '
  'ses contrats : supprimer la PERSONNE est un autre geste (api/admin/supprimer-utilisateur.ts).';

-- L'index ne porte que sur les candidatures vivantes : c'est la seule population que les écrans
-- interrogent, et elle reste petite même quand l'historique grossit.
create index candidatures_formateurs_actives
  on public.candidatures_formateurs (etablissement_id, statut)
  where supprime_le is null;
