-- Remplacement des deux modèles de contrat par les documents juridiques fournis par le client
-- le 2026-11-10 : « Contrat de prestation – Professeur (HOC)_JUR 28 10 2026 » et « Convention de
-- formation – Étudiant (HOC)_29102026 ».
--
-- Troisième génération de ces modèles, après 0103 (réécriture d'après les documents d'octobre).
-- Les textes sont repris MOT POUR MOT des .docx du client : ce sont des pièces juridiques revues
-- par son conseil, et toute reformulation de notre part changerait la portée d'une clause. Ils
-- portaient déjà les jetons `{{variable}}` aux noms exacts des modèles en place — le client les a
-- rédigés contre l'existant.
--
-- Ce que ces documents apportent, et qui n'existait dans aucune version précédente :
--   — professeur : obligation de mener à terme toute formation acceptée, préavis d'un mois,
--     séance bonus non rémunérée en cas d'absence du professeur, clause de non-concurrence d'un
--     an, pénalité forfaitaire de 500 000 Ar en cas de détournement, référence aux articles 182
--     et suivants de la loi n° 66-003 ;
--   — étudiant : confirmation de présence 24 h à l'avance, annulation tardive décomptée du
--     forfait, facilité de paiement en deux tranches au-delà de 40 h (renvoyant à la « Lettre
--     d'engagement » déjà en place, modèle distinct laissé intact), interdiction de détourner un
--     professeur, valeur probante de la signature électronique (articles 272.1 et 276.1 de la
--     même loi).
--
-- Une coquille du document source est corrigée ici, et une seule : « à raison d'un rythme de
-- {rythme_hebdomadaire}} » ne portait qu'UNE accolade ouvrante. Laissée telle quelle, la variable
-- n'aurait jamais été substituée et la phrase serait partie ainsi dans un contrat signé.
--
-- Ciblage par IDENTIFIANT, et non par `public_cible` comme le faisait 0103 : depuis le
-- 2026-10-31 il existe DEUX modèles « étudiant » (la convention et la « Lettre d'engagement à
-- paiement en plusieurs tranches »), et un `where public_cible = 'etudiant'` écraserait la
-- seconde — que la convention, justement, cite à son article 4.
--
-- Les contrats DÉJÀ ÉMIS ne sont pas touchés : `contracts.corps_genere` est figé à l'émission
-- (0021) et vaut pièce signée. Seuls les contrats générés APRÈS porteront ces textes. Les 14
-- contrats en base, dont 8 déjà signés, gardent donc leur texte d'origine — c'est la règle, pas
-- un effet de bord.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Modèle PROFESSEUR — Contrat de prestation de services – Professeur
-- ─────────────────────────────────────────────────────────────────────────────
-- Rempli automatiquement (12) : nom_prestataire, adresse_prestataire, telephone_prestataire, email_prestataire, taux_horaire_individuel, taux_horaire_collectif, date_signature, etablissement_forme_juridique, etablissement_nif, etablissement_stat, etablissement_adresse, etablissement_directrice
-- Saisi à l'émission (2) : periode_versement, ville_signature
update public.contract_templates
set
  nom = $nom$Contrat de prestation de services – Professeur$nom$,
  corps_template = $corps$Le présent contrat (ci-après également désigné par les « présentes ») est conclu entre les soussignées :

Hari Online Club, {{etablissement_forme_juridique}}, immatriculée sous le NIF {{etablissement_nif}} et le STAT {{etablissement_stat}}, dont le siège social est situé {{etablissement_adresse}}, représentée par {{etablissement_directrice}} en qualité de CEO, dûment habilité(e) pour la conclusion et pour la signature des présentes, ci-après dénommée le/la « Client(e) » et/ou « HOC »,

d'une part, et

Nom et prénom : {{nom_prestataire}}
Adresse : {{adresse_prestataire}}
Téléphone : {{telephone_prestataire}}
E-mail : {{email_prestataire}}
Dûment habilité pour la conclusion et pour la signature des présentes,

ci-après dénommé(e) le « Prestataire » et/ou « Professeur »,
d'autre part.

Dans le présent contrat, le terme « Professeur » désigne indifféremment un professeur ou une professeure, et le terme « étudiant » désigne indifféremment un étudiant ou une étudiante.

LES PARTIES ONT ARRETE ET CONVENU CE QUI SUIT :

ARTICLE 01 — OBJET DU CONTRAT
Le présent contrat a pour objet de définir les conditions et modalités relatives aux prestations à effectuer par le Professeur notamment les services d'enseignement d'anglais réalisées par le Professeur au profit de la Cliente ainsi que toutes les autres prestations confiées au Prestataire et celles découlant directement, accessoires et rattachées auxdites prestations (ci -après également désignées par les/des « Prestations »).

