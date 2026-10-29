import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DossierEtudiant } from '../../../hooks/useDossierEtudiant'

/* Reprise des vraies données du cours collectif, 2026-10-29 : chaque classe a sa propre période
   et ses propres séances déjà suivies (fichier « V1 - cours collectifs »), au même titre qu'un
   forfait individuel — voir dossierEtudiantHeuresReprises.test.tsx pour le cas individuel. Le
   forfait collectif est créé automatiquement à l'inscription (0071), un par élève : ces mêmes
   compteurs doivent apparaître dans l'onglet Programme d'un élève en vague, qui n'affichait
   jusqu'ici que la vague, la classe et le professeur, sans aucune heure. */

vi.mock('../../../hooks/useNiveauxEtudiant', () => ({
  useNiveauxEtudiant: () => ({ evaluations: [], loading: false }),
}))

const { DossierEtudiantVue } = await import('../DossierEtudiantVue')

function dossierCollectif(heuresConsommees: number, heuresReprises: number): DossierEtudiant {
  return {
    etudiant: {
      id: 'eleve-1',
      prenom: 'Koloina',
      nom: 'RAHELIARIVELO',
      email: 'koloina@exemple.test',
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
    packages: [{ id: 'forfait-collectif-1', type_programme: 'collectif', total_heures: 32, montant: null, echeance: null, essai: false, essai_resultat: null }],
    cohorte: { id: 'vague-1', nom: 'Vague Septembre', langue: 'Anglais', date_debut: '2026-09-14', date_fin: '2026-11-14' },
    cohortClasse: { id: 'classe-1', nom: '', niveau: 'pre_advanced', creneau: 'matin' },
    professeurClasse: null,
    heuresConsommees,
    heuresReprises,
    prochaineSeance: null,
    tarifChoisi: null,
    duoPartenaire: null,
  } as unknown as DossierEtudiant
}

describe('DossierEtudiantVue — heures d’un élève en cours collectif', () => {
  it('affiche les heures suivies et restantes du forfait collectif, comme pour un forfait individuel', () => {
    render(<DossierEtudiantVue dossier={dossierCollectif(27, 27)} peutModifierPlanning={false} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Programme' }))

    expect(screen.getByText('Forfait de la vague')).toBeTruthy()
    expect(screen.getByText('32h')).toBeTruthy()
    expect(screen.getByText('Consommées')).toBeTruthy()
    // « 27h » apparaît deux fois : la tuile d'en-tête du dossier (« Heures suivies ») ET la ligne
    // ajoutée ici, qui partagent la même valeur sans se confondre pour autant — chacune a son
    // propre libellé, déjà vérifié ci-dessus et ci-dessous.
    expect(screen.getAllByText('27h').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Restantes')).toBeTruthy()
    expect(screen.getByText('5h')).toBeTruthy()
    expect(screen.getByText('dont suivies avant la mise en service')).toBeTruthy()
  })

  it('reste muet sur la reprise pour une classe entièrement suivie dans l’application', () => {
    render(<DossierEtudiantVue dossier={dossierCollectif(3, 0)} peutModifierPlanning={false} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Programme' }))

    expect(screen.queryByText('dont suivies avant la mise en service')).toBeNull()
  })
})
