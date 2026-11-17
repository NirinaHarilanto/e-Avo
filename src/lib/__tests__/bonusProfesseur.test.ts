import { describe, expect, it } from 'vitest'
import {
  estPaye,
  motifRenouvellement,
  MONTANT_BONUS_DEFAUT,
  renouvellementsProposables,
  totalBonus,
  type EleveAvecForfaits,
} from '../bonusProfesseur'

/* Demande client du 2026-11-17 : « l'admin devrait pouvoir attribuer un bonus de 10 000 Ar à
   chaque professeur quand un de ses étudiants fait un renouvellement ou prolongement de son
   forfait d'heures ». Décidé avec lui : l'application REPÈRE les renouvellements et les PROPOSE,
   l'admin accorde d'un clic.

   Tout tient donc à la définition de « renouvellement », et c'est ce que ce fichier garde : un
   forfait qui n'est pas le PREMIER de l'élève. C'est la seule définition que la base permette de
   tenir — un forfait payé ne se réécrit jamais (0057), une prolongation crée donc une tranche
   successive, et une montée de classe en collectif solde le forfait en cours pour en ouvrir un
   suivant (0146). */

function forfait(id: string, created_at: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    created_at,
    student_id: 'eleve-1',
    type_programme: 'individuel',
    total_heures: 20,
    essai: false,
    clos_le: null,
    ...extra,
  } as never
}

function eleve(id: string, prenom: string, packages: unknown[]): EleveAvecForfaits {
  return { eleve: { id, prenom, nom: 'RAKOTO' }, packages: packages as never }
}

describe('renouvellementsProposables', () => {
  it('ne propose rien pour un élève qui n’a que son forfait initial', () => {
    const eleves = [eleve('eleve-1', 'Aina', [forfait('f1', '2026-09-01T08:00:00Z')])]
    expect(renouvellementsProposables(eleves, [])).toEqual([])
  })

  it('propose le deuxième forfait et les suivants', () => {
    const eleves = [
      eleve('eleve-1', 'Aina', [
        forfait('f1', '2026-09-01T08:00:00Z'),
        forfait('f2', '2026-10-01T08:00:00Z'),
        forfait('f3', '2026-11-01T08:00:00Z'),
      ]),
    ]
    const propositions = renouvellementsProposables(eleves, [])

    expect(propositions.map((p) => p.packageId)).toEqual(['f3', 'f2'])
    expect(propositions.map((p) => p.rang)).toEqual([3, 2])
  })

  /* Le rang vient de l'ANCIENNETÉ, pas de l'ordre dans lequel la base a rendu les lignes — rien
     ne garantit cet ordre, et un rang faux se lirait dans le motif enregistré. */
  it('classe par ancienneté, quel que soit l’ordre reçu', () => {
    const eleves = [
      eleve('eleve-1', 'Aina', [
        forfait('f3', '2026-11-01T08:00:00Z'),
        forfait('f1', '2026-09-01T08:00:00Z'),
        forfait('f2', '2026-10-01T08:00:00Z'),
      ]),
    ]
    const propositions = renouvellementsProposables(eleves, [])

    expect(propositions.find((p) => p.packageId === 'f2')?.rang).toBe(2)
    expect(propositions.find((p) => p.packageId === 'f3')?.rang).toBe(3)
  })

  /* Le cœur du garde-fou : rouvrir le pop-up ne doit pas reproposer ce qui a déjà été accordé,
     sinon l'admin accorde deux fois sans qu'aucun écran ne le signale. */
  it('retire ce qui a déjà donné lieu à un bonus', () => {
    const eleves = [
      eleve('eleve-1', 'Aina', [
        forfait('f1', '2026-09-01T08:00:00Z'),
        forfait('f2', '2026-10-01T08:00:00Z'),
        forfait('f3', '2026-11-01T08:00:00Z'),
      ]),
    ]
    const propositions = renouvellementsProposables(eleves, [{ package_id: 'f2' }])

    expect(propositions.map((p) => p.packageId)).toEqual(['f3'])
  })

  /* Un bonus saisi librement ne porte aucun forfait : il ne doit masquer aucune proposition. */
  it('ignore les bonus sans forfait rattaché', () => {
    const eleves = [
      eleve('eleve-1', 'Aina', [forfait('f1', '2026-09-01T08:00:00Z'), forfait('f2', '2026-10-01T08:00:00Z')]),
    ]
    expect(renouvellementsProposables(eleves, [{ package_id: null }]).map((p) => p.packageId)).toEqual(['f2'])
  })

  it('couvre tous les élèves du professeur, le plus récent renouvellement en tête', () => {
    const eleves = [
      eleve('eleve-1', 'Aina', [forfait('a1', '2026-09-01T08:00:00Z'), forfait('a2', '2026-10-05T08:00:00Z')]),
      eleve('eleve-2', 'Miary', [forfait('b1', '2026-09-02T08:00:00Z'), forfait('b2', '2026-11-02T08:00:00Z')]),
    ]
    const propositions = renouvellementsProposables(eleves, [])

    expect(propositions.map((p) => p.packageId)).toEqual(['b2', 'a2'])
    expect(propositions[0].nomEleve).toBe('Miary RAKOTO')
  })

  /* Volontairement NON filtré : un forfait collectif créé automatiquement à l'entrée en vague
     (trigger 0071) remonte pour un élève déjà passé par un parcours individuel. L'admin voit
     l'intitulé complet et tranche — proposer à tort se corrige d'un refus, omettre une
     proposition se paie d'un bonus oublié que personne ne remarquera. */
  it('propose aussi un forfait d’un autre type que le précédent', () => {
    const eleves = [
      eleve('eleve-1', 'Aina', [
        forfait('f1', '2026-09-01T08:00:00Z', { type_programme: 'individuel' }),
        forfait('f2', '2026-10-01T08:00:00Z', { type_programme: 'collectif', total_heures: 32 }),
      ]),
    ]
    const propositions = renouvellementsProposables(eleves, [])

    expect(propositions).toHaveLength(1)
    expect(propositions[0].typeProgramme).toBe('collectif')
    expect(propositions[0].totalHeures).toBe(32)
  })
})