Le Professeur s'engage à dispenser des cours d'anglais de qualité aux étudiants pris en charge par Hari Online Club, conformément aux modalités et obligations définies dans le présent contrat.

ARTICLE 02 — DUREE ET RESILIATION
Le présent contrat est conclu pour une durée indéterminée.

Chacune des parties pourra mettre fin au présent contrat en adressant à l'autre partie une notification écrite avec un préavis d'un (1) mois, sous réserve de l'obligation de terminer les formations en cours prévue dans les présentes.

Toute formation entamée par le Professeur devra être menée à son terme. À défaut, le Professeur sera tenu de rembourser le montant correspondant aux heures de formation restant à dispenser. À cet effet, le Professeur autorise expressément HOC à procéder à la déduction du montant dû directement sur le montant de la Prestation prévue au présent contrat.
En cas de manquement grave aux obligations contractuelles, notamment en cas de détournement de clientèle, d'activité concurrente, d'absences répétées et injustifiées, de violation de la confidentialité ou de sollicitation des étudiants à des fins personnelles, la Cliente pourra procéder à la résiliation immédiate du contrat, dans les conditions prévues dans le présent contrat. Dans ce cadre, la responsabilité civile et pénale du Professeur sera engagée à l’égard de HOC, et ce sans aucune réserve quelconque, sans limitation dans le temps, dans la durée et l’espace. HOC sera ainsi en droit d’initier et de prendre toute mesure et/ou action requise à l’égard du Professeur.

ARTICLE 03 — NATURE ET MODALITES DE LA PRESTATION
Nature de la prestation : le Professeur dispense des cours d'anglais individuels ou en groupe, principalement en ligne, selon les besoins des étudiants et les missions qui lui sont confiées par Hari Online Club.
Durée des cours : la durée de chaque cours est déterminée selon le programme et les besoins de l'étudiant.

Le présent contrat est conclu en considération de la personne (intuitu personae) du Prestataire. Le Prestataire devra indiquer par tous moyens écrits au Client, et tiendra à jour, la liste de son personnel habilité à intervenir en exécution des Prestations contractuelles.

Il est entendu entre les Parties que :
Lorsque le Professeur accepte une formation et signe la convention correspondante, il s'engage à assurer l'intégralité des heures prévues, jusqu'à la fin du parcours de l'étudiant.
Seule exception : le transfert de l'étudiant vers un autre professeur, décidé ou validé expressément par Hari Online Club (notamment à la demande de l'étudiant).

Arrêt pour motif valable : si le Professeur est contraint d'arrêter une formation, il doit en informer Hari Online Club par écrit, en joignant un justificatif prouvant le motif de l'arrêt avec un préavis d’un (01) mois au minimum. Un changement d'avis ou de disponibilité personnelle sans justificatif ne constitue pas un motif valable.
Préavis : en cas d'arrêt pour motif valable, le Professeur respecte un préavis d'un (1) mois, pendant lequel il continue d'assurer les cours, afin de permettre à Hari Online Club de le remplacer.
Arrêt sans motif valable : si le Professeur abandonne une formation sans motif valable ou sans justificatif, le Professeur sera tenu de rembourser le montant correspondant aux heures de formation restant à dispenser et Hari Online Club se réserve le droit d'engager toute action en responsabilité civile afin d'obtenir réparation du préjudice subi.

ARTICLE 04 — OBLIGATIONS DU PROFESSEUR
Le Professeur s'engage à :
Dispenser des cours d'anglais de qualité, adaptés au niveau, aux besoins et aux objectifs de chaque étudiant, conformément aux règles et mode de fonctionnement au sein de HOC.
Respecter les horaires des cours convenus avec l'étudiant et assurer sa présence et sa ponctualité.
Assurer une préparation et une organisation sérieuses de ses cours.
Mener à terme chaque formation qu'il accepte, dans les conditions prévues à l'article 9.
En cas d'annulation ou d'impossibilité d'assurer un cours, informer l'étudiant via la messagerie intégrée de la plateforme Hari Online Club, en précisant la raison de l'annulation ou de l'absence, et prévenir Hari Online Club dans les meilleurs délais.
Communiquer avec les étudiants uniquement via la messagerie intégrée de la plateforme Hari Online Club. Il est interdit d'échanger avec un étudiant son numéro de téléphone, son adresse e-mail personnelle, ses comptes de réseaux sociaux ou tout autre moyen de contact privé.
Autoriser que Hari Online Club puisse consulter à tout moment les messages échangés avec les étudiants sur la plateforme, afin de garantir la qualité du suivi pédagogique et le respect du présent contrat. Ces messages seront conservés par Hari Online Club.
Disposer d'une connexion Internet stable et de qualité permettant d'assurer correctement les cours en ligne.
Respecter les interdictions de détournement et d'activité concurrente prévues dans le présent contrat.

