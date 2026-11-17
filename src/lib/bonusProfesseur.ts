import type { Database } from '../types/database.types.js'

type Package = Database['public']['Tables']['packages']['Row']
type BonusProfesseur = Database['public']['Tables']['bonus_professeur']['Row']

/* Bonus accordé à un professeur au renouvellement ou au prolongement du forfait d'un de ses
   élèves — demande client du 2026-11-17. Décidé avec lui avant d'écrire : l'application REPÈRE
   les renouvellements et les PROPOSE, l'admin accorde d'un clic ; rien n'est créé sans son
   geste. Ce fichier porte la partie qui se raisonne sans base : qu'est-ce qu'un renouvellement,
   et lequel n'a pas encore donné lieu à un bonus. */

/** Montant proposé par défaut, modifiable bonus par bonus (choix du client, 2026-11-17). */
export const MONTANT_BONUS_DEFAUT = 10_000

export interface EleveAvecForfaits {
  eleve: { id: string; prenom: string | null; nom: string | null }
  packages: Package[]
}

export interface RenouvellementProposable {
  packageId: string
  studentId: string
  nomEleve: string
  /* 2 pour le premier renouvellement, 3 pour le suivant… — jamais 1, le forfait initial n'étant
     pas un renouvellement. Sert à l'intitulé (« 2ᵉ forfait ») et au motif enregistré. */
  rang: number
  typeProgramme: Package['type_programme']
  totalHeures: number
  dateSouscription: string
}

function nomComplet(eleve: { prenom: string | null; nom: string | null }): string {
  return [eleve.prenom, eleve.nom].filter(Boolean).join(' ') || 'Élève'
}

/* Un RENOUVELLEMENT (ou prolongement) est un forfait qui n'est pas le premier de l'élève. C'est
   la seule définition que la base permette de tenir : un forfait payé ne se réécrit jamais
   (0057), une prolongation crée donc une tranche successive plutôt que d'allonger l'existante —
   et une montée de classe en collectif solde le forfait en cours pour en ouvrir un suivant
   (0146). Dans les deux cas, le deuxième forfait et les suivants sont exactement ce que le
   client appelle « renouvellement ou prolongement ».
 *
 * Rien n'est filtré au-delà : ni le type de programme, ni les tranches d'essai. Un forfait
 * collectif créé automatiquement à l'entrée en vague (trigger 0071) remonterait pour un élève
 * déjà passé par un parcours individuel — c'est voulu. L'admin voit l'intitulé complet (type,
 * heures, date) et tranche lui-même : proposer à tort se corrige d'un refus, omettre une
 * proposition se paie d'un bonus oublié que personne ne remarquera. */
export function renouvellementsProposables(
  eleves: EleveAvecForfaits[],
  bonusExistants: Pick<BonusProfesseur, 'package_id'>[],
): RenouvellementProposable[] {
  const dejaAccordes = new Set(bonusExistants.map((b) => b.package_id).filter((id): id is string => !!id))

  return eleves
    .flatMap(({ eleve, packages }) => {
      /* Tri par date de souscription, du plus ancien au plus récent : c'est lui qui donne le
         rang, donc qui distingue le forfait initial de ses successeurs. `created_at` et non
         `echeance`, qui est une date de planning et peut manquer. */
      const parAnciennete = [...packages].sort((a, b) => a.created_at.localeCompare(b.created_at))
      return parAnciennete.slice(1).map((forfait, index) => ({
        packageId: forfait.id,
        studentId: eleve.id,
        nomEleve: nomComplet(eleve),
        rang: index + 2,
        typeProgramme: forfait.type_programme,
        totalHeures: Number(forfait.total_heures),
        dateSouscription: forfait.created_at,
      }))
    })
    .filter((r) => !dejaAccordes.has(r.packageId))
    .sort((a, b) => b.dateSouscription.localeCompare(a.dateSouscription))
}

/** Motif enregistré avec le bonus : ce que l'admin relira dans l'historique, des mois plus tard. */
export function motifRenouvellement(renouvellement: RenouvellementProposable): string {
  return `Renouvellement du forfait de ${renouvellement.nomEleve} (${renouvellement.rang}ᵉ forfait, ${renouvellement.totalHeures} h)`
}

/* Un bonus est PAYÉ dès qu'il est rattaché à une rémunération (0162), exactement comme une heure
   du grand livre (0029). Une seule lecture pour toute l'application, pour que la tuile, le
   pop-up et le relevé ne puissent pas donner trois réponses différentes. */
export function estPaye(bonus: Pick<BonusProfesseur, 'teacher_payment_id'>): boolean {
  return bonus.teacher_payment_id !== null
}

export function totalBonus(bonus: Pick<BonusProfesseur, 'montant' | 'teacher_payment_id'>[]): {
  enAttente: number
  paye: number
} {
  return bonus.reduce(
    (totaux, b) => {
      const montant = Number(b.montant)
      return estPaye(b)
        ? { ...totaux, paye: totaux.paye + montant }
        : { ...totaux, enAttente: totaux.enAttente + montant }
    },
    { enAttente: 0, paye: 0 },
  )
}
