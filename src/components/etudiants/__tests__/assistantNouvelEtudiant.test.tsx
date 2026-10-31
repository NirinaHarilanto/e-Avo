import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AssistantNouvelEtudiant } from '../AssistantNouvelEtudiant'

/* Demande client du 2026-10-30 : « il faut suivre ces étapes qui s'affichent DYNAMIQUEMENT étape
   par étape SELON LES CHOIX ». C'est ce dévoilement progressif qui est vérifié ici — il ne se lit
   nulle part ailleurs, et une refonte du style le ferait disparaître sans bruit :
   l'étape 2 n'existe pas avant qu'un type de cours soit choisi, elle ne demande pas la même chose
   selon ce type, et l'étape 3 attend que l'étape 2 soit validée. */

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ session: { access_token: 'jeton' }, profile: { etablissement_id: 'etab-1' } }),
}))

vi.mock('../../../hooks/useTarifs', () => ({
  useTarifs: () => ({
    tarifs: [
      { id: 't-ind', type_programme: 'individuel', titre: 'Formule 20 h', heures: 20, prix: 400000 },
      { id: 't-duo', type_programme: 'duo', titre: 'Formule DUO 20 h', heures: 20, prix: 600000 },
    ],
  }),
}))

vi.mock('../../../hooks/useCohortes', () => ({
  useCohortes: () => ({ cohortes: [{ id: 'v-1', nom: 'Vague Novembre', date_debut: '2026-11-01' }] }),
}))

vi.mock('../../../hooks/useCohortClasses', () => ({
  useCohortClasses: (cohortId?: string) => ({
    classes: cohortId ? [{ id: 'c-1', niveau: 'beginner', nom: '19h30', creneau: 'soir' }] : [],
  }),
}))

/* Libellés ancrés au début : « Nom » est contenu dans « Prénom », une recherche par sous-chaîne
   remplirait le mauvais champ sans rien signaler. `index` vise la seconde personne du binôme. */
function champs(libelle: string) {
  return screen.getAllByLabelText(new RegExp(`^${libelle}`, 'i'))
}

function remplir(libelle: string, valeur: string, index = 0) {
  fireEvent.change(champs(libelle)[index], { target: { value: valeur } })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ profileId: 'p1' }), { status: 200 })))
})

describe('AssistantNouvelEtudiant', () => {
  it('ne montre que l’étape 1 tant qu’aucun type de cours n’est choisi', () => {
    render(<AssistantNouvelEtudiant etablissementId="etab-1" onTermine={() => {}} />)

    expect(screen.getByText('Type de cours souhaité')).toBeTruthy()
    expect(screen.queryByText('Informations indispensables')).toBeNull()
    expect(screen.queryByText('Création de l’espace personnel')).toBeNull()
  })

  it('ouvre l’étape 2 au choix du type, et n’y demande ni binôme ni vague en individuel', () => {
    render(<AssistantNouvelEtudiant etablissementId="etab-1" onTermine={() => {}} />)
    fireEvent.click(screen.getByText('Individuel'))

    expect(screen.getByText('Informations indispensables')).toBeTruthy()
    expect(screen.getByText('Formule')).toBeTruthy()
    expect(screen.queryByText('Seconde personne du binôme')).toBeNull()
    expect(screen.queryByText('Vague')).toBeNull()
  })

  it('demande la seconde personne en DUO, et rien d’autre que la vague et la classe en collectif', () => {
    const { unmount } = render(<AssistantNouvelEtudiant etablissementId="etab-1" onTermine={() => {}} />)
    fireEvent.click(screen.getByText('DUO'))
    expect(screen.getByText('Seconde personne du binôme')).toBeTruthy()
    expect(screen.getByText('Nom du binôme (optionnel)')).toBeTruthy()
    unmount()

    render(<AssistantNouvelEtudiant etablissementId="etab-1" onTermine={() => {}} />)
    fireEvent.click(screen.getByText('Collectif'))
    expect(screen.getByText('Vague')).toBeTruthy()
    expect(screen.getByText('Classe de niveau')).toBeTruthy()
    // Le forfait collectif naît du trigger 0071 : aucune formule à choisir ici.
    expect(screen.queryByText('Formule')).toBeNull()
    expect(screen.queryByText('Seconde personne du binôme')).toBeNull()
  })

  it('n’ouvre l’étape 3 qu’une fois l’étape 2 complétée puis validée', () => {
    render(<AssistantNouvelEtudiant etablissementId="etab-1" onTermine={() => {}} />)
    fireEvent.click(screen.getByText('Individuel'))

    const valider = screen.getByText('Valider ces informations') as HTMLButtonElement
    expect(valider.disabled).toBe(true)

    remplir('Prénom', 'Anaïs')
    remplir('Nom', 'RASOA')
    remplir('E-mail', 'anais@exemple.test')
    expect((screen.getByText('Valider ces informations') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByText('Création de l’espace personnel')).toBeNull()

    fireEvent.click(screen.getByText('Valider ces informations'))
    expect(screen.getByText('Création de l’espace personnel')).toBeTruthy()
    expect(screen.getByText('anais@exemple.test', { exact: false })).toBeTruthy()
  })

  it('retient la validation tant que la vague manque en collectif', () => {
    render(<AssistantNouvelEtudiant etablissementId="etab-1" onTermine={() => {}} />)
    fireEvent.click(screen.getByText('Collectif'))
    remplir('Prénom', 'Anaïs')
    remplir('Nom', 'RASOA')
    remplir('E-mail', 'anais@exemple.test')

    expect((screen.getByText('Valider ces informations') as HTMLButtonElement).disabled).toBe(true)
  })

  it('repart à zéro sur les champs du type précédent quand on en change', () => {
    render(<AssistantNouvelEtudiant etablissementId="etab-1" onTermine={() => {}} />)
    fireEvent.click(screen.getByText('DUO'))
    remplir('Prénom', 'Anaïs')
    remplir('Prénom', 'Bruno', 1)

    fireEvent.click(screen.getByText('Individuel'))
    // Le binôme a disparu avec son type : il ne doit pas partir en douce avec un programme
    // individuel (c'est la raison d'être de la remise à zéro dans `choisirType`).
    expect(screen.queryByText('Seconde personne du binôme')).toBeNull()
    expect(champs('Prénom')).toHaveLength(1)
  })

  it('envoie le type de cours et la classe choisie à la création', async () => {
    render(<AssistantNouvelEtudiant etablissementId="etab-1" onTermine={() => {}} />)
    fireEvent.click(screen.getByText('Collectif'))
    remplir('Prénom', 'Anaïs')
    remplir('Nom', 'RASOA')
    remplir('E-mail', 'anais@exemple.test')
    remplir('Vague', 'v-1')
    remplir('Classe de niveau', 'c-1')
    fireEvent.click(screen.getByText('Valider ces informations'))
    fireEvent.click(screen.getByText('Créer l’espace personnel'))

    /* La requête part après la demande d'un jeton frais (lib/jetonAcces.ts) : elle n'est donc
       plus émise dans le même tour de boucle que le clic. */
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const appel = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(appel[0]).toBe('/api/admin/inviter-etudiant')
    expect(JSON.parse((appel[1] as RequestInit).body as string)).toMatchObject({
      typeProgramme: 'collectif',
      cohortId: 'v-1',
      cohortClassId: 'c-1',
      prenom: 'Anaïs',
    })
  })
})