ARTICLE 05 — OBLIGATIONS DE LA CLIENTE
La Cliente s'engage à :
Régler les sommes dues au Professeur dans les délais convenus, sous réserve de la pénalité prévue à l'article 8.
Communiquer au Professeur les informations nécessaires à la bonne réalisation des formations.
Mettre à disposition du Professeur, via la plateforme Hari Online Club, les outils, supports pédagogiques et informations utiles à la réalisation des cours.

ARTICLE 06 — MODALITES FINANCIERES
En contrepartie de la réalisation de l’intégralité des Prestations convenues entre les Parties, la Cliente versera au Professeur une rémunération de {{taux_horaire_individuel}} par heure pour les cours individuels et de {{taux_horaire_collectif}} par heure pour les cours collectifs.
Annulation tardive ou absence de l'étudiant : lorsqu'un étudiant annule une séance hors délai, ne la confirme pas dans les délais ou ne se présente pas, la séance est décomptée de son forfait et rémunérée au Professeur comme une séance effectuée. Si l'étudiant justifie d'un motif sérieux et dûment prouvé, le Professeur peut, s'il le souhaite, accepter de reprogrammer la séance au lieu d'être rémunéré pour la séance annulée ; la séance n'est alors rémunérée qu'une seule fois, lorsqu'elle est effectivement donnée.

Séance bonus : lorsque le Professeur manque un cours (absence ou retard sans préavis), la séance manquée n'est pas rémunérée et l'étudiant reçoit une séance bonus en compensation. Cette séance bonus n'est pas rémunérée.

Modalité de paiement : le règlement est effectué par virement bancaire {{periode_versement}}.

Les Parties conviennent de préciser que seules les Prestations dont la réalisation effective et les conditions et la qualité auront été dûment approuvées par le Client pourront être facturées à ce dernier. A charge pour le Prestataire d’en apporter la preuve à HOC. Le cas échéant, le Client se réservera le droit de procéder à toute déduction des sommes pouvant être dues au Prestataire.

ARTICLE 07 — ABSENCES, AVERTISSEMENTS ET MANQUEMENTS
Le Professeur est tenu de respecter les horaires et engagements de cours convenus avec les étudiants.
Toute absence doit être signalée à l'avance à Hari Online Club et à l'étudiant, via la plateforme, selon les modalités prévues au présent contrat.

En cas d'absence à un cours sans information préalable et sans motif valable, le Professeur pourra recevoir un avertissement écrit. Les avertissements peuvent être cumulés en cas de répétition des manquements.
À compter de trois (3) avertissements, notamment pour des absences injustifiées ou répétées, des manquements graves aux obligations contractuelles ou le non-respect répété des règles de fonctionnement de Hari Online Club, la Cliente pourra procéder à la résiliation de plein droit du présent contrat sans besoin d’autres formalités.

Les absences justifiées ou les situations exceptionnelles dûment signalées pourront être examinées par la Cliente au cas par cas.

ARTICLE 08 — INTERDICTION DE DETOURNEMENT DES ETUDIANTS
Le Professeur reconnaît expressément que les étudiants qui lui sont confiés dans le cadre de ses missions sont des clients ou prospects de Hari Online Club.

A ce titre, il lui est strictement interdit de détourner/solliciter ou de tenter de détourner ces étudiants au profit de son activité personnelle ou de toute autre activité extérieure à Hari Online Club. Il est strictement interdit d’inciter les étudiants à recourir à ses services à titre personnel ou à ceux de tout autre tiers, ou de prendre toute initiative visant à les soustraire à la relation commerciale avec HOC ou à contourner HOC dans le cadre de prestations relevant de ses activités.

Sont notamment considérés comme des actes de détournement :
proposer directement à un étudiant des cours particuliers en dehors de Hari Online Club, ou accepter une telle demande de sa part ;
demander ou accepter un paiement direct de la part d'un étudiant pour une prestation liée à la formation ;
communiquer ses coordonnées personnelles à un étudiant (numéro de téléphone, e-mail personnel, réseaux sociaux), ou lui demander les siennes ;
encourager un étudiant à quitter Hari Online Club pour travailler directement avec le Professeur ;
utiliser les informations ou coordonnées d'un étudiant obtenues grâce à Hari Online Club pour lui proposer des prestations personnelles ;
proposer à un étudiant des services supplémentaires personnels ou concurrents.

Si un étudiant propose au Professeur des cours en dehors de Hari Online Club, le Professeur doit refuser et en informer Hari Online Club.

Tout manquement du Professeur aux obligations prévues au présent article pourra entraîner, après mise en demeure restée sans effet dans un délai de quarante-huit (48) heures, la résiliation de plein droit du présent contrat, sans préjudice du droit de HOC de solliciter la réparation intégrale du préjudice subi.

