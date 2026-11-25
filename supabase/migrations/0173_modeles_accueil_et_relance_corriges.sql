-- Corrections des modèles 5.3, 3.1 et 3.4 — relecture du client, le 2026-11-25.
--
-- Le client a annoté le document d'inventaire des envois automatiques. Trois modèles changent ici.
-- Au-delà de ses demandes, la relecture a mis au jour des PROMESSES NON TENUES : plusieurs lignes
-- annoncent un contenu qu'aucune variable n'alimente. Quand une variable manque, le moteur de
-- substitution la remplace par du vide et n'efface la ligne que si elle finit par « : » ou
-- commence une liste. Résultat : des titres restaient seuls et des phrases renvoyaient à rien.
--
-- ── 5.3 « Fin du volume d'heures » ─────────────────────────────────────────────────────────────
-- Demande du client : inviter à en parler au professeur ou à l'administration, et signer de
-- l'adresse de la maison plutôt que d'un prénom.
--
-- Correction supplémentaire, indispensable : la phrase « Vous avez fait de beaux progrès,
-- notamment {{point_fort}}. » Cette variable n'est alimentée NULLE PART — ni par le cron qui
-- envoie ce modèle (il ne fournit que prénom, heures restantes et formateur), ni par aucune
-- constante d'établissement. Les élèves recevaient donc, littéralement :
--     « Vous avez fait de beaux progrès, notamment . »
-- La proposition est donc retirée. Un vrai point fort serait possible — les professeurs
-- renseignent `points_forts` dans leurs comptes rendus de séance (0052) — mais cela demande de
-- relier les deux, ce qui dépasse une correction de texte.
--
-- ── 3.1 « Bienvenue, cours individuel » ────────────────────────────────────────────────────────
-- Demande du client : supprimer le bloc « PLANNING DE LA PREMIÈRE SEMAINE ». Elle corrige un
-- vrai défaut : `{{planning_semaine_1}}` n'est pas fournie non plus, la ligne disparaissait, et
-- il restait le titre suivi de « Nous pouvons partir sur ces dates » — sans la moindre date.
--
-- ── 3.4 « Bienvenue, cours collectif » ─────────────────────────────────────────────────────────
-- Demande du client : supprimer le bloc « GROUPE WHATSAPP ». Même défaut : `{{lien_whatsapp}}`
-- n'étant pas fournie, le titre restait seul.
--
-- Le client demandait aussi si le lien Jitsi était « unique pour toutes les classes », redoutant
-- que deux classes se retrouvent dans la même salle. Vérification faite sur les 63 séances
-- collectives de production : CHAQUE SÉANCE a sa propre salle, tirée au hasard à sa création, et
-- aucune n'est partagée entre deux classes. Le risque redouté n'existe pas. En revanche la phrase
-- du modèle était fausse dans l'autre sens — il n'y a pas « un lien unique » pour la vague — et
-- `{{lien_jitsi}}` n'étant alimentée par rien, la ligne disparaissait à l'envoi, laissant
-- « Enregistrez-le et testez-le » sans rien à enregistrer. Le texte dit désormais la vérité :
-- le lien de chaque séance arrive par son invitation Google Agenda.
--
-- Les signatures passent de « Anaël » à l'adresse de l'administration, et les « contactez-moi »
-- deviennent « contactez-nous » : le message ne vient plus d'une personne nommée.
begin;

update public.email_templates
set corps = $txt$Bonjour {{prenom}},

Votre formation touche bientôt à sa fin : il vous reste {{heures_restantes}} heures avec {{nom_formateur}}.

Vous avez fait de beaux progrès. Pour ne pas perdre cet élan, vous pouvez dès maintenant prolonger votre formation avec un nouveau volume d'heures, avec le même formateur et sans interruption. Pour ce faire, n'hésitez pas à en parler avec votre professeur ou à contacter l'administration de HOC.

Bien cordialement,

admin@harionlineclub.com
Hari Online Club$txt$
where reference = '5.3';

update public.email_templates
set corps = $txt$Bonjour {{prenom}},

Bienvenue chez Hari Online Club ! Voici toutes les informations pour bien démarrer votre formation.

VOTRE FORMATION
- Formateur/Formatrice : {{nom_formateur}}
- Email : {{email_formateur}}
- Volume d'heures : {{volume_heures}} h

VOS ACCÈS
- Dossier Drive (leçons et exercices) : {{lien_drive}} – pensez à l'enregistrer
- Feuille d'émargement : {{lien_emargement}}
- Les cours ont lieu sur Google Meet. Votre formateur vous enverra une invitation Google Calendar pour chaque séance : acceptez-la pour confirmer votre présence.

À RETENIR
- Réservez vos cours au moins 2 jours à l'avance.
- Pour annuler, prévenez au moins 1 jour avant. Passé ce délai, le cours est considéré comme fait.
- Sans nouvelles de votre part 15 minutes après le début du cours, celui-ci est annulé et considéré comme fait.
- Pour toute question (planning, report, souci technique), écrivez-nous à admin@harionlineclub.com.

Nous vous souhaitons un excellent premier cours avec {{nom_formateur}} le {{date_debut_formation}} à {{heure_premier_cours}} !

Bien cordialement,

admin@harionlineclub.com
Hari Online Club$txt$
where reference = '3.1';

update public.email_templates
set corps = $txt$Bonjour {{prenom}},

Bienvenue chez Hari Online Club ! Voici toutes les informations pour bien démarrer votre formation.

VOTRE CLASSE
- Niveau : {{niveau}}
- Créneau : {{creneau}}
- Formateur/Formatrice : {{nom_formateur}}

CALENDRIER DE LA VAGUE
- 32 sessions, du {{date_debut_vague}} au {{date_fin_vague}}
- Les lundis, mardis, jeudis et vendredis (pas de cours le mercredi)
- Première session : {{premiere_session}}
- Évaluation finale : le dernier jour de la vague, le {{date_evaluation_finale}}. Elle détermine votre passage au niveau supérieur.

LIEN DE CONNEXION
Toutes les sessions ont lieu en visioconférence sur Jitsi Meet. Chaque séance a son propre lien, que vous recevez dans son invitation Google Agenda : acceptez l'invitation, et testez votre micro et votre caméra avant la première session.

VOS SUPPORTS
Accès aux supports : {{lien_supports}}
- Grammaire : mini-leçons et exercices en libre accès, à votre rythme.
- Listening : 2 audios par semaine, indiqués et corrigés par votre formateur.
- Reading : 1 texte par semaine, indiqué par votre formateur.
- Writing : 4 devoirs à rendre avant la fin du niveau, indiqués par votre formateur.

À l'exception du Listening, envoyez vos devoirs à admin@harionlineclub.com et manda@harionlineclub.com. Notre équipe pédagogique les corrigera et vous fera un retour.

BON À SAVOIR
- Rien n'est obligatoire : ces supports sont là pour vous aider à progresser.
- Les sessions en ligne sont toujours pratiques : c'est le moment de mettre en pratique ce que vous avez travaillé.
- Pour toute question (planning, absence, souci technique), écrivez-nous à admin@harionlineclub.com.

Nous avons hâte de vous retrouver le {{date_debut_vague}} !

Bien cordialement,

admin@harionlineclub.com
Hari Online Club$txt$
where reference = '3.4';

commit;
