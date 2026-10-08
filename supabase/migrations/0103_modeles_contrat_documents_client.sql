-- Réécriture des deux modèles de contrat d'après les documents de référence fournis par le client
-- le 2026-10-08 (« Contrat_Enseignement_Anglais_Hari_Online_Club.pdf » pour les professeurs,
-- « Procédure cours individuel - Hari Online Club.pdf » pour les étudiants).
--
-- Pourquoi une réécriture COMPLÈTE du corps, contrairement à la migration 0089 qui transformait
-- l'existant par `regexp_replace` : là il s'agissait de retirer un article d'un texte qui restait
-- valable par ailleurs. Ici les deux modèles en place ont été rédigés sur le droit FRANÇAIS
-- (Code de la consommation, Code du travail, Code de commerce, SIRET, pénalités de 40 €, RGPD),
-- alors que HOC exerce à Madagascar et que les documents du client posent des règles différentes,
-- parfois contradictoires avec le texte en place. Les conserver aurait laissé cohabiter deux
-- régimes incompatibles dans le même contrat.
--
-- Contradiction la plus nette, corrigée ici : l'ancien ARTICLE 7 étudiant promettait le
-- remboursement « au prorata » des heures non consommées en cas de résiliation, quand la
-- procédure du client énonce l'inverse — « dès qu'une heure de formation est utilisée, aucun
-- remboursement, même partiel, n'est possible ».
--
-- Les contrats DÉJÀ ÉMIS ne sont pas touchés : `contracts.corps_genere` est figé à l'émission
-- (0031) et vaut pièce signée. Seuls les contrats générés APRÈS cette migration porteront ces
-- textes.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Modèle PROFESSEUR
-- ─────────────────────────────────────────────────────────────────────────────
-- Les variables liées à une `source` sont remplies automatiquement depuis la fiche de la personne
-- ou le Profil HOC ; les autres restent à saisir à l'émission. Par rapport à l'ancienne version,
-- le nom, l'adresse, le téléphone et l'e-mail du professeur sont désormais déduits de sa fiche
-- (ils étaient saisis à la main) : le document du client les demande tous les quatre en en-tête.
update public.contract_templates
set
  nom = 'Contrat de prestation de services d''enseignement d''anglais',
  corps_template = $corps$Entre les soussignées :

Hari Online Club, {{etablissement_forme_juridique}}, immatriculée sous le NIF {{etablissement_nif}} et le STAT {{etablissement_stat}}, dont le siège social est situé {{etablissement_adresse}}, représentée par {{etablissement_directrice}} en qualité de CEO, ci-après dénommée « la Cliente »,

d'une part, et

Nom et prénom : {{nom_prestataire}}
Adresse : {{adresse_prestataire}}
Téléphone : {{telephone_prestataire}}
E-mail : {{email_prestataire}}

ci-après dénommée « la Prestataire »,

d'autre part.

Il a été convenu ce qui suit :

ARTICLE 1 — OBJET DU CONTRAT
Le présent contrat a pour objet de définir les modalités de prestation de services d'enseignement d'anglais réalisées par la Prestataire au profit de la Cliente.
La Prestataire s'engage à dispenser des cours d'anglais de qualité aux élèves pris en charge par Hari Online Club, conformément aux modalités et obligations définies dans le présent contrat.

ARTICLE 2 — NATURE ET MODALITÉS DE LA PRESTATION
— Nature de la prestation : la Prestataire dispense des cours d'anglais individuels ou en groupe, principalement en ligne, selon les besoins des apprenantes et les missions qui lui sont confiées par Hari Online Club.
— Durée des cours : la durée de chaque cours est déterminée selon le programme et les besoins de l'apprenante.
— Rémunération : la Cliente versera à la Prestataire une rémunération de {{taux_horaire_individuel}} par heure pour les cours individuels et de {{taux_horaire_collectif}} par heure pour les cours collectifs.
— Modalité de paiement : le règlement est effectué par virement bancaire {{periode_versement}}.