ARTICLE 09 — CLAUDE DE NON-CONCURRENCE - INTERDICTION D'ACTIVITE CONCURRENTE EN LIGNE
En contrepartie des sommes versées par la Cliente, pendant toute la durée et pendant une période d’un an après la résiliation de celui-ci, quelle qu’en soit la cause, il est interdit au Professeur d’accepter ou réaliser des prestations directe ou indirecte avec les activités de HOC.

A ce titre, pendant toute la durée de sa collaboration avec Hari Online Club, le Professeur s'interdit de créer, gérer ou promouvoir, en son nom ou sous un autre nom, toute page, compte, groupe ou profil sur les réseaux sociaux, site internet ou autre support présentant ou proposant une activité de cours d'anglais en ligne, ou indiquant qu'il donne des cours d'anglais en ligne à titre personnel. Une telle activité est en concurrence directe avec Hari Online Club.

Si le Professeur disposait déjà d'une telle activité avant la signature du présent contrat, il doit la déclarer par écrit à Hari Online Club avant la signature. À défaut, il est réputé ne pas en avoir.

ARTICLE 10 — SANCTIONS EN CAS DE DETOURNEMENT OU D'ACTIVITE CONCURRENTE
Si Hari Online Club constate un manquement aux articles 6 ou 7, y compris lorsqu'une telle activité est ouverte en cours de collaboration, les sanctions suivantes s'appliquent après notification écrite du manquement au Professeur :
Rupture immédiate : le présent contrat ainsi que l'ensemble des formations et missions en cours confiées au Professeur sont rompus immédiatement, sans préavis.

Conformément aux articles 182 et suivants de la loi n° 66-003 du 2 juillet 1966 relative à la théorie générale des obligations, le Professeur est redevable, à titre de réparation forfaitaire, d'une pénalité de cinq cent mille ariary (500 000 Ar). Cette pénalité est déduite de toute somme restante due par Hari Online Club au Professeur. Si ces sommes sont insuffisantes, le Professeur verse le solde à Hari Online Club dans un délai de quinze (15) jours à compter de la notification. Par convention expresse des parties, la pénalité est due en totalité, sans réduction.

Exclusion définitive : le Professeur ne pourra plus collaborer avec Hari Online Club, de quelque manière que ce soit.

Action en justice : Nonobstant les actions susmentionnées, Hari Online Club se réserve le droit d'engager toute action en responsabilité civile afin d'obtenir réparation du préjudice subi. Conformément à l'article 185 de la loi n° 66-003, l'application de la pénalité prévue au point 2 n'exonère pas le Professeur des conséquences de sa faute lourde ou de son dol.

ARTICLE 11 — CONFIDENTIALITE ET SUPPORTS PEDAGOGIQUES
Les parties s'engagent à préserver la confidentialité de toutes les informations auxquelles elles auront accès dans le cadre de l'exécution du présent contrat. Sont considérées comme confidentielles par nature toute information commerciale, financière, juridique ou technique qui ne serait pas dans le domaine public.

Le Professeur s'engage notamment à ne pas divulguer ou utiliser à des fins personnelles les informations concernant Hari Online Club, ses étudiants, ses méthodes, ses supports pédagogiques, ses tarifs, ses données commerciales ou toute autre information confidentielle obtenue dans le cadre de sa collaboration.

Cette obligation de confidentialité demeure applicable après la fin du présent contrat.

Les supports pédagogiques créés par le Professeur restent sa propriété. Les supports, méthodes et contenus fournis par Hari Online Club restent la propriété exclusive de Hari Online Club et ne peuvent être utilisés par le Professeur que pour les cours dispensés dans le cadre du présent contrat.

ARTICLE 12 — PENALITES ET RESPONSABILITE
Chaque Partie demeure civilement responsable de tous les dommages ou préjudices causés de son fait, du fait de ses employés ou préposés, pendant toute la durée du présent contrat.

Le Prestataire s’engage à prendre à sa charge exclusive toutes les modalités et autorisations nécessaires pour la bonne exécution des Prestations à réaliser.

En cas de manquement grave aux obligations prévues par le présent contrat, la partie lésée pourra demander réparation du préjudice effectivement subi, conformément aux dispositions légales applicables.

Tout acte de détournement de clientèle, de sollicitation d'un étudiant, d'activité concurrente, de divulgation d'informations confidentielles ou d'abandon de formation sans motif valable est considéré comme un manquement grave. Les sanctions prévues à l'article 8 s'appliquent sans préjudice de toute autre demande de dommages et intérêts.

