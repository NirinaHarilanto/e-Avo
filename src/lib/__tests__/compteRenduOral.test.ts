import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-11-08 : l'admin enregistre le compte rendu du test oral dès la fin de
   la session, « sans directement convertir en étudiants ». Le piège que ce fichier garde : un
   candidat collectif a DÉJÀ une ligne `diagnostic_calls` avant tout oral — celle créée
   automatiquement à son inscription au test (api/prospects/inscrire-test.ts), qui porte le bilan
   et le niveau du quiz ÉCRIT. Reprendre « le dernier diagnostic du prospect » écraserait ce
   bilan, pourtant affiché tel quel dans sa fiche et jamais réécrit (même raisonnement que la
   migration 0118, qui distingue les deux par ce même préfixe).

   L'autre moitié de l'enjeu est symétrique : une fois le compte rendu d'oral enregistré, la
   conversion ne doit PAS en créer un second — sinon les écrans divergent selon qu'ils lisent la
   ligne la plus récente ou la première. */

const BILAN_QUIZ = 'Test de positionnement écrit : 16/50 — niveau estimé Beginner.\n\nPoints à revoir (34) :'

let lignes: { id: string; notes: string | null; reponses?: Record<string, unknown>; niveau_evalue?: string | null }[] = []
let operations: { type: string; table: string; id?: unknown; valeurs: Record<string, unknown> }[] = []

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: lignes, error: null }),
        }),
      }),
      update: (valeurs: Record<string, unknown>) => ({
        eq: async (_colonne: string, id: unknown) => {
          operations.push({ type: 'update', table, id, valeurs })
          return { error: null }
        },
      }),
      insert: async (valeurs: Record<string, unknown>) => {
        operations.push({ type: 'insert', table, valeurs })
        return { error: null }
      },
    }),
  },
}))

const { enregistrerCompteRenduOral, lireCompteRenduOral } = await import('../compteRenduOral')

const base = {
  etablissementId: 'etab-1',
  prospectId: 'prospect-1',
  meneParProfileId: 'admin-1',
  niveau: 'Intermediate',
}

beforeEach(() => {
  lignes = []
  operations = []
})

describe('enregistrerCompteRenduOral', () => {
  it('crée une ligne quand le prospect n’a que le bilan de son quiz écrit', async () => {
    lignes = [{ id: 'quiz-1', notes: BILAN_QUIZ }]

    const { error } = await enregistrerCompteRenduOral({ ...base, reponses: { niveau_estime: 'Intermediate' } })

    expect(error).toBeNull()
    expect(operations).toHaveLength(1)
    expect(operations[0].type).toBe('insert')
    expect(operations[0].valeurs).toMatchObject({
      prospect_id: 'prospect-1',
      niveau_evalue: 'Intermediate',
      reponses: { niveau_estime: 'Intermediate' },
    })
  })

  it('n’écrase jamais le bilan du quiz, même quand c’est la ligne la plus récente', async () => {
    // Ordre renvoyé par la base : date décroissante. Le quiz est en tête, l'oral juste derrière.
    lignes = [
      { id: 'quiz-1', notes: BILAN_QUIZ },
      { id: 'oral-1', notes: 'Profil détaillé :\nTravaille dans le tourisme' },
    ]

    await enregistrerCompteRenduOral({ ...base, reponses: { niveau_estime: 'Advanced' } })

    expect(operations).toEqual([
      expect.objectContaining({ type: 'update', id: 'oral-1' }),
    ])
  })

  it('complète la ligne de l’oral déjà enregistrée au lieu d’en créer une seconde', async () => {
    lignes = [{ id: 'oral-1', notes: null }]

    await enregistrerCompteRenduOral({ ...base, reponses: { niveau_estime: 'Advanced' } })

    expect(operations).toHaveLength(1)
    expect(operations[0]).toMatchObject({
      type: 'update',
      id: 'oral-1',
      valeurs: { niveau_evalue: 'Intermediate', reponses: { niveau_estime: 'Advanced' } },
    })
  })

  /* La fenêtre de conversion ne saisit que du texte libre : lui faire écrire un objet de
     réponses vide effacerait la trame remplie à la fin de la session. */
  it('laisse intactes les réponses existantes quand l’appelant n’en passe aucune', async () => {
    lignes = [{ id: 'oral-1', notes: null }]

    await enregistrerCompteRenduOral({ ...base, notes: 'Objectifs :\nVoyager' })

    expect(operations[0].valeurs).toEqual({ niveau_evalue: 'Intermediate', notes: 'Objectifs :\nVoyager' })
    expect(operations[0].valeurs).not.toHaveProperty('reponses')
  })

  /* Et symétriquement : la saisie des résultats de session ne porte pas de texte libre. */
  it('laisse intactes les notes existantes quand l’appelant n’en passe aucune', async () => {
    lignes = [{ id: 'oral-1', notes: 'Compte rendu saisi à la main' }]

    await enregistrerCompteRenduOral({ ...base, reponses: { aisance_presentation: 'Plutôt oui' } })

    expect(operations[0].valeurs).not.toHaveProperty('notes')
  })

  it('écrit bien dans diagnostic_calls, et nulle part ailleurs', async () => {
    lignes = []
    await enregistrerCompteRenduOral({ ...base, reponses: { niveau_estime: 'Beginner' } })
    expect(operations.map((o) => o.table)).toEqual(['diagnostic_calls'])
  })
})

describe('lireCompteRenduOral', () => {
  it('ignore le bilan du quiz écrit', async () => {
    lignes = [{ id: 'quiz-1', notes: BILAN_QUIZ, reponses: {}, niveau_evalue: 'Beginner' }]

    expect(await lireCompteRenduOral('prospect-1')).toBeNull()
  })

  it('rend les réponses et le niveau du compte rendu d’oral', async () => {
    lignes = [
      { id: 'quiz-1', notes: BILAN_QUIZ, reponses: {}, niveau_evalue: 'Beginner' },
      { id: 'oral-1', notes: null, reponses: { niveau_estime: 'Advanced' }, niveau_evalue: 'Advanced' },
    ]

    expect(await lireCompteRenduOral('prospect-1')).toEqual({
      reponses: { niveau_estime: 'Advanced' },
      niveau: 'Advanced',
    })
  })

  it('tolère une ligne d’oral sans aucune réponse enregistrée', async () => {
    lignes = [{ id: 'oral-1', notes: 'Notes libres', reponses: undefined, niveau_evalue: null }]

    expect(await lireCompteRenduOral('prospect-1')).toEqual({ reponses: {}, niveau: null })
  })
})
