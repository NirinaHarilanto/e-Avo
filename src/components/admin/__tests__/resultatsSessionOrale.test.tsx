import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-11-08 : « à 5 min de la fin de la session orale, il faudrait rajouter un
   bouton sur le pop-up afin que l'admin puisse renseigner le compte rendu de la session pour
   chaque prospect en cours collectif [...] prends la même trame de diagnostic appel comme pour la
   partie individuel mais uniquement les informations applicables pour un cours collectif [...]
   une fois renseigné, l'admin pourra enregistrer les informations SANS directement convertir en
   étudiants. »

   Les trois clauses de cette phrase sont trois choses qui peuvent se perdre séparément, et
   chacune a son test ici : la trame vient bien de l'individuel mais amputée de ce qu'une vague
   fixe d'avance ; rien n'est converti ; et un candidat qu'on n'a pas vu ne reçoit pas un compte
   rendu vide. */

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ profile: { id: 'admin-1' }, session: { access_token: 'jeton' } }),
}))

const enregistrerCompteRenduOral = vi.fn(async (..._args: unknown[]) => ({ error: null as string | null }))
const lireCompteRenduOral = vi.fn(async (..._args: unknown[]) => null as unknown)
vi.mock('../../../lib/compteRenduOral', () => ({
  enregistrerCompteRenduOral: (...args: unknown[]) => enregistrerCompteRenduOral(...args),
  lireCompteRenduOral: (...args: unknown[]) => lireCompteRenduOral(...args),
}))

let misesAJour: { table: string; valeurs: Record<string, unknown>; id: unknown }[] = []
vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      update: (valeurs: Record<string, unknown>) => ({
        eq: async (_colonne: string, id: unknown) => {
          misesAJour.push({ table, valeurs, id })
          return { error: null }
        },
      }),
    }),
  },
}))

const { ResultatsSessionOraleModale } = await import('../ResultatsSessionOraleModale')

const creneau = {
  id: 'creneau-1',
  etablissement_id: 'etab-1',
  cohort_id: 'vague-1',
  debut: '2026-11-08T07:00:00.000Z',
  duree_minutes: 60,
} as never

function candidat(id: string, prenom: string, statut = 'diagnostic_planifie') {
  return {
    inscription: {
      id: `insc-${id}`,
      prospect_id: id,
      creneau_id: 'creneau-1',
      score: 16,
      total: 50,
      niveau_estime: 'Beginner',
      niveau_final: null,
    },
    prospect: { id, prenom, nom: 'RAKOTO', statut, etablissement_id: 'etab-1' },
  } as never
}

function monter(candidats: unknown[], onEnregistre = () => {}) {
  return render(
    <ResultatsSessionOraleModale
      creneau={creneau}
      candidats={candidats as never}
      onFermer={() => {}}
      onEnregistre={onEnregistre}
    />,
  )
}

beforeEach(() => {
  misesAJour = []
  enregistrerCompteRenduOral.mockClear()
  lireCompteRenduOral.mockClear()
  enregistrerCompteRenduOral.mockResolvedValue({ error: null })
  lireCompteRenduOral.mockResolvedValue(null)
})

describe('ResultatsSessionOraleModale — la trame', () => {
  it('reprend la trame de l’appel diagnostic individuel', async () => {
    monter([candidat('p-1', 'Aina')])

    // Le premier candidat est déplié d'emblée : l'admin sort de la session, il saisit.
    await screen.findByLabelText('Niveau d’anglais retenu (définitif)')
    expect(screen.getByText('Profil')).toBeTruthy()
    expect(screen.getByText('Objectifs')).toBeTruthy()
    expect(screen.getByText('Disponibilités et logistique')).toBeTruthy()
    expect(screen.getByText('Jours disponibles')).toBeTruthy()
  })

  it('n’y laisse rien de ce qu’une vague collective fixe d’avance', async () => {
    monter([candidat('p-1', 'Aina')])
    await screen.findByLabelText('Niveau d’anglais retenu (définitif)')

    expect(screen.queryByText('Rythme souhaité')).toBeNull()
    expect(screen.queryByText(/Combien d’heures par semaine/)).toBeNull()
    expect(screen.queryByText('Durée des sessions')).toBeNull()
    expect(screen.queryByText('Profil du formateur idéal')).toBeNull()
    expect(screen.queryByText('Type de programme recommandé')).toBeNull()
  })

  it('pré-remplit le niveau du quiz écrit, que l’admin n’a plus qu’à confirmer', async () => {
    monter([candidat('p-1', 'Aina')])

    const champ = (await screen.findByLabelText('Niveau d’anglais retenu (définitif)')) as HTMLSelectElement
    expect(champ.value).toBe('Beginner')
  })
})

