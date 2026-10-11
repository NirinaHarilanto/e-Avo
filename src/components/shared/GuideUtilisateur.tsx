import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AdminLayout } from '../layout/AdminLayout'
import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { EtudiantLayout } from '../layout/EtudiantLayout'
import { EnTetePage } from '../ui/EnTetePage'

type EspaceGuide = 'admin' | 'professeur' | 'etudiant'

interface Rubrique {
  titre: string
  lien?: string
  points: ReactNode[]
}

/* Contenu du guide, rubrique par rubrique, dans l'ordre du menu de chaque espace. Écrit en
   données pour qu'ajouter une page à un espace se traduise par une entrée de plus ici. */
const RUBRIQUES: Record<EspaceGuide, Rubrique[]> = {
  etudiant: [
    {
      titre: 'Premiers pas',
      points: [
        <>Connectez-vous avec votre adresse e-mail. À la première connexion, l’application vous invite à choisir votre mot de passe.</>,
        <>Le menu de gauche (ou le bouton ☰ sur téléphone) donne accès à toutes les rubriques de votre espace.</>,
        <>La cloche en haut de l’écran regroupe vos notifications : séance reprogrammée, contrat à signer, facture disponible, fin de forfait…</>,
      ],
    },
    {
      titre: 'Mon dossier',
      lien: '/mon-espace',
      points: [
        <>Quatre encadrés résument votre situation : heures suivies sur votre forfait, assiduité, prochaine séance (avec le lien <strong>Rejoindre la visio</strong>) et niveau évalué.</>,
        <>L’onglet <strong>Parcours pédagogique</strong> liste vos séances et votre présence. Après une séance terminée, <strong>Donner votre avis</strong> ouvre une courte enquête : note du cours, pédagogie, commentaire.</>,
        <>L’onglet <strong>Forfait</strong> donne vos heures restantes et son échéance. <strong>Demander un forfait supplémentaire</strong> envoie la demande à l’administration, qui la valide après paiement.</>,
        <>En cours collectif, l’encadré <strong>Ma classe</strong> affiche votre professeur, vos camarades et le planning de votre classe ; c’est l’onglet <strong>Programme</strong> qui remplace alors le forfait.</>,
      ],
    },
    {
      titre: 'Mon agenda',
      lien: '/mon-espace/agenda',
      points: [
        <>
          Vos cours de la semaine, heure par heure, avec vos rendez-vous et les invitations de l’administration.
          Cliquez sur un cours à venir pour voir son détail et le bouton <strong>Rejoindre le cours</strong> :
          Google Meet pour un cours individuel ou en duo, Jitsi (sans compte à créer) pour un cours collectif.
        </>,
        <>
          L’invitation d’un cours vous est envoyée par <strong>votre professeur</strong>, depuis son propre agenda
          Google : c’est son adresse que vous verrez comme organisateur. Pour un cours sur Google Meet, ouvrez le lien
          en étant connecté à l’adresse qui a reçu l’invitation, vous entrerez directement.
        </>,
        <>Sur un cours déjà donné, la fiche montre votre présence, le compte rendu du professeur et l’avis que vous avez laissé.</>,
        <>Un changement d’horaire apparaît aussitôt, accompagné d’une notification ; une séance annulée ou reportée disparaît simplement de l’agenda.</>,
      ],
    },
    {
      titre: 'Mes documents',
      lien: '/mon-espace/documents',
      points: [
        <>Vos supports de cours, vos notes et les communications de HOC, rangés en dossiers que vous créez librement. Un dépôt accepte PDF, image ou .docx, jusqu’à 20 Mo.</>,
        <>Les documents que votre professeur ou l’administration vous transmet arrivent dans « Mes fichiers partagés », avec le nom de l’expéditeur.</>,
        <>Plus bas, les comptes rendus de séance rédigés par votre professeur (objectif, ce qui a été vu, points à améliorer, progrès, remarques), en lecture seule.</>,
      ],
    },
    {
      titre: 'Messages',
      lien: '/mon-espace/messages',
      points: [
        <><strong>Nouveau message</strong> ouvre l’annuaire de HOC : choisissez un ou plusieurs destinataires, un objet, puis envoyez.</>,
        <>Planning, absence, paiement : écrivez à l’<strong>Administration</strong>. Contenu d’un cours : écrivez à votre <strong>professeur</strong>.</>,
        <>Les onglets séparent les messages reçus (compteur de non lus) des envoyés ; un message s’ouvre pour y répondre ou le supprimer.</>,
      ],
    },
    {
      titre: 'Mes paiements',
      lien: '/mon-espace/paiements',
      points: [
        <>Vos factures d’un côté, vos reçus de l’autre. Chaque document peut être <strong>vu</strong>, <strong>imprimé</strong> ou <strong>téléchargé en PDF</strong>.</>,
        <>Le paiement en plusieurs fois n’est possible que pour les forfaits de 40 heures ou plus.</>,
        <>Aucun règlement ne se fait depuis cette page : elle sert au suivi. Les paiements se font auprès de votre établissement.</>,
      ],
    },
    {
      titre: 'Mes contrats',
      lien: '/mon-espace/contrats',
      points: [
        <>Ouvrez le contrat avec <strong>Voir / Imprimer</strong>, lisez-le, puis signez-le en un clic avec <strong>Je signe</strong>. Si vous avez déposé une image de signature dans « Mon profil », elle apparaît sur le contrat.</>,
        <>Le bas de chaque ligne suit les signatures : l’établissement, la vôtre, celle de votre binôme en duo. Posez vos questions avant de signer — une signature ne se retire pas depuis votre espace.</>,
      ],
    },
    {
      titre: 'Mon profil',
      lien: '/mon-espace/profil',
      points: [<>Vos coordonnées et votre image de signature. Tenez-les à jour : elles servent à préparer vos contrats et vos factures.</>],
    },
  ],
  professeur: [
    {
      titre: 'Premiers pas',
      points: [
        <>Connectez-vous avec l’adresse e-mail communiquée à HOC ; à la première connexion, choisissez votre mot de passe.</>,
        <>Tant que votre intégration n’est pas terminée, votre fiche porte le statut « En phase d’intégration » : commencez par signer votre contrat dans « Mes contrats ».</>,
        <>La cloche en haut de l’écran regroupe vos notifications (séance modifiée, nouveau document, TimeSheet validé…).</>,
      ],
    },
    {
      titre: 'Agenda',
      lien: '/professeur/calendrier',
      points: [
        <>Trois vues de la même semaine : <strong>Agenda</strong>, <strong>Liste</strong> et <strong>Planning prévisionnel</strong>. L’encadré « À clôturer » compte vos séances passées restées planifiées.</>,
        <>Cliquez un créneau libre, ou <strong>Créer un rendez-vous</strong> : une <strong>séance de cours</strong> (décompte les heures) ou un rendez-vous <strong>autre</strong> (sans effet sur les heures). Plusieurs élèves en font une séance collective, aucun participant bloque le créneau pour vous.</>,
        <>Cliquez sur une séance pour la <strong>reprogrammer</strong> (justificatif obligatoire, effet immédiat, sans validation préalable) ou l’<strong>annuler</strong>. Les élèves concernés et l’administration sont prévenus automatiquement.</>,
        <>Après le cours, notez la présence puis <strong>clôturez la séance</strong> : les heures sont décomptées du forfait de l’élève et créditées sur votre compteur. Rédigez ensuite le compte rendu (objectif, a été vu, points à améliorer, progrès, remarques), visible par l’élève et l’administration.</>,
        <>L’onglet Planning prévisionnel génère d’un coup toutes les séances d’un forfait, par exemple tous les mardis à 18 h jusqu’à son terme.</>,
      ],
    },
    {
      titre: 'Mes étudiants et Cours collectifs',
      lien: '/professeur/etudiants',
      points: [
        <>La liste de vos élèves actuels et anciens, chaque nom portant son programme (Collectif, INDIV, DUO) et l’état de son contrat. Le dossier donne niveau, forfait, heures et informations personnelles, en lecture seule.</>,
        <><strong>Résumer les comptes rendus</strong>, en haut du dossier, condense d’un clic tous vos comptes rendus avec cet élève : compétences travaillées, progression, points à améliorer.</>,
        <><strong>Cours collectifs</strong> : vos classes de niveau, leurs élèves et leur créneau. « Planning de la classe » génère toutes les séances du groupe ; la composition de la classe, elle, est décidée par l’administration.</>,
      ],
    },
    {
      titre: 'Mes heures et TimeSheet',
      lien: '/professeur/heures',
      points: [
        <>Vos heures enseignées, élève par élève. Seules les séances <strong>clôturées</strong> y comptent — une séance collective vaut une heure, quel que soit le nombre d’élèves.</>,
        <>La section <strong>TimeSheet</strong> rassemble les heures clôturées, non payées et pas encore déclarées sur une période : vérifiez-les, puis cliquez sur <strong>Envoyer pour validation</strong>.</>,
        <>Chaque envoi se suit ensuite au statut Soumis, Validé ou Refusé (avec son motif). Une fois validé, le TimeSheet devient votre facture de rémunération, visible dans « Mes factures ».</>,
      ],
    },
    {
      titre: 'Documents et Messages',
      lien: '/professeur/documents',
      points: [
        <>Vos supports, rangés en dossiers (PDF, image ou .docx, 20 Mo maximum). Partagez un document avec un élève en un clic : il le retrouve dans son espace, section « Mes fichiers partagés », avec votre nom.</>,
        <>Plus bas, tous vos comptes rendus de séance et les supports que vous y avez joints.</>,
        <><strong>Messages</strong> : écrivez à l’administration, à un collègue ou à un élève. Chaque destinataire reçoit son propre message et vous répond sans que les autres soient en copie.</>,
      ],
    },
    {
      titre: 'Mes factures et Mes contrats',
      lien: '/professeur/factures',
      points: [
        <>Vos factures de rémunération, émises à la validation de vos TimeSheets : voir, imprimer, télécharger en PDF.</>,
        <>Vos contrats à lire avec « Voir / Imprimer », puis à signer avec « Je signe ». La signature du contrat est constatée automatiquement comme première étape de votre intégration.</>,
      ],
    },
    {
      titre: 'Mon profil',
      lien: '/professeur/mon-profil',
      points: [
        <>Vos coordonnées et votre image de signature, utilisée sur vos contrats.</>,
        <>
          <strong>Mon agenda Google</strong> : connectez votre compte Gmail. Il est à la fois lu et écrit — vos
          événements Google apparaissent dans votre agenda HOC, et ce que vous y faites part aussitôt sur Google.
          Surtout, c’est <strong>depuis votre compte</strong> que seront créées les réunions de vos cours : vos élèves
          reçoivent l’invitation de votre adresse, et vous restez l’organisateur. Sur l’écran Google, cochez bien la
          permission de <strong>modification des événements</strong>, sans quoi la connexion reste en lecture seule.
        </>,
      ],
    },
  ],
  admin: [
    {
      titre: 'Pédagogie : du prospect à l’étudiant',
      lien: '/admin/prospects',
      points: [
        <><strong>Prospects</strong> : tableau des candidats, de la demande d’appel diagnostic à la conversion. Renseignez la trame du diagnostic, le forfait choisi, l’éventuelle séance d’essai (1 à 3 h, facturée au tarif horaire de son programme), puis le paiement — un acompte suffit — avant de convertir.</>,
        <><strong>Agenda</strong> : demandes d’appel diagnostic à valider et rendez-vous de l’administration, dans une seule vue hebdomadaire. Les cours professeur ↔ élève n’y figurent pas : ils sont dans « Séances &amp; visio ».</>,
        <><strong>Étudiants</strong> : dossiers complets (parcours, informations, professeur, forfait et planning). Changement de professeur, forfait supplémentaire, décision après l’essai, mise en pause et suppression se font ici. Chaque nom porte son programme et l’état de son contrat.</>,
        <><strong>Cours collectifs</strong> : quatre onglets — Vagues et leurs classes de niveau, Suivi des candidats (le tableau personne par personne), Session orale, Quiz de positionnement.</>,
      ],
    },
    {
      titre: 'Le parcours d’un cours collectif',
      lien: '/admin/vagues',
      points: [
        <>Une <strong>vague</strong> (promotion) se scinde en <strong>classes de niveau</strong> (Beginner, Intermediate, Advanced), chacune avec son créneau et son professeur. L’attribution d’un professeur en collectif se fait <strong>uniquement</strong> sur la ligne d’une classe, onglet Vagues ; ailleurs, le bouton reste grisé.</>,
        <>Une classe accueille <strong>3 à 7 élèves</strong> : en dessous de 3 ne démarrez pas ses cours, à 7 les inscriptions sont refusées — ouvrez une seconde classe du même niveau.</>,
        <>Un candidat réserve une <strong>session de test oral</strong> depuis la page publique et valide sa place en répondant au <strong>quiz de positionnement</strong>, qui estime son niveau. Vous l’arrêtez définitivement au test oral, puis convertissez le candidat — toujours après avoir enregistré ses <strong>frais d’inscription</strong>, repris du tarif Collectif de son niveau.</>,
        <><strong>Fin de parcours</strong> : une fois toutes les heures de sa vague consommées, ouvrez sa fiche dans « Suivi des candidats » et cliquez <strong>Évaluer l’étudiant</strong> — nouvelle vague, nouvelle classe, niveau à jour, précédés là encore des frais d’inscription du nouveau niveau.</>,
        <><strong>Rythme officiel</strong> : 32 séances sur lundi, mardi, jeudi et vendredi (jamais mercredi, samedi ni dimanche) ; un jour férié ne compte pas dans les 32. Trois semaines de pause entre deux vagues, aucun cours en juillet-août ni du 22 décembre au 3 janvier.</>,
      ],
    },
    {
      titre: 'Pédagogie : professeurs et séances',
      lien: '/admin/professeurs',
      points: [
        <><strong>Recrutement</strong> : candidatures reçues depuis le bouton « Rejoignez-nous » de la vitrine. Faites avancer chaque candidat : pré-sélection, tests (C1 minimum), simulation de cours, puis intégration. Le compte professeur est créé automatiquement à l’entrée en intégration.</>,
        <><strong>Professeurs</strong> : équipe enseignante, taux horaire, élèves et satisfaction. Un professeur en intégration porte ce statut jusqu’à la fin de sa checklist.</>,
        <><strong>Séances & visio</strong> : planning de tous les cours. Toute création, reprogrammation ou annulation faite par un professeur vous est notifiée. C’est ici que vous suivez les emplois du temps de toute l’équipe : les invitations des cours partent de l’agenda Google du professeur, vous n’en recevez donc pas de copie dans votre boîte sauf si l’on vous ajoute aux participants.</>,
        <><strong>Heures & forfaits</strong> : compteurs d’heures suivies et enseignées.</>,
      ],
    },
    {
      titre: 'Gestion',
      lien: '/admin/paiements',
      points: [
        <><strong>Documents</strong> : pièces des élèves et des professeurs, documents partageables, comptes rendus de séance et documents confidentiels (visibles des seules personnes que vous y ajoutez).</>,
        <><strong>Messages</strong> : la messagerie interne, et les 22 modèles d’e-mails du parcours apprenant. Un modèle relu part au choix <strong>en interne</strong> (dans l’espace des destinataires) ou <strong>via Gmail</strong>, depuis votre propre boîte.</>,
        <><strong>Paiements</strong> : encaissements des élèves (acomptes réservés aux forfaits de 40 h et plus) et rémunérations des professeurs. L’onglet <strong>TimeSheets</strong> reçoit les relevés d’heures envoyés par les professeurs : les valider crée d’un coup leur rémunération et leur facture.</>,
        <><strong>Facturation</strong> : devis, factures et reçus. Chaque document se voit, s’imprime et se télécharge en PDF.</>,
        <><strong>Contrats</strong> : modèles et contrats. Pour un cours collectif, choisissez la classe : chaque élève reçoit son propre contrat. Votre signature et le tampon de l’établissement y accompagnent la mention « Lu et approuvé ».</>,
        <><strong>Tarifs</strong> : la grille affichée sur la vitrine. Deux montants en sont relus ailleurs — la séance d’essai (tarif d’1 h du programme) et les frais d’inscription en collectif (tarif Collectif portant le nom du niveau) : renommer ces lignes rompt le rapprochement.</>,
        <>
          <strong>Paramètres</strong> : réglages de l’établissement et agendas Google. Le compte de l’établissement
          porte les rendez-vous de l’administration (appels diagnostic, créneaux de test) ; les cours, eux, partent du
          compte Google de chaque professeur. Le service de visioconférence ne change pas : Google Meet pour
          l’individuel et le duo, Jitsi pour le collectif. La section <strong>Agendas Google des professeurs</strong>{' '}
          montre qui a connecté le sien et qui reste à relancer.
        </>,
        <><strong>Profil HOC</strong> : identité administrative reprise sur vos documents, tampon, votre signature et l’équipe d’administrateurs — tous avec exactement les mêmes droits. Vos coordonnées personnelles sont dans <strong>Profils admin</strong>.</>,
      ],
    },
  ],
}

