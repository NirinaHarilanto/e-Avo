-- Sous-section « Template e-mails » de la section Messages, côté admin uniquement — demande client
-- du 2026-10-01, à partir du document « HOC_Templates_emails_apprenants » (version du 23 septembre
-- 2026) : 22 modèles couvrant le parcours apprenant, de la prospection aux réclamations.
--
-- En base et non en dur dans le code : le client demande explicitement de pouvoir « rajouter la
-- possibilité de créer un nouveau mail », donc les modèles doivent vivre là où l'admin peut les
-- créer et les corriger sans déploiement.
--
-- Les champs [entre crochets] du document deviennent des {{variables}} : c'est la convention déjà
-- en place pour les contrats (0031), avec son moteur de substitution déjà testé
-- (src/lib/contrats.ts, `substituerVariables` / `extraireVariables`). Ce que l'application sait du
-- destinataire se remplit tout seul, le reste reste visible et modifiable dans l'aperçu.

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  /* Numéro du document source (« 1.1 », « 4.6 »…) : c'est la clé qui permet aux envois
     AUTOMATIQUES de retrouver leur modèle sans dépendre d'un nom que l'admin peut renommer
     (voir api/_lib/templatesEmail.ts). Nul pour un modèle créé de toutes pièces par l'admin. */
  reference text,
  categorie text not null,
  nom text not null,
  objet text not null,
  corps text not null,
  /* La ligne « Quand : … » du document — la règle d'usage, affichée sous le nom du modèle. */
  quand text,
  piece_jointe_attendue text,
  ordre integer not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index email_templates_reference_unique
  on public.email_templates (etablissement_id, reference)
  where reference is not null;

alter table public.email_templates enable row level security;

/* Admin de l'établissement seulement, en lecture comme en écriture : la sous-section est côté
   admin uniquement (demande client). Les envois automatiques passent par la clé de service, qui
   ignore la RLS. */
create policy "email_templates_admin_all"
  on public.email_templates for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

/* Les tables précédentes définissaient chacune sa propre fonction d'horodatage
   (`candidatures_formateurs_horodater`, `toucher_session_report`…). Les deux tables de ce fichier
   partagent la même : même comportement, un seul endroit. */
create or replace function public.horodater_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger email_templates_touch
  before update on public.email_templates
  for each row execute function public.horodater_updated_at();

-- Journal des envois, qui sert aussi de tiroir à brouillons (choix client : le bouton
-- « Enregistrer » du pop-up met le mail préparé de côté pour plus tard, sans toucher au modèle).
create table public.email_envois (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  template_id uuid references public.email_templates(id) on delete set null,
  /* Destinataires enregistrés en identifiants de profil ET en e-mails résolus à l'envoi : un
     profil peut changer d'adresse ensuite, le journal doit dire à quelle adresse c'est parti. */
  destinataires_profile_ids uuid[] not null default '{}',
  copies_profile_ids uuid[] not null default '{}',
  destinataires_emails text[] not null default '{}',
  objet text not null,
  corps text not null,
  piece_jointe_nom text,
  piece_jointe_chemin text,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'envoye', 'echec')),
  erreur text,
  envoye_le timestamptz,
  cree_par_profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_envois_etablissement on public.email_envois (etablissement_id, created_at desc);
create index email_envois_statut on public.email_envois (etablissement_id, statut);

alter table public.email_envois enable row level security;

create policy "email_envois_admin_all"
  on public.email_envois for all
  to authenticated
  using (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement())
  with check (etablissement_id = public.current_etablissement_id() and public.is_admin_etablissement());

create trigger email_envois_touch
  before update on public.email_envois
  for each row execute function public.horodater_updated_at();

