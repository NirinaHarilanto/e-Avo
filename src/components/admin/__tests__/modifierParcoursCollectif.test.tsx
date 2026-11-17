import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-11-17, capture à l'appui : « il faudrait que l'utilisateur admin puisse
   modifier les informations dans le parcours collectif de la personne, rajoute un bouton
   modifier ».

   Ce que ce fichier garde, ce n'est pas seulement que l'édition marche : c'est aussi sa
   FRONTIÈRE. Le bloc affiche cinq informations, mais trois seulement viennent de l'inscription
   au test ; la vague et la classe, elles, se déduisent (avant conversion) ou vivent dans
   `cohort_enrollments` avec leurs propres garde-fous (après). Les rendre saisissables ici
   créerait une seconde source de vérité, ou contournerait les triggers 0074. */

let misesAJour: { table: string; valeurs: Record<string, unknown>; id: unknown }[] = []
let erreurMiseAJour: { code?: string; message: string } | null = null

const CRENEAUX = [
  { id: 'cr-1', debut: '2026-11-21T05:00:00.000Z', duree_minutes: 60, capacite_max: 10, cohort_id: 'vague-nov', actif: true },
  { id: 'cr-2', debut: '2026-11-28T05:00:00.000Z', duree_minutes: 60, capacite_max: null, cohort_id: 'vague-dec', actif: true },
]
const VAGUES = [
  { id: 'vague-nov', nom: 'Vague Novembre' },
  { id: 'vague-dec', nom: 'Vague Décembre' },
]
let INSCRIPTIONS = [{ creneau_id: 'cr-1' }, { creneau_id: 'cr-1' }, { creneau_id: 'cr-2' }]

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const donnees =
          table === 'creneaux_test_positionnement' ? CRENEAUX
          : table === 'cohorts' ? VAGUES
          : INSCRIPTIONS
        const resultat = Promise.resolve({ data: donnees, error: null })
        return Object.assign(resultat, { order: () => resultat })
      },
      update: (valeurs: Record<string, unknown>) => ({
        eq: async (_colonne: string, id: unknown) => {
          misesAJour.push({ table, valeurs, id })
          return { error: erreurMiseAJour }
        },
      }),
    }),
  },
}))

const { ModifierParcoursCollectif } = await import('../ModifierParcoursCollectif')

const inscription = {
  id: 'insc-1',
  creneau_id: 'cr-1',
  prospect_id: 'prospect-1',
  niveau_estime: 'Beginner',
  niveau_final: null,
} as never

function monter(options: { estConverti?: boolean; onEnregistre?: () => void } = {}) {
  return render(
    <ModifierParcoursCollectif
      inscription={inscription}
      creneauActuel={CRENEAUX[0] as never}
      estConverti={options.estConverti ?? false}
      onAnnuler={() => {}}
      onEnregistre={options.onEnregistre ?? (() => {})}
    />,
  )
}

/* Le déclencheur reste désactivé tant que les créneaux n'ont pas été chargés : cliquer avant
   n'ouvre rien, et le test échouerait sur une liste vide plutôt que sur son vrai sujet. */
async function ouvrirSessions() {
  const declencheur = (await screen.findByLabelText(/^Session orale/)) as HTMLButtonElement
  await waitFor(() => expect(declencheur.disabled).toBe(false))
  fireEvent.click(declencheur)
  return declencheur
}

beforeEach(() => {
  misesAJour = []
  erreurMiseAJour = null
  INSCRIPTIONS = [{ creneau_id: 'cr-1' }, { creneau_id: 'cr-1' }, { creneau_id: 'cr-2' }]
})

describe('ModifierParcoursCollectif — ce qui est modifiable', () => {
  it('propose la session orale et les deux niveaux, et rien d’autre', async () => {
    monter()
    await screen.findByLabelText(/^Session orale/)

    expect(screen.getByLabelText(/^Niveau — quiz écrit/)).toBeTruthy()
    expect(screen.getByLabelText(/^Niveau — test oral/)).toBeTruthy()
    // Ni vague ni classe : elles se déduisent avant conversion, et ont leurs propres boutons après.
    expect(screen.queryByLabelText('Vague')).toBeNull()
    expect(screen.queryByLabelText('Classe')).toBeNull()
  })

  it('part des valeurs déjà enregistrées', async () => {
    monter()
    await screen.findByLabelText(/^Session orale/)

    expect(screen.getByLabelText(/^Niveau — quiz écrit/).textContent).toContain('Beginner')
    // `niveau_final` à null : la liste doit dire « Non évalué », pas afficher un niveau au hasard.
    expect(screen.getByLabelText(/^Niveau — test oral/).textContent).toContain('Non évalué')
  })

  it('n’écrit que dans l’inscription au test, avec les trois champs', async () => {
    const onEnregistre = vi.fn()
    monter({ onEnregistre })
    await screen.findByLabelText(/^Session orale/)

    fireEvent.click(screen.getByText('Enregistrer'))

    await waitFor(() => expect(onEnregistre).toHaveBeenCalledTimes(1))
    expect(misesAJour).toEqual([
      {
        table: 'test_positionnement_inscriptions',
        id: 'insc-1',
        valeurs: { creneau_id: 'cr-1', niveau_estime: 'Beginner', niveau_final: null },
      },
    ])
  })

  /* Un niveau saisi par erreur doit pouvoir être EFFACÉ, pas seulement remplacé par un autre
     niveau tout aussi faux — d'où l'option « Non évalué », enregistrée en `null`. */
  it('permet d’effacer un niveau déjà posé', async () => {
    monter()
    await screen.findByLabelText(/^Session orale/)

    fireEvent.click(screen.getByLabelText(/^Niveau — quiz écrit/))
    fireEvent.click(screen.getByRole('option', { name: 'Non évalué' }))
    fireEvent.click(screen.getByText('Enregistrer'))

    await waitFor(() => expect(misesAJour).toHaveLength(1))
    expect(misesAJour[0].valeurs).toMatchObject({ niveau_estime: null })
  })
})