ARTICLE 13 – REGLEMENT DES LITIGES – LOI APPLICABLE
Le présent contrat est soumis aux dispositions légales et règlementaires en vigueur à Madagascar.
Les Parties s’engagent à régler à l’amiable tout litige ou différend pouvant survenir à l’occasion de l’exécution ou de l’interprétation du présent contrat. En cas d’échec des procédures de règlement à l’amiable, tout litige sera porté devant les Tribunaux et Cours statuant en matière commerciale d’Antananarivo.
ARTICLE 14 — DISPOSITIONS GENERALES
Toute modification du présent contrat devra faire l'objet d'un accord écrit entre les parties.

Le présent contrat constitue l'intégralité de l'accord entre les parties concernant la prestation de services d'enseignement d'anglais.

Les parties déclarent avoir pris connaissance de l'ensemble des clauses du présent contrat et les accepter sans réserve.

ARTICLE 15 – PRISE D’EFFET
Le présent contrat prend effet pour compter de la date de signature effective des présentes.

Fait à {{ville_signature}}, le {{date_signature}}.

Pour la Cliente — {{etablissement_directrice}}, CEO de Hari Online Club
Pour le Professeur — {{nom_prestataire}}
Mention « Lu et approuvé » :
$corps$,
  variables_disponibles = $vars$[
  {
    "cle": "nom_prestataire",
    "label": "Nom et prénom du professeur",
    "source": "nom_complet"
  },
  {
    "cle": "adresse_prestataire",
    "label": "Adresse du professeur",
    "source": "adresse"
  },
  {
    "cle": "telephone_prestataire",
    "label": "Téléphone du professeur",
    "source": "telephone"
  },
  {
    "cle": "email_prestataire",
    "label": "E-mail du professeur",
    "source": "email"
  },
  {
    "cle": "taux_horaire_individuel",
    "label": "Taux horaire — cours individuels",
    "source": "taux_horaire_individuel"
  },
  {
    "cle": "taux_horaire_collectif",
    "label": "Taux horaire — cours collectifs",
    "source": "taux_horaire_collectif"
  },
  {
    "cle": "periode_versement",
    "label": "Périodicité du versement",
    "valeur_defaut": "à la fin de chaque mois"
  },
  {
    "cle": "ville_signature",
    "label": "Ville de signature",
    "valeur_defaut": "Antananarivo"
  },
  {
    "cle": "date_signature",
    "label": "Date de signature",
    "source": "date_du_jour"
  },
  {
    "cle": "etablissement_forme_juridique",
    "label": "Forme juridique de l'établissement",
    "source": "etablissement_forme_juridique"
  },
  {
    "cle": "etablissement_nif",
    "label": "NIF",
    "source": "etablissement_nif"
  },
  {
    "cle": "etablissement_stat",
    "label": "STAT",
    "source": "etablissement_stat"
  },
  {
    "cle": "etablissement_adresse",
    "label": "Adresse de l'établissement",
    "source": "etablissement_adresse"
  },
  {
    "cle": "etablissement_directrice",
    "label": "Nom de la directrice",
    "source": "etablissement_directrice"
  }
]$vars$::jsonb,
  actif = true
where id = '9109e134-daf5-40eb-b5ba-85e0b292a21c'
  and public_cible = 'professeur';

-- ─────────────────────────────────────────────────────────────────────────────
-- Modèle ÉTUDIANT — Convention de formation – Étudiant
-- ─────────────────────────────────────────────────────────────────────────────
-- Rempli automatiquement (17) : nom_etudiant, adresse_etudiant, telephone_etudiant, email_etudiant, langue_visee, type_programme, nombre_heures, rythme_hebdomadaire, date_debut_cours, date_echeance, prix_total, date_signature, etablissement_forme_juridique, etablissement_nif, etablissement_stat, etablissement_adresse, etablissement_directrice
-- Saisi à l'émission (5) : mention_representant_legal, delai_reservation, delai_annulation, delai_ponctualite, ville_signature
update public.contract_templates
set
  nom = $nom$Convention de formation – Étudiant$nom$,
  corps_template = $corps$La présente convention (ci-après également désignée par les « présentes ») est conclue entre les soussignées :

Hari Online Club, {{etablissement_forme_juridique}}, immatriculée sous le NIF {{etablissement_nif}} et le STAT {{etablissement_stat}}, dont le siège social est situé {{etablissement_adresse}}, représentée par {{etablissement_directrice}} en qualité de CEO, ci-après « l'Établissement »,

d'une part, et

{{nom_etudiant}}, domicilié(e) {{adresse_etudiant}}, téléphone {{telephone_etudiant}}, e-mail {{email_etudiant}}, ci-après « l'Étudiant » (ce terme désignant indifféremment un étudiant ou une étudiante),{{mention_representant_legal}}

d'autre part, ci-après désignés ensemble « les Parties ».

Dans la présente convention, le terme « professeur » désigne indifféremment un professeur ou une professeure.