ARTICLE 3 — OBLIGATIONS DE LA PRESTATAIRE
La Prestataire s'engage à :
1. Dispenser des cours d'anglais de qualité, adaptés au niveau, aux besoins et aux objectifs de chaque élève.
2. Respecter les horaires des cours convenus avec l'apprenante et assurer sa présence et sa ponctualité.
3. Assurer une préparation et une organisation sérieuses de ses cours.
4. Lorsqu'elle accepte de prendre en charge une formation, accompagner l'apprenante jusqu'à la fin de son parcours de formation, sauf demande expresse de changement d'enseignante formulée par l'apprenante ou circonstance exceptionnelle acceptée par Hari Online Club.
5. En cas d'impossibilité d'assurer la poursuite d'une formation ou un cours prévu, prévenir Hari Online Club dans les meilleurs délais et ne pas abandonner une formation sans motif valable.
6. En cas d'annulation ou d'impossibilité d'assurer un cours, informer l'apprenante par e-mail, en mettant Hari Online Club en copie, et préciser la raison de l'annulation ou de l'absence.
7. Utiliser uniquement les canaux de communication officiellement autorisés par Hari Online Club avec les apprenantes. Toute communication relative à la formation doit notamment être effectuée par e-mail, lorsque celui-ci est requis par Hari Online Club.
8. Disposer d'une connexion Internet stable et de qualité permettant d'assurer correctement les cours en ligne.
9. Ne pas solliciter les élèves prises en charge par Hari Online Club afin de leur proposer, directement ou indirectement, des prestations personnelles, des cours privés ou tout autre service en dehors du cadre établi par Hari Online Club.
10. Ne pas proposer à une élève de payer directement la Prestataire pour des cours ou services qui auraient dû être réalisés dans le cadre de Hari Online Club.
11. Ne pas inciter, directement ou indirectement, une élève à quitter Hari Online Club ou à poursuivre sa formation directement avec la Prestataire en dehors du cadre de Hari Online Club.
12. Ne pas utiliser les coordonnées, informations personnelles ou données des élèves obtenues dans le cadre de sa collaboration avec Hari Online Club afin de développer une clientèle personnelle ou de proposer des prestations indépendantes.
13. Ne pas créer, gérer ou promouvoir, dans le but de détourner les élèves de Hari Online Club, des pages, groupes, comptes ou activités proposant des cours concurrents aux élèves dont elle a eu connaissance ou qu'elle a prises en charge dans le cadre de sa collaboration avec Hari Online Club.
14. Toute tentative de détournement de clientèle, de sollicitation directe d'une élève, de proposition de cours privés ou de mise en relation commerciale directe avec une élève de Hari Online Club en dehors du cadre autorisé est strictement interdite.
15. Ne pas utiliser sa relation avec les élèves de Hari Online Club pour proposer des services supplémentaires personnels ou concurrents, notamment lorsque les contacts ou informations ont été obtenus dans le cadre de sa collaboration avec Hari Online Club.

ARTICLE 4 — OBLIGATIONS DE LA CLIENTE
La Cliente s'engage à :
— Régler les sommes dues à la Prestataire dans les délais convenus.
— Communiquer à la Prestataire les informations nécessaires à la bonne réalisation des formations.
— Mettre à disposition de la Prestataire, lorsque cela est nécessaire, les outils, supports pédagogiques ou informations utiles à la réalisation des cours.

ARTICLE 5 — ABSENCES, AVERTISSEMENTS ET MANQUEMENTS
La Prestataire est tenue de respecter les horaires et engagements de cours convenus avec les apprenantes.
Toute absence doit être signalée à l'avance à Hari Online Club et à l'apprenante selon les modalités prévues au présent contrat.
En cas d'absence à un cours sans information préalable et sans motif valable, la Prestataire pourra recevoir un avertissement écrit.
Les avertissements peuvent être cumulés en cas de répétition des manquements.
À compter de trois (3) avertissements, notamment pour des absences injustifiées ou répétées, des manquements graves aux obligations contractuelles ou le non-respect répété des règles de fonctionnement de Hari Online Club, la Cliente pourra décider de la résiliation du contrat conformément aux dispositions applicables.
Les absences justifiées ou les situations exceptionnelles dûment signalées pourront être examinées par la Cliente au cas par cas.