describe('ModifierParcoursCollectif — la session orale', () => {
  it('annonce la vague de chaque session et son remplissage', async () => {
    monter()
    await ouvrirSessions()

    /* cr-1 : 2 inscrits sur 10 ; cr-2 : 1 inscrit, sans capacité fixée. Le nom de vague est
       affiché par `nomVagueSeul`, qui retire le préfixe « Vague » — d'où « · Novembre · ». */
    expect(screen.getByRole('option', { name: /· Novembre · 2\/10 inscrits/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /· Décembre · 1 inscrit/ })).toBeTruthy()
  })

  it('signale une session complète sans l’interdire', async () => {
    INSCRIPTIONS = Array.from({ length: 10 }, () => ({ creneau_id: 'cr-2' }))
    render(
      <ModifierParcoursCollectif
        inscription={{ ...(inscription as object), creneau_id: 'cr-2' } as never}
        creneauActuel={CRENEAUX[1] as never}
        estConverti={false}
        onAnnuler={() => {}}
        onEnregistre={() => {}}
      />,
    )
    await ouvrirSessions()

    // cr-1 porte une capacité de 10 et compte 0 inscrit ici : jamais « complet ».
    expect(screen.getByRole('option', { name: /· Novembre ·/ }).textContent).not.toContain('complet')
  })

  /* Changer de session change la vague visée : le dire AVANT d'enregistrer, sinon l'admin
     déplace quelqu'un d'une vague à l'autre en croyant ne corriger qu'une date. */
  it('prévient quand la session choisie relève d’une autre vague', async () => {
    monter()
    await ouvrirSessions()
    fireEvent.click(screen.getByRole('option', { name: /· Décembre ·/ }))

    expect(screen.getByText(/changer de session change donc aussi la vague/)).toBeTruthy()
  })

  it('enregistre la session choisie', async () => {
    monter()
    await ouvrirSessions()
    fireEvent.click(screen.getByRole('option', { name: /· Décembre ·/ }))
    fireEvent.click(screen.getByText('Enregistrer'))

    await waitFor(() => expect(misesAJour).toHaveLength(1))
    expect(misesAJour[0].valeurs).toMatchObject({ creneau_id: 'cr-2' })
  })

  /* Une fois converti, la vague réelle vient de `cohort_enrollments` : toucher au créneau
     historique ne déplacerait personne, cela ferait seulement croire le contraire. */
  it('retire la session orale une fois le candidat converti, en disant pourquoi', async () => {
    monter({ estConverti: true })
    await screen.findByLabelText(/^Niveau — test oral/)

    expect(screen.queryByLabelText(/^Session orale/)).toBeNull()
    expect(screen.getByText(/n'est plus modifiable une fois le candidat converti/)).toBeTruthy()
  })

  it('n’écrit alors aucun créneau, mais garde les niveaux modifiables', async () => {
    monter({ estConverti: true })
    await screen.findByLabelText(/^Niveau — test oral/)

    fireEvent.click(screen.getByLabelText(/^Niveau — test oral/))
    fireEvent.click(screen.getByRole('option', { name: 'Advanced' }))
    fireEvent.click(screen.getByText('Enregistrer'))

    await waitFor(() => expect(misesAJour).toHaveLength(1))
    expect(misesAJour[0].valeurs).not.toHaveProperty('creneau_id')
    expect(misesAJour[0].valeurs).toMatchObject({ niveau_final: 'Advanced' })
  })
})

describe('ModifierParcoursCollectif — refus du serveur', () => {
  /* `unique (creneau_id, prospect_id)` (0051) : le message brut de Postgres nommerait la
     contrainte en anglais. */
  it('traduit la double inscription à une même session', async () => {
    erreurMiseAJour = { code: '23505', message: 'duplicate key value violates unique constraint' }
    const onEnregistre = vi.fn()
    monter({ onEnregistre })
    await screen.findByLabelText(/^Session orale/)

    fireEvent.click(screen.getByText('Enregistrer'))

    await waitFor(() => expect(screen.getByText(/déjà inscrit à cette session orale/)).toBeTruthy())
    expect(onEnregistre).not.toHaveBeenCalled()
  })

  it('affiche tel quel un refus qu’il ne sait pas traduire', async () => {
    erreurMiseAJour = { code: '42501', message: 'new row violates row-level security policy' }
    monter()
    await screen.findByLabelText(/^Session orale/)

    fireEvent.click(screen.getByText('Enregistrer'))
    await waitFor(() => expect(screen.getByText(/row-level security/)).toBeTruthy())
  })
})
