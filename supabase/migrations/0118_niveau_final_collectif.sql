-- Niveau d'anglais FINAL d'un candidat au collectif, arrêté par l'admin à l'issue du test oral —
-- demande client du 2026-10-11 : le suivi doit montrer côte à côte « quel niveau d'anglais via le
-- test de positionnement, quel niveau d'anglais final attribué par l'admin ».
--
-- Jusqu'ici ce niveau n'existait QUE dans `diagnostic_calls.niveau_evalue`, saisi en texte libre
-- au moment de la conversion, mêlé aux appels diagnostiques des parcours individuels et sans lien
-- direct avec l'inscription au test. Deux conséquences : impossible de l'afficher dans un suivi
-- sans aller le repêcher dans le dernier appel du prospect, et surtout il n'était JAMAIS relu —
-- la classe de l'élève se déduisait du quiz écrit (`niveau_estime`), pourtant explicitement
-- présenté au candidat comme indicatif (« le niveau définitif est fixé à l'issue du test oral »).
-- Un admin qui corrigeait le niveau à l'oral voyait sa correction ignorée.
--
-- Colonne posée ici, à côté du niveau estimé, parce que les deux se lisent toujours ensemble et
-- qu'ils portent sur le même événement : la candidature de cette personne à cette session.
-- `diagnostic_calls` continue de recevoir le compte rendu de l'oral, inchangé — c'est la trace
-- pédagogique, pas la donnée de pilotage.
alter table public.test_positionnement_inscriptions
  add column if not exists niveau_final text;

comment on column public.test_positionnement_inscriptions.niveau_estime is
  'Niveau CECRL calculé automatiquement à partir du score du quiz ÉCRIT (quiz.ts). Indicatif : annoncé comme tel au candidat.';

comment on column public.test_positionnement_inscriptions.niveau_final is
  'Niveau CECRL arrêté par l''admin à l''issue du test ORAL (0118). Fait foi : c''est lui qui détermine la classe de niveau et le montant des frais d''inscription. Null tant que l''oral n''a pas eu lieu — on retombe alors sur niveau_estime.';

-- Rattrapage des candidats déjà convertis : leur niveau final a bien été saisi, mais il n'existe
-- que dans `diagnostic_calls`. On le récupère depuis le compte rendu du test oral — reconnaissable
-- à ce qu'il porte un `niveau_evalue` ET qu'il n'est pas le compte rendu automatique du quiz
-- écrit (celui-là commence toujours par « Test de positionnement écrit : », voir quiz.ts).
-- Sans ce rattrapage, le suivi afficherait « niveau final : — » pour tout l'historique.
update public.test_positionnement_inscriptions i
set niveau_final = d.niveau_evalue
from (
  select distinct on (prospect_id) prospect_id, niveau_evalue
  from public.diagnostic_calls
  where niveau_evalue is not null
    and coalesce(notes, '') not like 'Test de positionnement écrit :%'
  order by prospect_id, date_appel desc
) d
where d.prospect_id = i.prospect_id
  and i.niveau_final is null;
