import { beforeAll, describe, expect, it, vi } from 'vitest'

/* Un client Supabase minimal, qui ne sait répondre QU'À la requête `etablissements` par laquelle
   `candidater.ts` commence une fois les validations amont passées — et lui répond « rien trouvé »
   immédiatement, plutôt que de laisser le vrai client tenter un appel réseau vers une URL de
   test et expirer au bout de plusieurs secondes. Suffisant pour prouver qu'une requête a DÉPASSÉ
   le contrôle de précision du diplôme : si elle ne l'avait pas dépassé, l'erreur renvoyée porterait
   sur le diplôme, pas sur l'établissement. */
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    // `verifierDebit` (limiteDebit.ts) interroge ce RPC avant même la recherche de
    // l'établissement — « autorisé » pour laisser la requête poursuivre son chemin normal.
    rpc: async () => ({ data: true, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null }),
        }),
      }),
    }),
  }),
}))

/* « Autre diplôme ou certificat » ne dit rien par lui-même — demande client du 2026-10-10 : une
   zone de texte libre doit permettre au candidat de préciser son diplôme, et ce champ doit être
   obligatoire. Vérifié CÔTÉ SERVEUR, pas seulement dans le formulaire : une requête forgée
   pourrait sinon envoyer `diplomeDeclare: 'autre'` sans aucune précision. Ce contrôle est placé
   AVANT toute connexion à Supabase (voir candidater.ts), donc testable sans mock de base de
   données — seules les variables d'environnement doivent être posées pour dépasser le tout
   premier garde-fou de configuration. */

beforeAll(() => {
  process.env.SUPABASE_URL = 'https://exemple.test'
  process.env.SUPABASE_SECRET_KEY = 'cle-test'
})

const { default: handler } = await import('../candidater.js')

function corpsValide(champs: Record<string, unknown> = {}) {
  return {
    etablissementSlug: 'hari-online-course',
    dossierId: '11111111-1111-1111-1111-111111111111',
    prenom: 'Ana',
    nom: 'Rivot',
    email: 'ana@exemple.test',
    motivation: 'Motivée.',
    experiences: 'Cinq ans d’expérience.',
    diplomeDeclare: 'autre',
    fichiers: [],
    ...champs,
  }
}

function requete(corps: Record<string, unknown>) {
  return new Request('https://exemple.test/api/recrutement/candidater', {
    method: 'POST',
    body: JSON.stringify(corps),
  })
}

describe('api/recrutement/candidater — précision du diplôme « autre »', () => {
  it('refuse « autre » sans aucune précision', async () => {
    const reponse = await handler(requete(corpsValide()))
    const corps = (await reponse.json()) as { error?: string }
    expect(reponse.status).toBe(400)
    expect(corps.error).toContain('Précisez le nom ou la description')
  })

  it('refuse « autre » avec une précision ne contenant que des espaces', async () => {
    const reponse = await handler(requete(corpsValide({ diplomeAutrePrecision: '   ' })))
    expect(reponse.status).toBe(400)
  })

  it('refuse une précision de plus de 200 caractères', async () => {
    const reponse = await handler(requete(corpsValide({ diplomeAutrePrecision: 'x'.repeat(201) })))
    const corps = (await reponse.json()) as { error?: string }
    expect(reponse.status).toBe(400)
    expect(corps.error).toContain('200 caractères')
  })

  it('ne bloque pas sur ce contrôle quand une précision est fournie (dépasse jusqu’à la recherche de l’établissement)', async () => {
    const reponse = await handler(requete(corpsValide({ diplomeAutrePrecision: 'Master en linguistique anglaise' })))
    const corps = (await reponse.json()) as { error?: string }
    expect(corps.error).toBe('Établissement introuvable.')
  })

  it('ne demande aucune précision pour un diplôme autre que « autre »', async () => {
    const reponse = await handler(requete(corpsValide({ diplomeDeclare: 'tefl' })))
    const corps = (await reponse.json()) as { error?: string }
    expect(corps.error).toBe('Établissement introuvable.')
  })
})