-- Les 22 modèles du document. `cross join` sur l'établissement principal : l'application est
-- mono-établissement depuis le 2026-09-15 (voir src/lib/etablissement.ts), et un nouvel
-- établissement repartirait de ses propres modèles.
insert into public.email_templates (etablissement_id, reference, categorie, nom, objet, corps, quand, piece_jointe_attendue, ordre)
select e.id, t.reference, t.categorie, t.nom, t.objet, t.corps, t.quand, t.piece_jointe, t.ordre
from public.etablissements e
cross join (values

('1.1', '1. Prospect', 'Mail d''offres avec brochure',
 'Hari Online Club – Nos offres de cours d''anglais',
 $txt$Bonjour {{prenom}},

Merci pour votre intérêt pour Hari Online Club ! Comme promis, vous trouverez en pièce jointe notre brochure avec toutes nos offres et nos tarifs.

En résumé, nous proposons :
- Des cours individuels, entièrement construits sur mesure selon vos objectifs
- Des cours en duo, à suivre avec un collègue, un ami ou votre conjoint
- Des cours collectifs, en petits groupes de 3 à 7 personnes, sur 3 niveaux
- Une préparation aux certifications TOEIC, TOEFL et IELTS

Pour la suite, tout dépend de la formule qui vous intéresse :

COURS INDIVIDUELS OU EN DUO
Réservez votre diagnostic call ici : {{lien_reservation}}
Pendant cet appel, nous analysons vos besoins et évaluons votre niveau pour vous proposer le parcours le plus adapté.

COURS COLLECTIFS – VAGUE {{numero_vague}}
- Dates de la vague : du {{date_debut_vague}} au {{date_fin_vague}}
- Jours de cours : lundi, mardi, jeudi et vendredi
- Créneaux : 7h, 12h ou 19h

Pour vous inscrire, deux étapes :
1. Le test écrit en ligne : {{lien_google_form}}
2. Le test oral, à 8h, à l'une de ces dates au choix : {{samedi_1}}, {{samedi_2}}, {{samedi_3}}, {{samedi_4}}

Les places sont limitées à 7 personnes par classe.

Si vous avez la moindre question, je reste à votre disposition.

Bien cordialement,

Koloina
Hari Online Club$txt$,
 'Dès que Koloina a récupéré l''email du prospect.', 'La brochure', 11),

('1.2', '1. Prospect', 'Relance',
 'Votre projet d''anglais avec Hari Online Club',
 $txt$Bonjour {{prenom}},

Je me permets de revenir vers vous suite à l'envoi de notre brochure. Avez-vous eu le temps d'y jeter un œil ?

Si vous hésitez encore, voici les prochaines étapes :
- Cours individuels ou en duo : réservez votre diagnostic call pour faire le point sur vos besoins et votre niveau : {{lien_reservation}}
- Cours collectifs : la vague {{numero_vague}} démarre le {{date_debut_vague}}. Passez le test écrit ({{lien_google_form}}), puis le test oral à 8h l'un de ces samedis : {{samedi_1}}, {{samedi_2}}, {{samedi_3}}, {{samedi_4}}.

Et si vous avez une question, je suis là pour y répondre.

Bien cordialement,

Koloina
Hari Online Club$txt$,
 'Si le prospect n''a pas réagi {{x_jours}} jours après le mail d''offres.', null, 12),

('2.1', '2. Inscription et paiement', 'Procédure à signer et modalités de paiement',
 'Votre inscription chez Hari Online Club – Prochaines étapes',
 $txt$Bonjour {{prenom}},

Merci pour votre confiance ! Nous avons bien noté votre choix : {{formule}}.

Pour finaliser votre inscription, voici les deux étapes :

1. Lire et signer la procédure en pièce jointe. Elle précise nos règles de réservation, d'annulation, de paiement et de ponctualité. Merci de nous la retourner signée.

2. Régler le montant de {{montant}} via l'un des moyens suivants :
- Orange Money : {{orange_money}}
- Mvola : {{mvola}}
- Virement bancaire (Madagascar uniquement) : RIB sur demande
- Depuis l'étranger : Taptap Send, Emadex, Ria ou Western Union (informations sur demande)

Le paiement doit être reçu avant la réservation de votre premier cours. Dès réception, nous vous enverrons votre facture.

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Dès que l''apprenant confirme sa formule.', 'La procédure HOC', 21),

('2.2', '2. Inscription et paiement', 'Lettre d''engagement (paiement en 2 tranches)',
 'Votre paiement en 2 tranches – Lettre d''engagement',
 $txt$Bonjour {{prenom}},

Pour votre formule de {{volume_heures}} heures, vous pouvez régler en 2 tranches :
- 1re tranche : {{montant_tranche_1}}, avant le {{date_tranche_1}}
- 2e tranche : {{montant_tranche_2}}, avant le {{date_tranche_2}}

Pour en bénéficier, merci de nous retourner avant le début de la formation :
- la lettre d'engagement en pièce jointe, complétée et signée électroniquement ;
- une copie de votre CIN, en PDF ou en photo.

Important : une fois signée, cet engagement est ferme. Les 2 tranches restent dues même en cas d'arrêt de la formation.

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Pour une formule de 40 heures ou plus, si l''apprenant choisit de payer en 2 tranches.', 'La lettre d''engagement', 22),

('2.3', '2. Inscription et paiement', 'Facture (accusé de réception du paiement)',
 'Paiement reçu – Votre facture Hari Online Club',
 $txt$Bonjour {{prenom}},

Nous avons bien reçu votre paiement de {{montant}}, merci ! Vous trouverez votre facture en pièce jointe.

Prochaine étape : nous organisons votre premier cours avec votre formateur. Vous recevrez très vite un email de bienvenue avec toutes les informations pratiques.

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Dès réception du paiement.', 'La facture', 23),

('3.1', '3. Démarrage', 'Bienvenue : cours individuels',
 'Bienvenue chez Hari Online Club – Votre formation démarre le {{date_debut_formation}}',
 $txt$Bonjour {{prenom}},

Bienvenue chez Hari Online Club ! Voici toutes les informations pour bien démarrer votre formation.

VOTRE FORMATION
- Formateur/Formatrice : {{nom_formateur}}
- Email : {{email_formateur}}
- Volume d'heures : {{volume_heures}} h

PLANNING DE LA PREMIÈRE SEMAINE
{{planning_semaine_1}}
Nous pouvons partir sur ces dates et les ajuster au fur et à mesure selon votre planning.

VOS ACCÈS
- Dossier Drive (leçons et exercices) : {{lien_drive}} – pensez à l'enregistrer
- Feuille d'émargement : {{lien_emargement}}
- Les cours ont lieu sur Google Meet. Votre formateur vous enverra une invitation Google Calendar pour chaque séance : acceptez-la pour confirmer votre présence.

À RETENIR
- Réservez vos cours au moins 2 jours à l'avance.
- Pour annuler, prévenez au moins 1 jour avant. Passé ce délai, le cours est considéré comme fait.
- Sans nouvelles de votre part 15 minutes après le début du cours, celui-ci est annulé et considéré comme fait.
- Pour toute question (planning, report, souci technique), contactez-moi directement.

Nous vous souhaitons un excellent premier cours avec {{nom_formateur}} le {{date_debut_formation}} à {{heure_premier_cours}} !

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Une fois le formateur attribué, le planning de la 1re semaine fixé, le Drive et l''émargement créés.', null, 31),

('3.2', '3. Démarrage', 'Résultats du test de placement : cours collectifs',
 'Vos résultats au test de placement – Hari Online Club',
 $txt$Bonjour {{prenom}},

Merci d'avoir passé nos tests de placement ! D'après vos résultats, votre niveau est : {{niveau}}.

La vague {{numero_vague}} se déroule du {{date_debut_vague}} au {{date_fin_vague}}, les lundis, mardis, jeudis et vendredis. Quel créneau vous convient le mieux ?
- 7h
- 12h
- 19h

Répondez-moi simplement par email ou sur WhatsApp. Une fois votre créneau choisi, je vous enverrai les modalités de paiement pour confirmer votre place.

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Après le test écrit et le test oral.', null, 32),

('3.3', '3. Démarrage', 'Regroupement de créneau : cours collectifs',
 'Votre créneau pour la vague {{numero_vague}}',
 $txt$Bonjour {{prenom}},

Pour garantir des sessions dynamiques, une classe démarre à partir de 3 apprenants. Le créneau de {{creneau}} n'a pas encore atteint ce minimum pour le niveau {{niveau}}.

Nous proposons donc de regrouper les apprenants de votre niveau sur un seul créneau. Lequel vous conviendrait le mieux : {{creneau_a}} ou {{creneau_b}} ?

Merci de me répondre avant le {{date_limite}}, afin que nous puissions confirmer la classe.

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Si un créneau compte moins de 3 inscrits avant le démarrage de la vague.', null, 33),

('3.4', '3. Démarrage', 'Bienvenue : cours collectifs',
 'Bienvenue chez Hari Online Club – Votre cours collectif {{niveau}} démarre le {{date_debut_vague}}',
 $txt$Bonjour {{prenom}},

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
Toutes les sessions ont lieu sur Jitsi Meet, avec ce lien unique : {{lien_jitsi}}
Enregistrez-le et testez-le avant la première session.

GROUPE WHATSAPP DE LA CLASSE
Rejoignez dès maintenant le groupe de votre classe : {{lien_whatsapp}}

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
- Pour toute question (planning, absence, souci technique), contactez-moi directement.

Nous avons hâte de vous retrouver le {{date_debut_vague}} !

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Après le paiement, une fois la classe constituée.', null, 34),

('4.1', '4. Suivi', 'Annulations tardives répétées',
 'Vos dernières séances annulées',
 $txt$Bonjour {{prenom}},

Nous avons remarqué que plusieurs de vos séances ont été annulées tardivement ou manquées ces dernières semaines ({{dates_annulations}}).

Pour rappel, toute annulation doit être faite au moins 1 jour avant le cours. Passé ce délai, ou sans nouvelles 15 minutes après le début, la séance est considérée comme faite et décomptée de votre volume d'heures.

Nous comprenons que votre emploi du temps puisse être chargé. Si vos disponibilités ont changé, parlons-en : nous pouvons revoir ensemble votre planning pour qu'il vous convienne mieux. L'apprentissage d'une langue demande de la régularité, et nous voulons que vous profitiez pleinement de vos heures.

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Après plusieurs annulations tardives ou absences sans prévenir.', null, 41),

('4.2', '4. Suivi', 'Absence prolongée : alerte',
 'Nous n''avons plus de nouvelles – Votre formation',
 $txt$Bonjour {{prenom}},

Nous n'avons pas eu de nouvelles de votre part depuis le {{date_dernier_cours}}. Tout va bien ?

Pour rappel, en cas d'absence non justifiée pendant 1 mois, la formation est automatiquement annulée, sans remboursement ni report. Sans nouvelles d'ici le {{date_limite}}, votre formation sera donc annulée.

Si vous traversez une période chargée, contactez-moi : nous trouverons ensemble une solution pour reprendre vos cours.

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Après 2 à 3 semaines sans cours ni nouvelles.', null, 42),

('4.3', '4. Suivi', 'Absence prolongée : annulation de la formation',
 'Annulation de votre formation',
 $txt$Bonjour {{prenom}},

Sans nouvelles de votre part depuis le {{date_dernier_cours}}, et conformément à la procédure que vous avez signée, votre formation est annulée à compter du {{date_annulation}}. Les heures restantes ne peuvent être ni remboursées ni reportées.

Nous restons à votre disposition si vous souhaitez reprendre une formation à l'avenir.

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Après 1 mois d''absence non justifiée, malgré l''alerte.', null, 43),

('4.4', '4. Suivi', 'Changement de formateur : à la demande de l''apprenant',
 'Votre nouveau formateur chez Hari Online Club',
 $txt$Bonjour {{prenom}},

Suite à votre demande, nous avons le plaisir de vous présenter votre nouveau formateur : {{nom_formateur}}.
- Email : {{email_formateur}}
- Premier cours avec {{nom_formateur}} : {{date_premier_cours}}

Nous lui avons transmis vos objectifs et l'historique de votre formation, pour une continuité sans rupture. Votre dossier Drive reste le même.

N'hésitez pas à me faire part de vos retours après ces premières séances.

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Une fois le nouveau formateur trouvé, avec l''avis de Harinjo.', null, 44),

('4.5', '4. Suivi', 'Changement de formateur : à l''initiative de HOC',
 'Changement de formateur pour votre formation',
 $txt$Bonjour {{prenom}},

{{nom_ancien_formateur}} ne pourra malheureusement plus assurer vos cours à partir du {{date_changement}}. Nous vous présentons votre nouveau formateur : {{nom_formateur}}.
- Email : {{email_formateur}}
- Premier cours : {{date_premier_cours}}

Nous lui avons transmis vos objectifs et l'historique de votre formation. Votre volume d'heures et votre dossier Drive restent inchangés.

Si ce créneau ne vous convient pas, dites-le-moi et nous l'ajusterons.

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Si le formateur n''est plus disponible.', null, 45),

('4.6', '4. Suivi', 'Formateur absent : cours bonus',
 'Votre séance du {{date_seance}} – Nos excuses',
 $txt$Bonjour {{prenom}},

Nous sommes sincèrement désolés : votre séance du {{date_seance}} n'a pas pu avoir lieu en raison de l'absence de votre formateur.

Cette séance ne sera pas décomptée de votre volume d'heures. En compensation, nous vous offrons un cours bonus. Voici les créneaux disponibles : {{creneau_1}}, {{creneau_2}}.

Merci pour votre compréhension.

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Si le formateur a manqué une séance sans prévenir.', null, 46),

('5.1', '5. Satisfaction et fidélisation', 'Recueil de satisfaction',
 'Comment se passe votre formation ?',
 $txt$Bonjour {{prenom}},

Vous avez déjà suivi {{heures_suivies}} heures de formation avec {{nom_formateur}} : félicitations pour votre régularité !

Votre avis compte beaucoup pour nous. Pourriez-vous prendre 2 minutes pour répondre à ce court questionnaire ?
{{lien_questionnaire}}

Vous pouvez aussi me répondre directement par email ou sur WhatsApp : ce qui vous plaît, ce qui pourrait être amélioré, vos objectifs pour la suite.

Merci d'avance !

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'À mi-parcours de la formation, ou à mi-vague pour les cours collectifs.', null, 51),

('5.2', '5. Satisfaction et fidélisation', 'Demande de témoignage',
 'Votre témoignage nous aiderait beaucoup',
 $txt$Bonjour {{prenom}},

Merci encore pour votre retour si positif sur votre formation !

Accepteriez-vous de partager votre expérience en quelques lignes ? Votre témoignage aidera d'autres personnes à se lancer. Vous pouvez simplement répondre à ce message, par exemple :
- Pourquoi vous avez choisi Hari Online Club
- Ce que la formation vous a apporté
- Ce que vous diriez à quelqu'un qui hésite

Avec votre accord, nous pourrions le publier sur nos réseaux, avec votre prénom et votre photo, si vous le souhaitez.

Merci beaucoup !

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Après un retour positif de l''apprenant, ou en fin de formation.', null, 52),

('5.3', '5. Satisfaction et fidélisation', 'Fin du volume d''heures : renouvellement',
 'Il vous reste {{heures_restantes}} heures de formation',
 $txt$Bonjour {{prenom}},

Votre formation touche bientôt à sa fin : il vous reste {{heures_restantes}} heures avec {{nom_formateur}}.

Vous avez fait de beaux progrès, notamment {{point_fort}}. Pour ne pas perdre cet élan, vous pouvez dès maintenant prolonger votre formation avec un nouveau volume d'heures, avec le même formateur et sans interruption.

Voulez-vous que je vous envoie les options ? Répondez-moi simplement par email ou sur WhatsApp.

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Quand il reste peu d''heures à l''apprenant.', null, 53),

('5.4', '5. Satisfaction et fidélisation', 'Résultats de fin de vague : passage au niveau supérieur',
 'Félicitations – Vous passez au niveau {{niveau_superieur}} !',
 $txt$Bonjour {{prenom}},

Félicitations ! Suite à votre évaluation finale, vous passez au niveau {{niveau_superieur}}.

La prochaine vague démarre le {{date_debut_vague}}, après 3 semaines de pause. Pour réserver votre place et choisir votre créneau (7h, 12h ou 19h), répondez-moi avant le {{date_limite}}.

Bravo pour votre travail pendant ces 32 sessions !

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Après l''évaluation finale, si l''apprenant réussit.', null, 54),

('5.5', '5. Satisfaction et fidélisation', 'Résultats de fin de vague : même niveau',
 'Vos résultats de fin de vague',
 $txt$Bonjour {{prenom}},

Merci pour votre engagement pendant cette vague. Suite à l'évaluation finale, nous vous recommandons de refaire le niveau {{niveau}} à la prochaine vague, pour consolider vos acquis avant de passer à la suite.

Vos points forts : {{points_forts}}
À travailler : {{points_ameliorer}}

La prochaine vague démarre le {{date_debut_vague}}. Pour réserver votre place et choisir votre créneau, répondez-moi avant le {{date_limite}}.

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Après l''évaluation finale, si l''apprenant ne réussit pas.', null, 55),

('6.1', '6. Réclamations', 'Accusé de réception d''une réclamation',
 'Votre message – Nous nous en occupons',
 $txt$Bonjour {{prenom}},

Merci de nous avoir fait part de votre retour concernant {{sujet}}. Nous le prenons très au sérieux.

Nous étudions la situation et reviendrons vers vous au plus tard le {{date_reponse}}, avec une réponse et une solution.

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Dans la journée où la réclamation arrive, avant de la faire remonter à Harinjo si besoin.', null, 61),

('6.2', '6. Réclamations', 'Réponse à une réclamation',
 'Suite à votre retour du {{date_retour}}',
 $txt$Bonjour {{prenom}},

Merci pour votre patience. Nous avons étudié votre retour concernant {{sujet}}.

{{explication}}

Voici ce que nous vous proposons : {{solution}}

Nous veillons à ce que cela ne se reproduise pas : {{mesure_interne}}

N'hésitez pas à me dire si cette solution vous convient.

Bien cordialement,

Anaël
Hari Online Club$txt$,
 'Une fois la solution décidée, avec Harinjo si la réclamation a été remontée.', null, 62)

) as t(reference, categorie, nom, objet, corps, quand, piece_jointe, ordre)
where e.slug = 'hari-online-course';
