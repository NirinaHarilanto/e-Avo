-- Demande client du 2026-10-19 : « quand la relance est lancée à partir du bouton, alors le
-- diagnostic call est supposé être fait. Il ne reste plus que le paiement du cours pour que la
-- personne puisse passer à l'état étudiant. Dans la relance, il faut alors féliciter la personne
-- d'être arrivée à ce stade et l'inviter à payer les frais de cours pour commencer son parcours.
-- Cela est valable pour les cours individuel et DUO. [...] Pour les cours collectifs, il faudrait
-- également rajouter un bouton de relance de paiement [...] Rattacher un historique de relance
-- également. »
--
-- La relance « 1.2 » (0091) s'adresse à un prospect qui n'a encore RIEN tranché : elle lui
-- explique les deux chemins possibles et l'invite à choisir. Elle ne convient plus une fois le
-- forfait choisi — à ce stade, il ne reste que le règlement, et le message doit le dire. D'où un
-- quatrième motif de relance et un modèle qui lui est propre, modifiable depuis « Template
-- e-mails » comme tous les autres.

begin;

-- ──────────────────── 1. Quatrième motif de relance ────────────────────
-- La migration 0130 l'avait prévu : « le jour où un quatrième motif arrive, il n'y a qu'une
-- valeur à ajouter à la contrainte ».
alter table public.relances drop constraint if exists relances_motif_check;
alter table public.relances
  add constraint relances_motif_check
  check (motif in ('forfait_a_choisir', 'absence_diagnostic', 'reprise_apres_pause', 'paiement_a_regler'));

comment on column public.relances.motif is
  'Motif de la relance (0130, étendu en 0133) : forfait_a_choisir (rien n''est encore tranché), '
  'absence_diagnostic (ne s''est pas présenté), reprise_apres_pause (parcours en pause), '
  'paiement_a_regler (tout est tranché, il ne manque que le règlement pour devenir étudiant).';

-- ──────────────────── 2. Modèle d'e-mail « 1.4 » ────────────────────
-- Rejoint la catégorie Prospect, juste après « 1.3 » (ordre 13 en 0130).
--
-- Le ton suit la demande : d'abord féliciter d'être arrivé jusque-là, ensuite inviter à régler.
-- Les variables sont celles que la route sait remplir (api/admin/relancer-prospect.ts) ; une
-- ligne dont la variable reste vide disparaît d'elle-même (voir preparerEmail), ce qui permet au
-- même modèle de servir un cours individuel, un DUO et un cours collectif — seul le libellé du
-- forfait change, et le collectif n'a pas de montant par heure mais des frais d'inscription.
insert into public.email_templates (etablissement_id, reference, categorie, nom, objet, corps, quand, piece_jointe_attendue, ordre)
select e.id, t.reference, t.categorie, t.nom, t.objet, t.corps, t.quand, t.piece_jointe, t.ordre
from public.etablissements e
cross join (values

('1.4', '1. Prospect', 'Relance du règlement avant le démarrage',
 'Félicitations {{prenom}} – il ne reste qu''une étape avant vos cours',
 $txt$Bonjour {{prenom}},

Félicitations : votre parcours chez Hari Online Club est prêt à démarrer.

Votre appel diagnostic est passé, votre niveau est établi et la formule qui vous correspond est retenue. C'est l'étape la plus exigeante, et elle est derrière vous.

VOTRE FORMULE
{{formule_choisie}}
{{montant_a_regler}}

IL NE RESTE QU'UNE ÉTAPE
Le règlement des frais de cours nous permet de réserver votre place, de vous attribuer votre formateur et de planifier vos premières séances. Dès qu'il nous parvient, votre compte d'étudiant est ouvert et votre parcours commence.

Vous pouvez régler par Mvola, Orange Money ou en espèces à nos bureaux. Répondez simplement à ce message et nous vous indiquons la marche à suivre, ou appelez-nous : nous réglons cela en quelques minutes.

Si vous avez la moindre question avant de vous engager, c'est le bon moment pour nous la poser — nous y répondons avec plaisir.

Au plaisir de vous compter parmi nos étudiants,

Koloina
Hari Online Club$txt$,
 'Quand le prospect a passé son diagnostic et choisi sa formule, mais n''a pas encore réglé. Vaut pour l''individuel, le DUO et le cours collectif. Peut être renvoyé autant de fois que nécessaire : chaque envoi est tracé dans l''historique des relances de sa fiche.', null::text, 14)

) as t(reference, categorie, nom, objet, corps, quand, piece_jointe, ordre)
-- Sans effet si le modèle est déjà là : cette migration est appliquée à la main depuis l'éditeur
-- SQL du dashboard, et une exécution relancée par prudence ne doit pas buter sur
-- `email_templates_reference_unique` (0091).
on conflict (etablissement_id, reference) where reference is not null do nothing;

commit;
