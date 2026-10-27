import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DossierEtudiant } from '../../../hooks/useDossierEtudiant'

/* Demande client du 2026-10-27 : « Lors de l'attribution de professeur à un étudiant, il faudrait
   rajouter la possibilité d'avoir deux ou plusieurs professeurs [...] Dans l'espace personnel de
   l'étudiant, il verra les deux professeurs attribués à lui [...] Dans le parcours pédagogique de
   l'étudiant, pour le cas de plusieurs professeurs attribués, pour chaque séance, il faut
   afficher visuellement le professeur qui a fait la séance. »

   Jusqu'à 0138, `useDossierEtudiant` n'exposait qu'UNE période actuelle (`periodeActuelle`), la
   migration 0039 garantissant l'unicité. Tout cet écran en héritait : un seul professeur nommé
   dans l'onglet Professeur — celui que l'élève voit dans son espace —, un seul badge « Professeur
   actuel », et un planning prévisionnel amputé des séances de l'autre. */

vi.mock('../../../hooks/useNiveauxEtudiant', () => ({
  useNiveauxEtudiant: () => ({ evaluations: [], loading: false }),
}))

// La fenêtre de modification d'une séance lit la session de l'utilisateur pour appeler l'API.
vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ profile: { id: 'prof-b', role: 'professeur' }, session: { access_token: 'jeton-test' } }),
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

const profA = { id: 'prof-a', prenom: 'Nirina', nom: 'RAKOTO', status: 'approved' }
const profB = { id: 'prof-b', prenom: 'Soloniaina', nom: 'RABE', status: 'approved' }

function seance(id: string, teacherId: string, debut: string, statut: string) {
  return {
    enrollment: { id: `inscription-${id}`, teacher_assignment_id: `aff-${teacherId}`, present: statut === 'terminee' },
    session: { id, teacher_id: teacherId, debut, duree_minutes: 60, statut, type: 'individuel' },
    video: null,
  }
}

function periode(professeur: typeof profA, dateDebut: string, seances: ReturnType<typeof seance>[]) {
  return {
    affectation: {
      id: `aff-${professeur.id}`,
      teacher_id: professeur.id,
      student_id: 'eleve-1',
      date_debut: dateDebut,
      date_fin: null,
      langue: 'Anglais',
      motif_changement: null,
      created_at: `${dateDebut}T08:00:00.000Z`,
    },
    professeur,
    seances,
  }
}

/* Élève individuel suivi par DEUX professeurs en même temps, chacun avec ses propres séances :
   l'une déjà donnée, l'autre encore à venir. */
function dossierDeuxProfesseurs(): DossierEtudiant {
  const periodeA = periode(profA, '2026-09-01', [
    seance('s1', 'prof-a', '2026-10-05T08:00:00.000Z', 'terminee'),
    seance('s3', 'prof-a', '2026-11-05T08:00:00.000Z', 'planifiee'),
  ])
  const periodeB = periode(profB, '2026-10-20', [seance('s2', 'prof-b', '2026-11-06T10:00:00.000Z', 'planifiee')])

  return {
    etudiant,
    periodes: [periodeB, periodeA],
    seancesCollectives: [],
    periodesActuelles: [periodeA, periodeB],
    professeursDesSeances: { 'prof-a': profA, 'prof-b': profB },
    diagnostic: null,
    diagnosticPartenaire: null,
    packages: [{ id: 'forfait-1', type_programme: 'individuel', total_heures: 20, echeance: '2026-12-31', montant: 700000, essai: false, essai_resultat: null }],
    cohorte: null,
    cohortClasse: null,
    professeurClasse: null,
    heuresConsommees: 1,
    prochaineSeance: null,
    tarifChoisi: null,
    duoPartenaire: null,
  } as unknown as DossierEtudiant
}

