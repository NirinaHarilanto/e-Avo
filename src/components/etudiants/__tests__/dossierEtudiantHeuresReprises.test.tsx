import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DossierEtudiant } from '../../../hooks/useDossierEtudiant'

/* Reprise des vraies données, 2026-10-29 : les élèves déjà en cours à la mise en service arrivent
   avec un forfait entamé — « 40 h souscrites, 26 h restantes » sur la fiche de leur professeur.
   Les 14 h suivies sont reprises telles quelles dans le grand livre (0140), sans séance derrière
   elles puisqu'elles ont été données avant que l'application n'existe. Le dossier affiche donc un
   compteur d'heures consommées en face d'un parcours vide : sans le dire, il passe pour faux. */

vi.mock('../../../hooks/useNiveauxEtudiant', () => ({
  useNiveauxEtudiant: () => ({ evaluations: [], loading: false }),
}))

const { DossierEtudiantVue } = await import('../DossierEtudiantVue')

function dossierIndividuel(heuresReprises: number): DossierEtudiant {
  return {
    etudiant: {
      id: 'eleve-1',
      prenom: 'Ranto',
      nom: 'RATSIMBAZAFY',
      email: 'ranto@exemple.test',
      status: 'approved',
      etablissement_id: 'etab-1',
      duo_partenaire_id: null,
    },
    periodes: [],
    seancesCollectives: [],
    periodesActuelles: [],
    professeursDesSeances: {},
    diagnostic: null,
    diagnosticPartenaire: null,
    packages: [
      {
        id: 'forfait-1',
        type_programme: 'individuel',
        total_heures: 40,
        montant: 900000,
        echeance: null,
        essai: false,
        essai_resultat: null,
      },
    ],
    cohorte: null,
    cohortClasse: null,
    professeurClasse: null,
    heuresConsommees: 14,
    heuresReprises,
    prochaineSeance: null,
    tarifChoisi: null,
    duoPartenaire: null,
  } as unknown as DossierEtudiant
}

describe('DossierEtudiantVue — heures suivies avant la mise en service', () => {
  it('dit quelle part du compteur vient de la reprise, faute de séance à montrer', () => {
    render(<DossierEtudiantVue dossier={dossierIndividuel(14)} peutModifierPlanning={false} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Forfait' }))

    expect(screen.getByText('dont suivies avant la mise en service')).toBeTruthy()
    // Le forfait reste celui qui a été souscrit, et le restant s'en déduit : 40 − 14.
    expect(screen.getByText('40h')).toBeTruthy()
    expect(screen.getByText('26h')).toBeTruthy()
  })

  it('reste muet pour un dossier entièrement né dans l’application', () => {
    render(<DossierEtudiantVue dossier={dossierIndividuel(0)} peutModifierPlanning={false} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Forfait' }))

    expect(screen.queryByText('dont suivies avant la mise en service')).toBeNull()
  })
})