ARTICLE 6 — NON-DÉTOURNEMENT DE CLIENTÈLE
La Prestataire reconnaît que les élèves qui lui sont confiées dans le cadre de ses missions constituent des clientes ou prospects de Hari Online Club.
Il lui est strictement interdit de détourner ou de tenter de détourner ces élèves au profit de son activité personnelle ou de toute autre activité extérieure à Hari Online Club.
Sont notamment considérés comme des actes interdits :
— proposer directement à une élève des cours particuliers en dehors de Hari Online Club ;
— demander ou accepter un paiement direct de la part d'une élève pour une prestation liée à la formation ;
— communiquer ses coordonnées personnelles dans le but de poursuivre la relation commerciale en dehors de Hari Online Club ;
— encourager une élève à quitter Hari Online Club pour travailler directement avec la Prestataire ;
— utiliser les informations ou coordonnées d'une élève obtenues grâce à Hari Online Club pour lui proposer des prestations personnelles ;
— créer ou promouvoir une activité concurrente auprès des élèves connues dans le cadre de la collaboration avec Hari Online Club.
Tout manquement à cette obligation pourra être considéré comme un manquement grave aux obligations contractuelles et pourra entraîner la résiliation du contrat, ainsi que, le cas échéant, toute demande de réparation du préjudice subi par la Cliente, conformément aux dispositions applicables.

ARTICLE 7 — CONFIDENTIALITÉ
Les parties s'engagent à préserver la confidentialité de toutes les informations auxquelles elles auront accès dans le cadre de l'exécution du présent contrat.
La Prestataire s'engage notamment à ne pas divulguer ou utiliser à des fins personnelles les informations concernant Hari Online Club, ses élèves, ses méthodes, ses supports pédagogiques, ses tarifs, ses données commerciales ou toute autre information confidentielle obtenue dans le cadre de sa collaboration.
Cette obligation de confidentialité demeure applicable après la fin du présent contrat.

ARTICLE 8 — PÉNALITÉS ET RESPONSABILITÉ
En cas de manquement grave aux obligations prévues par le présent contrat, la partie lésée pourra demander réparation du préjudice effectivement subi, conformément aux dispositions légales applicables.
Tout acte de détournement de clientèle, de sollicitation abusive d'une élève, de divulgation d'informations confidentielles ou de concurrence déloyale pourra notamment être considéré comme un manquement grave.
Les éventuelles pénalités ou demandes de dommages et intérêts devront être appréciées et appliquées conformément au droit applicable.

ARTICLE 9 — DURÉE ET RÉSILIATION
Le présent contrat est conclu pour une durée indéterminée.
Chacune des parties pourra mettre fin au présent contrat en adressant à l'autre partie une notification écrite avec un préavis de {{preavis_resiliation}}.
En cas de manquement grave aux obligations contractuelles, notamment en cas de détournement de clientèle, d'absences répétées et injustifiées, de violation de la confidentialité ou de sollicitation des élèves à des fins personnelles, la Cliente pourra procéder à la résiliation du contrat conformément aux dispositions applicables.

ARTICLE 10 — DISPOSITIONS GÉNÉRALES
Toute modification du présent contrat devra faire l'objet d'un accord écrit entre les parties.
Le présent contrat constitue l'intégralité de l'accord entre les parties concernant la prestation de services d'enseignement d'anglais.
Les parties déclarent avoir pris connaissance de l'ensemble des clauses du présent contrat et les accepter sans réserve.

Fait à {{ville_signature}}, le {{date_signature}}.


Pour la Cliente — {{etablissement_directrice}}, CEO de Hari Online Club


Pour la Prestataire — {{nom_prestataire}}
Mention « Lu et approuvé » :$corps$,
  variables_disponibles = $vars$[
    {"cle": "nom_prestataire", "label": "Nom complet du professeur", "source": "nom_complet"},
    {"cle": "adresse_prestataire", "label": "Adresse du professeur", "source": "adresse"},
    {"cle": "telephone_prestataire", "label": "Téléphone du professeur", "source": "telephone"},
    {"cle": "email_prestataire", "label": "E-mail du professeur", "source": "email"},
    {"cle": "taux_horaire_individuel", "label": "Rémunération horaire en cours individuel (ex. 10 000 Ar)"},
    {"cle": "taux_horaire_collectif", "label": "Rémunération horaire en cours collectif (ex. 15 000 Ar)"},
    {"cle": "periode_versement", "label": "Période de versement (ex. du 31 au 05 du mois suivant)"},
    {"cle": "preavis_resiliation", "label": "Préavis de résiliation (ex. quatorze (14) jours)"},
    {"cle": "ville_signature", "label": "Ville de signature (ex. Antananarivo)"},
    {"cle": "date_signature", "label": "Date de signature"},
    {"cle": "etablissement_forme_juridique", "label": "Forme juridique de l'établissement", "source": "etablissement_forme_juridique"},
    {"cle": "etablissement_nif", "label": "NIF", "source": "etablissement_nif"},
    {"cle": "etablissement_stat", "label": "STAT", "source": "etablissement_stat"},
    {"cle": "etablissement_adresse", "label": "Adresse de l'établissement", "source": "etablissement_adresse"},
    {"cle": "etablissement_directrice", "label": "Nom de la CEO", "source": "etablissement_directrice"}
  ]$vars$::jsonb