describe('DossierEtudiantVue — étudiant à plusieurs professeurs', () => {
  it('nomme les DEUX professeurs dans l’onglet, pas seulement le premier', () => {
    render(<DossierEtudiantVue dossier={dossierDeuxProfesseurs()} peutModifierPlanning={false} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Professeurs' }))

    expect(screen.getByText(`${profA.prenom} ${profA.nom}`)).toBeTruthy()
    expect(screen.getByText(`${profB.prenom} ${profB.nom}`)).toBeTruthy()
  })

  it('intitule l’onglet au pluriel quand il y a plusieurs professeurs', () => {
    render(<DossierEtudiantVue dossier={dossierDeuxProfesseurs()} peutModifierPlanning={false} />)

    expect(screen.getByRole('tab', { name: 'Professeurs' })).toBeTruthy()
  })

  it('porte le badge « Professeur actuel » sur CHAQUE période en cours', () => {
    render(<DossierEtudiantVue dossier={dossierDeuxProfesseurs()} peutModifierPlanning={false} />)

    // Deux périodes actives, donc deux badges — un seul laisserait croire que l'autre professeur
    // a été remplacé.
    expect(screen.getAllByText('Professeur actuel')).toHaveLength(2)
  })

  it('annonce que les deux professeurs enseignent en parallèle', () => {
    render(<DossierEtudiantVue dossier={dossierDeuxProfesseurs()} peutModifierPlanning={false} />)

    expect(screen.getByText(/2 professeurs enseignent actuellement à cet élève, en parallèle/)).toBeTruthy()
  })

  it('montre dans le planning prévisionnel les séances à venir des DEUX professeurs', () => {
    render(<DossierEtudiantVue dossier={dossierDeuxProfesseurs()} peutModifierPlanning={false} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Planning' }))

    // s3 (prof A) et s2 (prof B) : deux séances planifiées, pas une seule.
    expect(screen.getByText(/Planning prévisionnel · 2 séances/)).toBeTruthy()
    // Et chacune nommée de son professeur, sans quoi deux cours voisins seraient indiscernables.
    expect(screen.getByText(profA.prenom)).toBeTruthy()
    expect(screen.getByText(profB.prenom)).toBeTruthy()
  })

  it('ouvre la séance d’un collègue en lecture seule, jamais en modification', () => {
    render(
      <DossierEtudiantVue
        dossier={dossierDeuxProfesseurs()}
        peutModifierPlanning
        // Ce que passe l'espace professeur : ici, le professeur B regarde le dossier.
        limiterEditionAuProfesseur="prof-b"
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Planning' }))
    // La séance du 5 novembre appartient au professeur A.
    fireEvent.click(screen.getByText(/5 nov/))

    expect(screen.getByText('Détail de la séance')).toBeTruthy()
    expect(screen.queryByText('Modifier la séance')).toBeNull()
  })

  it('laisse le professeur modifier ses propres séances', () => {
    render(<DossierEtudiantVue dossier={dossierDeuxProfesseurs()} peutModifierPlanning limiterEditionAuProfesseur="prof-b" />)

    fireEvent.click(screen.getByRole('tab', { name: 'Planning' }))
    // Le 6 novembre est la séance du professeur B lui-même.
    fireEvent.click(screen.getByText(/6 nov/))

    expect(screen.getByText('Modifier la séance')).toBeTruthy()
  })

  it('étiquette chaque ligne de séance du parcours avec son professeur', () => {
    render(<DossierEtudiantVue dossier={dossierDeuxProfesseurs()} peutModifierPlanning={false} />)

    /* L'en-tête du bloc nomme déjà le professeur, mais il sort de l'écran dès qu'on fait défiler
       une longue liste de séances — la colonne est ce qui rend l'attribution lisible ligne par
       ligne, comme le demande le client. */
    expect(screen.getAllByText('Professeur').length).toBeGreaterThan(0)
  })

  it('n’affiche aucune colonne Professeur quand l’élève n’en a qu’un', () => {
    const dossier = dossierDeuxProfesseurs()
    const unSeul = {
      ...dossier,
      periodes: [dossier.periodesActuelles[0]],
      periodesActuelles: [dossier.periodesActuelles[0]],
    } as unknown as DossierEtudiant

    render(<DossierEtudiantVue dossier={unSeul} peutModifierPlanning={false} />)

    // Cas de loin le plus courant : le tableau reste exactement celui d'avant, une colonne qui
    // répéterait le même nom à chaque ligne mangerait la largeur du libellé pour rien.
    expect(screen.queryByText('Professeur', { selector: 'span' })).toBeNull()
    expect(screen.getAllByText('Professeur actuel')).toHaveLength(1)
  })
})