describe('motifRenouvellement', () => {
  it('nomme l’élève, le rang et le volume — ce que l’admin relira des mois plus tard', () => {
    const eleves = [
      eleve('eleve-1', 'Aina', [forfait('f1', '2026-09-01T08:00:00Z'), forfait('f2', '2026-10-01T08:00:00Z')]),
    ]
    const motif = motifRenouvellement(renouvellementsProposables(eleves, [])[0])

    expect(motif).toContain('Aina RAKOTO')
    expect(motif).toContain('2ᵉ forfait')
    expect(motif).toContain('20 h')
  })
})

describe('estPaye et totalBonus', () => {
  /* Un bonus est payé dès qu'il est rattaché à une rémunération — même convention que le grand
     livre (0029). Une seule lecture pour la tuile, le pop-up et le relevé. */
  it('tient un bonus pour payé dès qu’il porte une rémunération', () => {
    expect(estPaye({ teacher_payment_id: 'paie-1' })).toBe(true)
    expect(estPaye({ teacher_payment_id: null })).toBe(false)
  })

  it('sépare ce qui reste dû de ce qui est déjà payé', () => {
    const totaux = totalBonus([
      { montant: 10000, teacher_payment_id: null },
      { montant: 10000, teacher_payment_id: null },
      { montant: 15000, teacher_payment_id: 'paie-1' },
    ])

    expect(totaux).toEqual({ enAttente: 20000, paye: 15000 })
  })

  it('rend deux zéros sans aucun bonus', () => {
    expect(totalBonus([])).toEqual({ enAttente: 0, paye: 0 })
  })

  /* `numeric` revient parfois en chaîne de PostgREST : additionner sans convertir donnerait
     « 1000010000 » au lieu de 20000. */
  it('additionne des montants rendus en chaîne', () => {
    expect(totalBonus([{ montant: '10000' as never, teacher_payment_id: null }, { montant: '10000' as never, teacher_payment_id: null }]).enAttente).toBe(20000)
  })
})

describe('MONTANT_BONUS_DEFAUT', () => {
  it('vaut les 10 000 Ar demandés par le client', () => {
    expect(MONTANT_BONUS_DEFAUT).toBe(10000)
  })
})