where public_cible = 'professeur';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Modèle ÉTUDIANT
-- ─────────────────────────────────────────────────────────────────────────────
-- Le document du client est une « procédure » que l'étudiant signe. Elle est reprise ici article
-- par article, en conservant l'en-tête contractuel (parties, programme souscrit, prix) dont
-- l'application a besoin pour générer un contrat nominatif.
--
-- Divergence relevée DANS le document du client, à trancher par HOC : sa version française fixe le
-- délai d'annulation à 2 jours, sa version anglaise à 1 jour. La version française fait foi ici,
-- et le délai reste une variable modifiable à l'émission.
update public.contract_templates
set
  nom = 'Contrat d''inscription et procédure de formation',
  corps_template = $corps$Entre les soussignés :

Hari Online Club, {{etablissement_forme_juridique}}, immatriculée sous le NIF {{etablissement_nif}} et le STAT {{etablissement_stat}}, dont le siège social est situé {{etablissement_adresse}}, représentée par {{etablissement_directrice}} en qualité de CEO, ci-après « l'Établissement »,

d'une part, et

{{nom_etudiant}}, domicilié(e) {{adresse_etudiant}}, téléphone {{telephone_etudiant}}, e-mail {{email_etudiant}}, ci-après « l'Étudiant »,

{{mention_representant_legal}}

d'autre part, ci-après désignés ensemble « les Parties ».

Bienvenue chez Hari Online Club. Afin d'optimiser le déroulement de votre formation, nous vous invitons à parcourir attentivement la présente procédure, qui fait partie intégrante de votre inscription. En cas de question ou de point non clarifié, contactez l'équipe administrative : nous sommes là pour vous assister dans votre parcours d'apprentissage.

ARTICLE 1 — PROGRAMME SOUSCRIT
L'Étudiant s'inscrit à des cours de {{langue_visee}} dispensés à distance par l'Établissement, selon la formule {{type_programme}}.
Le programme comprend {{nombre_heures}} heures de cours, à raison d'un rythme de {{rythme_hebdomadaire}}, à compter du {{date_debut_cours}} et jusqu'au {{date_echeance}}.
Les séances sont assurées par un professeur affecté par l'Établissement, qui peut évoluer en cours de programme selon les nécessités pédagogiques ou d'organisation, l'Étudiant en étant préalablement informé.

ARTICLE 2 — AGENDA ET RÉSERVATION DES COURS
1. Réservation : toute réservation de cours doit être effectuée au minimum {{delai_reservation}} à l'avance, auprès de l'équipe administrative, pour convenir d'un créneau.
2. Invitation : à la suite de la réservation, l'Étudiant reçoit automatiquement une invitation Google Calendar par e-mail. Il est impératif d'accepter cette invitation pour confirmer sa présence au cours.
3. Gestion de l'agenda : il appartient à chaque étudiant de gérer son propre agenda, en acceptant ou en refusant les invitations reçues par e-mail. En cas d'indisponibilité, l'Étudiant décline l'invitation afin de libérer le créneau pour un autre étudiant.
4. Seules les personnes ayant reçu une invitation disposent d'une séance : sans invitation, il n'y a pas de séance. Les créneaux sont attribués dans l'ordre des réservations.

ARTICLE 3 — ANNULATION D'UNE SÉANCE
Toute annulation doit être effectuée au moins {{delai_annulation}} avant le début du cours.
En cas d'annulation tardive ou de non-confirmation, le cours est considéré comme fait et décompté du forfait.
L'apprentissage d'une langue demandant de la continuité, des séances trop espacées nuisent à la progression : l'Établissement recommande un rythme régulier.