Bienvenue chez Hari Online Club. Afin d'optimiser le déroulement de sa formation, l'Étudiant est invité à parcourir attentivement la présente convention, qui fait partie intégrante de son inscription. Pour toute question ou tout point non clarifié, l'Étudiant peut contacter l'équipe administrative, qui l'accompagne tout au long de son parcours d'apprentissage.

ARTICLE 1 — PROGRAMME SOUSCRIT
L'Étudiant s'inscrit à des cours de {{langue_visee}} dispensés à distance par l'Établissement, selon la formule {{type_programme}}.

Le programme comprend {{nombre_heures}} heures de cours, à raison d'un rythme de {{rythme_hebdomadaire}}, à compter du {{date_debut_cours}} et jusqu'au {{date_echeance}}.

Les séances sont assurées par un professeur affecté par l'Établissement, qui peut évoluer en cours de programme selon les nécessités pédagogiques ou d'organisation, l'Étudiant en étant préalablement informé.

ARTICLE 2 — AGENDA ET RESERVATION DES COURS
Cours individuels
Réservation : l'Étudiant réserve ses cours directement sur la plateforme Hari Online Club, au minimum {{delai_reservation}} à l'avance, parmi les créneaux disponibles.
Planning : à la suite de la réservation, la séance apparaît dans l'espace de l'Étudiant sur la plateforme Hari Online Club, avec la date, l'heure et le lien de connexion.
Confirmation : l'Étudiant confirme sa présence sur la plateforme au plus tard vingt-quatre (24) heures avant le début de chaque séance. Il lui appartient de suivre son planning et de confirmer ou de décliner ses séances. En cas d'indisponibilité, l'Étudiant décline la séance afin de libérer le créneau pour un autre étudiant.
Seules les séances programmées sur la plateforme ont lieu : sans séance programmée, il n'y a pas de cours. Les créneaux sont attribués dans l'ordre des réservations.

Cours collectifs
Les cours collectifs suivent un calendrier fixe, communiqué par l'Établissement avant le début de chaque vague et consultable sur la plateforme. L'Étudiant n'a pas de créneau à réserver : les séances ont lieu aux dates et heures prévues dans ce calendrier.

ARTICLE 3 — ANNULATION D'UNE SEANCE
Pour les cours individuels, toute annulation s'effectue sur la plateforme, au moins {{delai_annulation}} avant le début du cours.

En cas d'annulation tardive, d'absence ou de non-confirmation dans le délai de vingt-quatre (24) heures prévues à l'article 2, la séance est considérée comme effectuée et décomptée du forfait.

À titre exceptionnel, si l'Étudiant justifie d'un motif sérieux et dûment prouvé, le professeur peut accepter de reprogrammer la séance, sans y être tenu.

L'apprentissage d'une langue demandant de la continuité, des séances trop espacées nuisent à la progression : l'Établissement recommande un rythme régulier.

ARTICLE 4 — PAIEMENT
Les frais de cours doivent être payés intégralement avant le début de la formation, sous réserve de la facilité de paiement prévue au point 4. Le prix de la formule souscrite s'élève à {{prix_total}}.
L'accusé de réception du paiement, puis la facture, sont mis à disposition de l'Étudiant dans son espace sur la plateforme.
Modes de paiement acceptés : Mobile Money et virement bancaire domestique. Pour les étudiants résidant à l'étranger : Tap Tap Send, Emadex, Ria, Western Union ou Mobile Money. Les virements internationaux ne sont pas acceptés, sauf compte ouvert dans la même banque que l'Établissement, en raison des délais de traitement.
Facilité de paiement : le règlement peut être effectué en deux tranches pour les cours individuels d'un volume de quarante (40) heures et plus, ainsi que pour les cours collectifs. Les cours individuels d'un volume inférieur à quarante (40) heures sont payés en une seule fois.

Une lettre d'engagement, disponible sur la plateforme, précise le montant de chaque tranche, les dates de paiement et la durée du plan. Elle doit être complétée et signée électroniquement sur la plateforme avant le début de la formation, accompagnée d'une copie de la carte d'identité de l'Étudiant, déposée sur la plateforme ou remise à l'équipe administrative.

Une fois signé, cet engagement est ferme : même en cas d'arrêt ou d'abandon de la formation, les deux tranches restent dues, sans report ni annulation.

ARTICLE 5 — REMBOURSEMENT
Les heures de formation achetées sont personnelles et destinées à une seule personne. Elles ne peuvent être cédées, transférées, échangées ni utilisées par quelqu'un d'autre.

Un remboursement n'est possible que si la formation n'a pas commencé : si aucune séance n'a été suivie, l'Étudiant peut récupérer le montant payé.

Dès qu'une heure de formation a été utilisée, aucun remboursement, même partiel, n'est possible, quelle qu'en soit la raison.

