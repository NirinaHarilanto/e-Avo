import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DossierEtudiant } from '../../../hooks/useDossierEtudiant'

/* Demande client du 2026-10-19 : « il faudrait que tous les étudiants en cours collectifs soient
   visibles dans la section Étudiants afin de bien suivre l'étudiant en cours collectif. Dans la
   section Étudiants, pour les étudiants collectifs, il faudrait que l'onglet professeur, forfait,
   planning soient uniquement en mode lecture. Les modifications se font par classe dans la
   section cours collectifs. »

   Ils apparaissaient déjà dans la LISTE (useEtudiants ne filtre que les comptes supprimés), mais
   leur dossier était muet : les périodes du parcours se construisent sur `teacher_assignments`,
   qu'un élève collectif n'a pas — d'où « Aucune séance enregistrée », aucun professeur nommé et
   aucun onglet Planning, quoi qu'il ait réellement suivi. */

vi.mock('../../../hooks/useNiveauxEtudiant', () => ({
  useNiveauxEtudiant: () => ({ evaluations: [], loading: false }),
}))

const { DossierEtudiantVue } = await import('../DossierEtudiantVue')

const etudiant = {
  id: 'eleve-1',
  prenom: 'Miary',
  nom: 'Andrianina',
  email: 'miary@exemple.test',
  status: 'approved',
  etablissement_id: 'etab-1',
  duo_partenaire_id: null,
}

function seance(id: string, debut: string, statut: string, present: boolean | null) {
  return {
    enrollment: { id: `inscription-${id}`, teacher_assignment_id: null, present },
    session: { id, debut, duree_minutes: 90, statut, type: 'collectif' },
    video: null,
  }
}

/* Élève inscrit à une vague, sans aucune affectation individuelle : exactement la situation d'un
   candidat collectif converti. */
function dossierCollectif(seances = [seance('s1', '2026-10-19T08:00:00.000Z', 'terminee', true)]): DossierEtudiant {
  return {
    etudiant,
    periodes: [],
    seancesCollectives: seances,
    periodeActuelle: null,
    diagnostic: null,
    diagnosticPartenaire: null,
    packages: [],
    cohorte: { id: 'vague-1', nom: 'Vague Novembre', langue: 'Anglais', date_debut: '2026-11-01', date_fin: '2026-12-31' },
    cohortClasse: { id: 'classe-1', nom: 'Groupe A', niveau: 'debutant', creneau: 'samedi_matin' },
    professeurClasse: { id: 'prof-1', prenom: 'Nirina', nom: 'RAKOTONJANAHARY' },
    heuresConsommees: 1.5,
    prochaineSeance: null,
    tarifChoisi: null,
    duoPartenaire: null,
  } as unknown as DossierEtudiant
}

describe('DossierEtudiantVue — élève en cours collectif', () => {
  it('montre les séances de sa classe au lieu de « Aucune séance enregistrée »', () => {
    render(<DossierEtudiantVue dossier={dossierCollectif()} peutModifierPlanning={false} />)

    expect(screen.queryByText('Aucune séance enregistrée')).toBeNull()
    expect(screen.getByText('Cours collectif')).toBeTruthy()
    // Le professeur de la classe est nommé : c'est lui qui enseigne à cet élève.
    expect(screen.getByText('Nirina RAKOTONJANAHARY')).toBeTruthy()
    expect(screen.getByText(/Groupe A/)).toBeTruthy()
  })

  it('compte ces séances dans l’assiduité, qui restait muette', () => {
    render(<DossierEtudiantVue dossier={dossierCollectif()} peutModifierPlanning={false} />)
    expect(screen.getByText('100 %')).toBeTruthy()
  })

  it('propose un onglet Planning, qu’un élève collectif n’avait pas du tout', () => {
    const dossier = dossierCollectif([seance('s2', '2026-12-01T08:00:00.000Z', 'planifiee', null)])
    render(<DossierEtudiantVue dossier={dossier} peutModifierPlanning={false} />)

    const onglet = screen.getByRole('tab', { name: 'Planning' })
    fireEvent.click(onglet)
    expect(screen.getByText(/Planning prévisionnel/)).toBeTruthy()
    // Lecture seule : aucun bouton de génération de planning ne doit apparaître.
    expect(screen.queryByRole('button', { name: /Planifier les séances/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull()
  })

  it('n’offre aucun bouton pour changer sa vague depuis sa fiche', () => {
    render(<DossierEtudiantVue dossier={dossierCollectif()} peutModifierPlanning={false} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Programme' }))
    expect(screen.getByText('Vague Novembre')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Changer' })).toBeNull()
    expect(screen.getByText(/se modifient depuis Cours collectifs/)).toBeTruthy()
  })

  it('nomme le professeur de la classe dans l’onglet Professeur', () => {
    render(<DossierEtudiantVue dossier={dossierCollectif()} peutModifierPlanning={false} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Professeur' }))
    expect(screen.getByText('Professeur de la classe')).toBeTruthy()
  })
})