const INTRO: Record<EspaceGuide, string> = {
  etudiant: 'Tout ce qu’il faut savoir pour suivre vos cours, vos heures, vos documents et vos paiements avec Hari Online Club.',
  professeur: 'Comment planifier vos cours, les clôturer, rédiger vos comptes rendus et faire valider vos heures.',
  admin: 'Le fonctionnement de chaque section de l’espace d’administration.',
}

export function GuideUtilisateur({ espace }: { espace: EspaceGuide }) {
  const contenu = (
    <>
      <EnTetePage titre="Guide d’utilisation" description={INTRO[espace]} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {RUBRIQUES[espace].map((rubrique, index) => (
          <details key={rubrique.titre} open={index === 0} className="card" style={{ padding: '14px 18px' }}>
            <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)' }}>{rubrique.titre}</summary>
            <ul style={{ margin: '12px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rubrique.points.map((point, i) => (
                <li key={i} style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)' }}>
                  {point}
                </li>
              ))}
            </ul>
            {rubrique.lien && (
              <Link to={rubrique.lien} style={{ display: 'inline-block', marginTop: 10, fontSize: 12.5, fontWeight: 700, color: 'var(--accent-blue)' }}>
                Ouvrir cette rubrique →
              </Link>
            )}
          </details>
        ))}
      </div>
    </>
  )

  if (espace === 'admin') return <AdminLayout actif="Guide d’utilisation">{contenu}</AdminLayout>
  if (espace === 'professeur') return <ProfesseurLayout actif="Guide d’utilisation">{contenu}</ProfesseurLayout>
  return <EtudiantLayout actif="Guide d’utilisation">{contenu}</EtudiantLayout>
}