ARTICLE 4 — PAIEMENT
1. Les frais de cours doivent être payés intégralement avant le début de la formation. Le prix de la formule souscrite s'élève à {{prix_total}}.
2. L'Étudiant reçoit un accusé de réception du paiement, puis une facture.
3. Modes de paiement acceptés : Mobile Money et virement bancaire domestique. Pour les étudiants résidant à l'étranger : Tap Tap Send, Emadex, Ria, Western Union ou Mobile Money. Les virements internationaux ne sont pas acceptés, sauf compte ouvert dans la même banque que l'Établissement, en raison des délais de traitement.
4. Facilité de paiement pour les forfaits de 40 heures et plus : le règlement peut être effectué en deux tranches. Une lettre d'engagement électronique précise le montant de chaque tranche, les dates de paiement et la durée du plan. Elle doit être complétée et signée électroniquement avant le début de la formation, accompagnée d'une copie de la carte d'identité de l'Étudiant.
Une fois signé, cet engagement est ferme : même en cas d'arrêt ou d'abandon de la formation, les deux tranches restent dues, sans report ni annulation.

ARTICLE 5 — REMBOURSEMENT
Les heures de formation achetées sont personnelles et destinées à une seule personne. Elles ne peuvent être cédées, transférées, échangées ni utilisées par quelqu'un d'autre.
Un remboursement n'est possible que si la formation n'a pas commencé : si aucune séance n'a été suivie, l'Étudiant peut récupérer le montant payé.
Dès qu'une heure de formation a été utilisée, aucun remboursement, même partiel, n'est possible, quelle qu'en soit la raison.

ARTICLE 6 — SUPPORTS DE COURS ET PLATEFORME
1. L'ensemble du matériel de cours, leçons et exercices, est partagé via un dossier Google Drive créé spécifiquement pour l'Étudiant et portant son nom. Le lien est envoyé à son adresse e-mail ; il lui appartient de le conserver.
2. Ce dossier donne accès aux leçons, aux exercices et à tout autre support pédagogique nécessaire à sa progression.
3. Les cours se tiennent sur Google Meet, seule plateforme utilisée à ce jour. Les liens de connexion figurent dans les invitations Google Calendar.
4. Les supports pédagogiques sont concédés à l'Étudiant pour son seul usage personnel, à l'exclusion de toute reproduction, diffusion ou exploitation commerciale.

ARTICLE 7 — PONCTUALITÉ ET ENGAGEMENT
1. L'Étudiant se connecte au lien du cours à l'heure prévue. Sans réponse ni message de sa part dans les {{delai_ponctualite}} suivant le début du cours, la séance est annulée et considérée comme donnée.
2. Les mêmes règles s'appliquent au professeur. En cas de retard ou d'absence imprévus, il s'engage à informer l'Étudiant dès que possible. S'il ne donne aucun préavis et ne rejoint pas la séance dans ce même délai, l'Étudiant peut considérer le cours comme annulé — sans décompte de son forfait.
3. En cas de manquement du professeur, l'Étudiant reçoit une séance bonus en compensation, sous réserve de disponibilité.
4. En cas de retard ou d'absence imprévus, chaque partie informe l'autre dès que possible.
5. Tout réajustement de l'emploi du temps doit être signalé à l'équipe administrative.
6. En cas d'absence non justifiée pendant une période d'un (1) mois, la formation est automatiquement annulée, sans possibilité de remboursement ni de report.

ARTICLE 8 — CADRE PÉDAGOGIQUE ET RELATION AVEC LES PROFESSEURS
1. Les échanges entre l'Étudiant et les professeurs se limitent strictement au cadre des cours, aux exercices, aux corrections et aux besoins pédagogiques liés à la formation. Toute communication personnelle, demande de cours privés, assistance extérieure ou sollicitation directe d'un professeur en dehors de Hari Online Club est interdite sans validation préalable de l'administration.
2. Les professeurs intervenant chez Hari Online Club font partie intégrante de sa structure. Il est formellement interdit de contourner l'Établissement pour organiser des cours, demander des services ou établir une collaboration directe avec un professeur rencontré par son intermédiaire.
Tout manquement à cette règle pourra entraîner l'arrêt immédiat de la formation et la suspension de l'accès aux cours et aux supports, sans remboursement des heures restantes.
3. Toute demande relative aux horaires, aux changements de planning, aux paiements, aux reports ou à tout autre besoin administratif passe obligatoirement par l'équipe administrative, afin de garantir une organisation claire et une bonne coordination entre apprenants et professeurs.

