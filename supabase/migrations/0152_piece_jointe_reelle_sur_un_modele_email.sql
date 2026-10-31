-- Une vraie pièce jointe attachée à un modèle d'e-mail — demande client du 2026-10-31 : « est-il
-- possible d'attacher le document "Hari Online Course - procédure" au mail automatique ? Le
-- document sera sous forme de pièce jointe dans le mail. Si c'est possible alors fais les
-- modifications nécessaires. »
--
-- C'était possible à moitié seulement. `email_templates.piece_jointe_attendue` (0091) n'est qu'un
-- LIBELLÉ : il rappelle à l'administration ce qu'elle doit joindre elle-même, et le modèle 2.1
-- annonce depuis le début « la procédure en pièce jointe » sans que rien ne l'attache. Le corps
-- promettait donc un document que le message ne portait pas.
--
-- Pourquoi un document de la bibliothèque et pas un fichier embarqué dans le code : le client doit
-- pouvoir remplacer sa procédure sans déploiement. Elle vit donc dans Documents › Partageables
-- (`documents.etablissement_wide`, 0033), d'où l'administration la remplace quand elle change, et
-- le modèle n'en garde qu'une référence.
--
-- `on delete set null` : supprimer le document ne doit pas emporter le modèle d'e-mail. Le message
-- repart alors sans pièce jointe plutôt que de ne pas partir du tout — un envoi silencieusement
-- empêché serait pire qu'un envoi incomplet (même principe que `envoyerEmail`, inerte sans clé
-- Resend).
alter table public.email_templates
  add column piece_jointe_document_id uuid references public.documents(id) on delete set null;

comment on column public.email_templates.piece_jointe_document_id is
  'Document de la bibliothèque commune attaché à chaque envoi de ce modèle (0152). Distinct de '
  '`piece_jointe_attendue`, qui n''est qu''un rappel écrit à l''intention de l''administration.';

-- Rattachement de la procédure au modèle « 2.1 — Inscription et paiement ». Le document est
-- reconnu par son nom dans la bibliothèque de l'établissement : la migration reste rejouable, et
-- ne fait rien là où la procédure n'a pas été déposée.
update public.email_templates t
set piece_jointe_document_id = d.id
from public.documents d
where t.reference = '2.1'
  and t.piece_jointe_document_id is null
  and d.etablissement_id = t.etablissement_id
  and d.etablissement_wide
  and d.nom_original = 'Hari Online Course - procedure.pdf';