describe('ResultatsSessionOraleModale — l’enregistrement', () => {
  it('n’écrit rien tant que l’admin n’a pas validé', async () => {
    monter([candidat('p-1', 'Aina')])
    await screen.findByLabelText('Niveau d’anglais retenu (définitif)')

    expect(enregistrerCompteRenduOral).not.toHaveBeenCalled()
    expect(misesAJour).toEqual([])
  })

  /* Le cœur de la demande : enregistrer n'est PAS convertir. Aucune route de conversion n'est
     appelée, aucun compte n'est créé, aucun frais n'est encaissé. */
  it('enregistre le compte rendu, le niveau retenu et l’étape — sans convertir', async () => {
    const onEnregistre = vi.fn()
    monter([candidat('p-1', 'Aina')], onEnregistre)

    const champ = await screen.findByLabelText('Niveau d’anglais retenu (définitif)')
    fireEvent.change(champ, { target: { value: 'Advanced' } })
    fireEvent.click(screen.getByText(/Enregistrer les résultats/))

    await waitFor(() => expect(onEnregistre).toHaveBeenCalledWith(1))

    expect(enregistrerCompteRenduOral).toHaveBeenCalledWith(
      expect.objectContaining({ prospectId: 'p-1', niveau: 'Advanced', reponses: { niveau_estime: 'Advanced' } }),
    )
    // Le niveau retenu est recopié sur l'inscription : c'est lui qui fait foi pour la classe et
    // pour le montant des frais (0118).
    expect(misesAJour).toContainEqual({
      table: 'test_positionnement_inscriptions',
      valeurs: { niveau_final: 'Advanced' },
      id: 'insc-p-1',
    })
    expect(misesAJour).toContainEqual({
      table: 'prospects',
      valeurs: { statut: 'diagnostic_fait' },
      id: 'p-1',
    })
    // Rien d'autre : ni profil créé, ni paiement, ni inscription à une vague.
    expect(misesAJour.map((m) => m.table).sort()).toEqual(['prospects', 'test_positionnement_inscriptions'])
  })

  /* Une session de deux candidats dont l'admin n'en a vu qu'un : le second ne doit pas recevoir
     un compte rendu vide, ni passer à « Test oral passé » alors qu'il n'est pas venu. */
  it('ne touche pas aux candidats laissés vides', async () => {
    monter([candidat('p-1', 'Aina'), candidat('p-2', 'Miary')], () => {})

    const champ = await screen.findByLabelText('Niveau d’anglais retenu (définitif)')
    fireEvent.change(champ, { target: { value: 'Advanced' } })
    fireEvent.click(screen.getByText(/Enregistrer les résultats/))

    await waitFor(() => expect(enregistrerCompteRenduOral).toHaveBeenCalledTimes(1))
    expect(enregistrerCompteRenduOral).toHaveBeenCalledWith(expect.objectContaining({ prospectId: 'p-1' }))
    expect(misesAJour.map((m) => m.id)).not.toContain('p-2')
  })

  /* `prospects.statut` ne revient jamais en arrière : il sert aussi de clé d'historique après la
     suppression d'un compte (suiviCollectif.ts). Rouvrir la fenêtre pour corriger le compte rendu
     d'un candidat déjà converti ne doit pas le rétrograder. */
  it('ne rétrograde pas l’étape d’un candidat déjà converti', async () => {
    monter([candidat('p-1', 'Aina', 'etudiant')])

    const champ = await screen.findByLabelText('Niveau d’anglais retenu (définitif)')
    fireEvent.change(champ, { target: { value: 'Advanced' } })
    fireEvent.click(screen.getByText(/Enregistrer les résultats/))

    await waitFor(() => expect(enregistrerCompteRenduOral).toHaveBeenCalled())
    expect(misesAJour.map((m) => m.table)).not.toContain('prospects')
  })

  it('affiche le refus du serveur plutôt qu’un message générique', async () => {
    enregistrerCompteRenduOral.mockResolvedValue({ error: 'nouvelle ligne viole la politique de sécurité' })
    monter([candidat('p-1', 'Aina')])

    const champ = await screen.findByLabelText('Niveau d’anglais retenu (définitif)')
    fireEvent.change(champ, { target: { value: 'Advanced' } })
    fireEvent.click(screen.getByText(/Enregistrer les résultats/))

    await waitFor(() => expect(screen.getByText(/viole la politique de sécurité/)).toBeTruthy())
  })

  it('rappelle à l’admin que la conversion reste à faire', async () => {
    monter([candidat('p-1', 'Aina')])
    await screen.findByLabelText('Niveau d’anglais retenu (définitif)')

    expect(screen.getByText(/sans le convertir en étudiant·e/)).toBeTruthy()
  })
})