ARTICLE 6 — SUPPORTS DE COURS ET PLATEFORME
L'Étudiant dispose d'un espace personnel sur la plateforme Hari Online Club. Tout y est regroupé : la réservation et l'annulation des cours, son planning, les liens de connexion aux cours, le suivi de ses heures restantes, les supports pédagogiques (leçons, exercices), ses reçus et factures, ainsi que la messagerie avec son professeur.
Cet espace donne accès aux leçons, aux exercices et à tout autre support pédagogique nécessaire à sa progression.
Les cours se tiennent sur Google Meet ; le lien de chaque séance est accessible directement depuis la plateforme. Tous les échanges écrits entre l'Étudiant et le professeur passent par la messagerie intégrée de la plateforme Hari Online Club (voir article 8).
Les supports pédagogiques sont concédés à l'Étudiant pour son seul usage personnel, à l'exclusion de toute reproduction, diffusion ou exploitation commerciale.

ARTICLE 7 — PONCTUALITÉ ET ENGAGEMENT
L'Étudiant se connecte au lien du cours à l'heure prévue. Sans réponse ni message de sa part dans les {{delai_ponctualite}} suivant le début du cours, la séance est annulée et considérée comme donnée.
Les mêmes règles s'appliquent au professeur. En cas de retard ou d'absence imprévus, chaque partie informe l'autre dès que possible. Si le professeur ne donne aucun préavis et ne rejoint pas la séance dans ce même délai, l'Étudiant peut considérer le cours comme annulé, sans décompte de son forfait.
En cas de manquement du professeur, l'Étudiant reçoit une séance bonus en compensation, sous réserve de disponibilité.
Tout réajustement de l'emploi du temps doit être signalé à l'équipe administrative.
En cas d'absence non justifiée pendant une période d'un (1) mois, la formation est automatiquement annulée, sans possibilité de remboursement ni de report.

ARTICLE 8 — CADRE PEDAGOGIQUE ET RELATION AVEC LES PROFESSEURS
Communication uniquement via la plateforme : toutes les communications entre l'Étudiant et le professeur passent exclusivement par la messagerie intégrée de la plateforme Hari Online Club. L'Étudiant et le professeur ne doivent en aucun cas échanger leurs numéros de téléphone, adresses e-mail personnelles, comptes de réseaux sociaux ou tout autre moyen de contact privé.
Consultation des échanges : afin de garantir la qualité du suivi pédagogique et le respect de la présente convention, l'Établissement peut consulter à tout moment les messages échangés entre l'Étudiant et le professeur sur la plateforme. En signant la présente convention, l'Étudiant reconnaît en être informé et l'accepte.
Contenu des échanges : les échanges entre l'Étudiant et le professeur se limitent strictement au cadre des cours, aux exercices, aux corrections et aux besoins pédagogiques liés à la formation. Toute communication d'ordre personnel est interdite.

IMPORTANT — INTERDICTION DE DÉTOURNER UN PROFESSEUR
Les professeurs intervenant chez Hari Online Club font partie intégrante de sa structure. Il est strictement interdit à l'Étudiant de détourner un professeur, c'est-à-dire de lui proposer, de lui demander ou d'accepter de sa part des cours privés, des services ou toute forme de collaboration directe en dehors de l'Établissement.
Rupture de contrat : si l'Établissement apprend qu'un Étudiant a détourné ou tenté de détourner un professeur, la présente convention est rompue immédiatement, sans remboursement des heures restantes, et l'accès aux cours, à la plateforme et aux supports est suspendu.
Conséquences pour le professeur : un tel manquement pénalise aussi lourdement le professeur concerné, et peut entraîner la rupture de l'ensemble des contrats en cours entre l'Établissement et ce professeur. Par respect pour les professeurs qui l'accompagnent, l'Étudiant s'engage à ne jamais proposer ni accepter ce type d'arrangement. Si un professeur lui fait une telle proposition, l'Étudiant en informe l'équipe administrative.
Demandes administratives : toute demande relative aux horaires, aux changements de planning, aux paiements, aux reports ou à tout autre besoin administratif passe obligatoirement par l'équipe administrative de l’établissement, afin de garantir une organisation claire et une bonne coordination entre étudiants et professeurs.

ARTICLE 9 — OBLIGATIONS DE L'ÉTABLISSEMENT
L'Établissement s'engage à mettre à disposition un professeur qualifié, un accès fonctionnel à la plateforme et aux supports, ainsi qu'un suivi régulier de la progression pédagogique de l'Étudiant.

ARTICLE 10 — DONNEES PERSONNELLES
Les données personnelles de l'Étudiant sont traitées par l'Établissement aux seules fins de gestion de son inscription et de son suivi pédagogique. Les messages échangés sur la plateforme sont conservés et peuvent être consultés par l'Établissement dans les conditions prévues à l'article 8. L'Étudiant dispose d'un droit d'accès, de rectification et d'effacement de ses données, qu'il peut exercer auprès de l'Établissement.

