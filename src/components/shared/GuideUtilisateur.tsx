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
        <>Vous y trouvez votre professeur, votre programme (individuel, duo ou collectif), votre niveau et vos heures : suivies, restantes, forfait en cours.</>,
        <>L’onglet Parcours pédagogique liste vos séances passées et à venir. Après chaque cours, le bouton <strong>Donner votre avis</strong> vous permet de noter la séance.</>,
        <>Quand votre forfait arrive à son terme, vous pouvez demander un forfait supplémentaire depuis votre dossier ; l’administration le valide après paiement.</>,
      ],
    },
    {
      titre: 'Mon agenda',
      lien: '/mon-espace/agenda',
      points: [
        <>Vos cours de la semaine, heure par heure. Cliquez sur un cours pour voir son détail et le lien de visioconférence Google Meet.</>,
        <>Un changement d’horaire décidé par votre professeur ou l’administration apparaît aussitôt, accompagné d’une notification.</>,
      ],
    },
    {
      titre: 'Mes documents',
      lien: '/mon-espace/documents',
      points: [
        <>Vos supports de cours, vos notes et les communications de HOC, rangés en dossiers.</>,
        <>Les comptes rendus de séance rédigés par votre professeur (objectif, ce qui a été vu, points à améliorer, progrès, remarques) s’y trouvent aussi.</>,
        <>Les documents que votre professeur vous partage apparaissent dans « Mes fichiers partagés », avec le nom de l’expéditeur.</>,
      ],
    },
    {
      titre: 'Mes paiements',
      lien: '/mon-espace/paiements',
      points: [
        <>Vos factures et reçus. Chaque document peut être <strong>vu</strong>, <strong>imprimé</strong> ou <strong>téléchargé en PDF</strong>.</>,
        <>Le paiement en plusieurs fois n’est possible que pour les forfaits de 40 heures ou plus.</>,
      ],
    },
    {
      titre: 'Mes contrats',
      lien: '/mon-espace/contrats',
      points: [
        <>Lisez le contrat envoyé par HOC, puis signez-le en un clic. Si vous avez déposé une image de signature dans « Mon profil », elle apparaît sur le contrat.</>,
      ],
    },
    {
      titre: 'Mon profil',
      lien: '/mon-espace/profil',
      points: [<>Vos coordonnées et votre signature. Pensez à les tenir à jour : elles servent à préparer vos contrats et factures.</>],
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
      titre: 'Calendrier',
      lien: '/professeur/calendrier',
      points: [
        <>L’onglet Agenda montre votre semaine. Cliquez sur un créneau libre pour planifier une séance (cours) ou un autre rendez-vous (sans effet sur les heures).</>,
        <>Cliquez sur une séance pour la <strong>reprogrammer</strong> (justificatif obligatoire) ou l’<strong>annuler</strong>. Les élèves concernés et l’administration sont prévenus automatiquement.</>,
        <>Après le cours, <strong>clôturez la séance</strong> : les heures sont décomptées du forfait de l’élève et créditées sur votre compteur. Rédigez ensuite le compte rendu (objectif, a été vu, points à améliorer, progrès, remarques).</>,
        <>L’onglet Planning prévisionnel permet de générer d’un coup toutes les séances d’un forfait.</>,
      ],
    },
    {
      titre: 'Mes étudiants et Cours collectifs',
      lien: '/professeur/etudiants',
      points: [
        <>La liste de vos élèves actuels (et anciens élèves), avec leur dossier : niveau, forfait, heures, informations personnelles en lecture seule.</>,
        <>Cours collectifs : vos classes de niveau et leurs élèves.</>,
      ],
    },
    {
      titre: 'Mes heures et TimeSheet',
      lien: '/professeur/heures',
      points: [
        <>Vos heures enseignées, élève par élève.</>,
        <>La section <strong>TimeSheet</strong> rassemble les heures clôturées et non encore payées sur une période : vérifiez-les, puis cliquez sur <strong>Envoyer pour validation</strong>.</>,
        <>L’administration reçoit votre TimeSheet sous forme de facture. Une fois validé, il devient votre facture de rémunération, visible dans « Mes factures ».</>,
      ],
    },
    {
      titre: 'Documents',
      lien: '/professeur/documents',
      points: [<>Vos supports, rangés en dossiers. Partagez un document avec un élève en un clic : il le retrouve dans son espace, avec votre nom.</>],
    },
    {
      titre: 'Mes factures et Mes contrats',
      lien: '/professeur/factures',
      points: [
        <>Vos factures de rémunération : voir, imprimer, télécharger en PDF.</>,
        <>Vos contrats à lire et signer.</>,
      ],
    },
    {
      titre: 'Mon profil',
      lien: '/professeur/mon-profil',
      points: [<>Vos coordonnées et votre image de signature, utilisée sur vos contrats.</>],
    },
  ],
  admin: [
    {
      titre: 'Pédagogie : du prospect à l’étudiant',
      lien: '/admin/prospects',
      points: [
        <><strong>Prospects</strong> : tableau des candidats, de la demande d’appel diagnostic à la conversion. Renseignez la trame du diagnostic, le forfait choisi, l’éventuelle séance d’essai (1 à 3 h, facturée à l’heure), puis le paiement avant de convertir.</>,
        <><strong>Agenda</strong> : demandes d’appel et rendez-vous (prospects, étudiants, professeurs) dans une seule vue hebdomadaire.</>,
        <><strong>Étudiants</strong> : dossiers complets (parcours, informations, professeur, forfait et planning). Changement de professeur, forfait supplémentaire, décision après l’essai, mise en pause et suppression se font ici.</>,
        <><strong>Cours collectifs</strong> : vagues, classes de niveau, sessions de test oral et quiz de positionnement.</>,
      ],
    },
    {
      titre: 'Pédagogie : professeurs et séances',
      lien: '/admin/professeurs',
      points: [
        <><strong>Recrutement</strong> : candidatures reçues depuis le bouton « Rejoignez-nous » de la vitrine. Faites avancer chaque candidat : pré-sélection, tests (C1 minimum), simulation de cours, puis intégration. Le compte professeur est créé automatiquement à l’entrée en intégration.</>,
        <><strong>Professeurs</strong> : équipe enseignante, taux horaire, élèves et satisfaction. Un professeur en intégration porte ce statut jusqu’à la fin de sa checklist.</>,
        <><strong>Séances & visio</strong> : planning de tous les cours. Toute création, reprogrammation ou annulation faite par un professeur vous est notifiée.</>,
        <><strong>Heures & forfaits</strong> : compteurs d’heures suivies et enseignées.</>,
      ],
    },
    {
      titre: 'Gestion',
      lien: '/admin/paiements',
      points: [
        <><strong>Documents</strong> : pièces et comptes rendus de séance.</>,
        <><strong>Paiements</strong> : encaissements des élèves (acomptes réservés aux forfaits de 40 h et plus) et rémunérations des professeurs. L’onglet <strong>TimeSheets</strong> reçoit les relevés d’heures envoyés par les professeurs : validez-les pour générer leur facture de rémunération.</>,
        <><strong>Facturation</strong> : devis, factures et reçus. Chaque document se voit, s’imprime et se télécharge en PDF.</>,
        <><strong>Contrats</strong> : modèles et contrats. Pour un cours collectif, choisissez la classe : chaque élève reçoit son propre contrat.</>,
        <><strong>Tarifs</strong> et <strong>Paramètres</strong> : grille affichée sur la vitrine, réglages de l’établissement et connexion Google Meet.</>,
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
