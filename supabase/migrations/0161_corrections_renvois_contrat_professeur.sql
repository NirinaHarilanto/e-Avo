-- Cinq renvois internes faux repérés dans le contrat professeur déposé par 0160, remontés
-- par le client (2026-11-10) à la relecture de l'aperçu généré. Corrigés un par un, en relisant
-- à chaque fois où se trouve réellement le contenu visé par le renvoi :
--
--   1. Titre de l'article 09 : « CLAUDE DE NON-CONCURRENCE » -> « CLAUSE DE NON-CONCURRENCE »
--      (coquille de saisie du document source).
--   2. Article 04 (obligations du Professeur), « mener à terme chaque formation [...] dans les
--      conditions prévues à l'article 9 » -> article 3, qui est l'article qui détaille
--      effectivement ces conditions (transfert d'élève, arrêt pour motif valable, préavis).
--      L'article 9 traite de la non-concurrence, sans rapport.
--   3. Article 05 (obligations de la Cliente), « sous réserve de la pénalité prévue à
--      l'article 8 » -> l'article 8 porte sur le détournement d'étudiants, aucune pénalité de
--      paiement n'y est définie. Le seul mécanisme du contrat qui réduit la somme due au
--      Professeur en fonction de la qualité des prestations est la clause de déduction de
--      l'article 6 (« le Client se réservera le droit de procéder à toute déduction des sommes
--      pouvant être dues au Prestataire ») : c'est elle que ce renvoi visait selon toute
--      vraisemblance, reformulé en « déduction » plutôt que « pénalité » puisque l'article 6
--      n'emploie pas ce mot — à confirmer par le client, qui reste seul juge du sens voulu ici.
--   4. Article 10 (sanctions), « manquement aux articles 6 ou 7 » -> articles 8 ou 9, qui sont
--      les deux articles visés (détournement, non-concurrence) ; les articles 6 et 7 traitent
--      des modalités financières et des absences, sans rapport avec cette section.
--   5. Article 12 (pénalités et responsabilité), « les sanctions prévues à l'article 8 »
--      -> article 10, qui est l'article qui énonce réellement ces sanctions (rupture immédiate,
--      pénalité forfaitaire, exclusion définitive, action en justice).
--
-- Seul le texte est touché, aucune variable : `variables_disponibles` reste identique à 0160.
-- Les contrats déjà émis depuis 0160 (aucun à ce jour pour ce modèle) ne sont pas concernés —
-- `contracts.corps_genere` est figé à l'émission.

begin;

update public.contract_templates
set corps_template = $corps$Le présent contrat (ci-après également désigné par les « présentes ») est conclu entre les soussignées :

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
Mener à terme chaque formation qu'il accepte, dans les conditions prévues à l'article 3.
En cas d'annulation ou d'impossibilité d'assurer un cours, informer l'étudiant via la messagerie intégrée de la plateforme Hari Online Club, en précisant la raison de l'annulation ou de l'absence, et prévenir Hari Online Club dans les meilleurs délais.
Communiquer avec les étudiants uniquement via la messagerie intégrée de la plateforme Hari Online Club. Il est interdit d'échanger avec un étudiant son numéro de téléphone, son adresse e-mail personnelle, ses comptes de réseaux sociaux ou tout autre moyen de contact privé.
Autoriser que Hari Online Club puisse consulter à tout moment les messages échangés avec les étudiants sur la plateforme, afin de garantir la qualité du suivi pédagogique et le respect du présent contrat. Ces messages seront conservés par Hari Online Club.
Disposer d'une connexion Internet stable et de qualité permettant d'assurer correctement les cours en ligne.
Respecter les interdictions de détournement et d'activité concurrente prévues dans le présent contrat.

ARTICLE 05 — OBLIGATIONS DE LA CLIENTE
La Cliente s'engage à :
Régler les sommes dues au Professeur dans les délais convenus, sous réserve de la déduction prévue à l'article 6.
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

ARTICLE 09 — CLAUSE DE NON-CONCURRENCE - INTERDICTION D'ACTIVITE CONCURRENTE EN LIGNE
En contrepartie des sommes versées par la Cliente, pendant toute la durée et pendant une période d’un an après la résiliation de celui-ci, quelle qu’en soit la cause, il est interdit au Professeur d’accepter ou réaliser des prestations directe ou indirecte avec les activités de HOC.

A ce titre, pendant toute la durée de sa collaboration avec Hari Online Club, le Professeur s'interdit de créer, gérer ou promouvoir, en son nom ou sous un autre nom, toute page, compte, groupe ou profil sur les réseaux sociaux, site internet ou autre support présentant ou proposant une activité de cours d'anglais en ligne, ou indiquant qu'il donne des cours d'anglais en ligne à titre personnel. Une telle activité est en concurrence directe avec Hari Online Club.

Si le Professeur disposait déjà d'une telle activité avant la signature du présent contrat, il doit la déclarer par écrit à Hari Online Club avant la signature. À défaut, il est réputé ne pas en avoir.

ARTICLE 10 — SANCTIONS EN CAS DE DETOURNEMENT OU D'ACTIVITE CONCURRENTE
Si Hari Online Club constate un manquement aux articles 8 ou 9, y compris lorsqu'une telle activité est ouverte en cours de collaboration, les sanctions suivantes s'appliquent après notification écrite du manquement au Professeur :
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

Tout acte de détournement de clientèle, de sollicitation d'un étudiant, d'activité concurrente, de divulgation d'informations confidentielles ou d'abandon de formation sans motif valable est considéré comme un manquement grave. Les sanctions prévues à l'article 10 s'appliquent sans préjudice de toute autre demande de dommages et intérêts.

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
$corps$
where id = '9109e134-daf5-40eb-b5ba-85e0b292a21c'
  and public_cible = 'professeur';

commit;