ARTICLE 9 — OBLIGATIONS DE L'ÉTABLISSEMENT
L'Établissement s'engage à mettre à disposition un professeur qualifié, un accès fonctionnel à la plateforme et aux supports, ainsi qu'un suivi régulier de la progression pédagogique de l'Étudiant.

ARTICLE 10 — DONNÉES PERSONNELLES
Les données personnelles de l'Étudiant sont traitées par l'Établissement aux seules fins de gestion de son inscription et de son suivi pédagogique. L'Étudiant dispose d'un droit d'accès, de rectification et d'effacement de ses données, qu'il peut exercer auprès de l'Établissement.
Lorsque l'Étudiant est mineur, son représentant légal consent, en cette qualité, au traitement de ses données personnelles.

ARTICLE 11 — DISPOSITIONS DIVERSES ET SIGNATURE
La présente convention, procédure comprise, exprime l'intégralité de l'accord des Parties. Toute modification fait l'objet d'un accord écrit.
Elle est signée électroniquement depuis les espaces respectifs des Parties sur la plateforme, cette signature valant accord ferme et définitif.
Si des circonstances exceptionnelles surviennent, l'Étudiant est invité à en informer l'Établissement afin que des dispositions appropriées puissent être prises.

Fait à {{ville_signature}}, le {{date_signature}}.


Pour l'Établissement — {{etablissement_directrice}}, CEO de Hari Online Club


L'Étudiant (ou son représentant légal) — {{nom_etudiant}}
Mention « Lu et approuvé » :$corps$,
  variables_disponibles = $vars$[
    {"cle": "nom_etudiant", "label": "Nom complet de l'étudiant", "source": "nom_complet"},
    {"cle": "adresse_etudiant", "label": "Adresse de l'étudiant", "source": "adresse"},
    {"cle": "telephone_etudiant", "label": "Téléphone de l'étudiant", "source": "telephone"},
    {"cle": "email_etudiant", "label": "E-mail de l'étudiant", "source": "email"},
    {"cle": "mention_representant_legal", "label": "Si l'étudiant est mineur, coller : « Représenté(e) par [Nom], en qualité de représentant légal, qui consent à la présente inscription et s'engage solidairement à son exécution. » — sinon laisser vide"},
    {"cle": "langue_visee", "label": "Langue visée", "source": "langue_programme"},
    {"cle": "type_programme", "label": "Type de programme", "source": "type_programme_label"},
    {"cle": "nombre_heures", "label": "Nombre d'heures du programme", "source": "heures_programme"},
    {"cle": "rythme_hebdomadaire", "label": "Rythme hebdomadaire", "source": "rythme_programme"},
    {"cle": "date_debut_cours", "label": "Date de début des cours", "source": "date_debut_programme"},
    {"cle": "date_echeance", "label": "Échéance du programme", "source": "date_echeance_programme"},
    {"cle": "prix_total", "label": "Prix total", "source": "montant_programme"},
    {"cle": "delai_reservation", "label": "Délai de réservation d'un cours (ex. 2 jours)"},
    {"cle": "delai_annulation", "label": "Délai d'annulation d'une séance (ex. 2 jours)"},
    {"cle": "delai_ponctualite", "label": "Délai de ponctualité avant annulation (ex. 15 minutes)"},
    {"cle": "ville_signature", "label": "Ville de signature (ex. Antananarivo)"},
    {"cle": "date_signature", "label": "Date de signature"},
    {"cle": "etablissement_forme_juridique", "label": "Forme juridique de l'établissement", "source": "etablissement_forme_juridique"},
    {"cle": "etablissement_nif", "label": "NIF", "source": "etablissement_nif"},
    {"cle": "etablissement_stat", "label": "STAT", "source": "etablissement_stat"},
    {"cle": "etablissement_adresse", "label": "Adresse de l'établissement", "source": "etablissement_adresse"},
    {"cle": "etablissement_directrice", "label": "Nom de la CEO", "source": "etablissement_directrice"}
  ]$vars$::jsonb
where public_cible = 'etudiant';