Lorsque l'Étudiant est mineur, son représentant légal consent, en cette qualité, au traitement de ses données personnelles.

ARTICLE 11 – REGLEMENT DES LITIGES – LOI APPLICABLE
La présente convention est soumise aux dispositions légales et règlementaires en vigueur à Madagascar.
Les Parties s’engagent à régler à l’amiable tout litige ou différend pouvant survenir à l’occasion de l’exécution ou de l’interprétation de la présente convention. En cas d’échec des procédures de règlement à l’amiable, tout litige sera porté devant les Tribunaux compétentes d’Antananarivo.

ARTICLE 12 — DISPOSITIONS DIVERSES ET SIGNATURE
La présente convention, procédure comprise, exprime l'intégralité de l'accord des Parties. Toute modification fait l'objet d'un accord écrit.

Elle est signée électroniquement depuis les espaces respectifs des Parties sur la plateforme, cette signature valant accord ferme et définitif.
Conformément aux articles 272.1 et 276.1 de la Loi n° 66-003 du 2 juillet 1966 relative à la Théorie Générale des Obligations, modifiée et complétée par la Loi n° 2015-036 du 8 décembre 2015, le contrat signé sous forme électronique ou numérisé (scanné) et transmis par voie électronique à l’Établissement vaut preuve du consentement du Client et l’engage au même titre qu’un contrat signé sur support papier.

Si des circonstances exceptionnelles surviennent, l'Étudiant est invité à en informer l'Établissement afin que des dispositions appropriées puissent être prises.

Fait à {{ville_signature}}, le {{date_signature}}.

Pour l'Établissement — {{etablissement_directrice}}, CEO de Hari Online Club
L'Étudiant (ou son représentant légal) — {{nom_etudiant}}
Mention « Lu et approuvé » :
$corps$,
  variables_disponibles = $vars$[
  {
    "cle": "nom_etudiant",
    "label": "Nom et prénom de l'étudiant",
    "source": "nom_complet"
  },
  {
    "cle": "adresse_etudiant",
    "label": "Adresse de l'étudiant",
    "source": "adresse"
  },
  {
    "cle": "telephone_etudiant",
    "label": "Téléphone de l'étudiant",
    "source": "telephone"
  },
  {
    "cle": "email_etudiant",
    "label": "E-mail de l'étudiant",
    "source": "email"
  },
  {
    "cle": "mention_representant_legal",
    "label": "Mention du représentant légal si l'étudiant est mineur"
  },
  {
    "cle": "langue_visee",
    "label": "Langue suivie",
    "source": "langue_programme"
  },
  {
    "cle": "type_programme",
    "label": "Type de programme",
    "source": "type_programme_label"
  },
  {
    "cle": "nombre_heures",
    "label": "Nombre d'heures du programme",
    "source": "heures_programme"
  },
  {
    "cle": "rythme_hebdomadaire",
    "label": "Rythme hebdomadaire convenu",
    "source": "rythme_programme"
  },
  {
    "cle": "date_debut_cours",
    "label": "Date de début des cours",
    "source": "date_debut_programme"
  },
  {
    "cle": "date_echeance",
    "label": "Échéance du programme",
    "source": "date_echeance_programme"
  },
  {
    "cle": "prix_total",
    "label": "Prix total de la formule",
    "source": "montant_programme"
  },
  {
    "cle": "delai_reservation",
    "label": "Délai minimum de réservation",
    "valeur_defaut": "48 heures"
  },
  {
    "cle": "delai_annulation",
    "label": "Délai minimum d'annulation",
    "valeur_defaut": "24 heures"
  },
  {
    "cle": "delai_ponctualite",
    "label": "Délai de ponctualité",
    "valeur_defaut": "15 minutes"
  },
  {
    "cle": "ville_signature",
    "label": "Ville de signature",
    "valeur_defaut": "Antananarivo"
  },
  {
    "cle": "date_signature",
    "label": "Date de signature",
    "source": "date_du_jour"
  },
  {
    "cle": "etablissement_forme_juridique",
    "label": "Forme juridique de l'établissement",
    "source": "etablissement_forme_juridique"
  },
  {
    "cle": "etablissement_nif",
    "label": "NIF",
    "source": "etablissement_nif"
  },
  {
    "cle": "etablissement_stat",
    "label": "STAT",
    "source": "etablissement_stat"
  },
  {
    "cle": "etablissement_adresse",
    "label": "Adresse de l'établissement",
    "source": "etablissement_adresse"
  },
  {
    "cle": "etablissement_directrice",
    "label": "Nom de la directrice",
    "source": "etablissement_directrice"
  }
]$vars$::jsonb,
  actif = true
where id = '834c2449-8137-4538-a2a2-7ca6ad7dcbb7'
  and public_cible = 'etudiant';

commit;
