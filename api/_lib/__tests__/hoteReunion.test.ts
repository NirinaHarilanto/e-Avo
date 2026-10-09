import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { chiffrer, integrationHoteReunion, peutEcrireDansAgenda } from '../google.js'

/* Règle client du 2026-10-09 (0107) : la réunion d'un cours est hébergée par le compte Google du
   PROFESSEUR, et non plus par celui de l'établissement — y compris quand c'est l'admin qui
   planifie. C'est `integrationHoteReunion` qui porte ce choix, et ces tests fixent les quatre cas
   qui décident de l'organisateur réel : professeur en écriture, professeur en lecture seule,
   professeur sans compte, et aucun compte du tout.

   Le jeton de rafraîchissement est stocké chiffré : les fixtures passent donc par `chiffrer`, la
   vraie fonction, plutôt que par une valeur en clair que `dechiffrer` refuserait. */

const SCOPE_ECRITURE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email'
const SCOPE_LECTURE = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email'

interface Monde {
  personnelle: { google_email: string; refresh_token_chiffre: string; scope: string | null } | null
  etablissement: { google_email: string; refresh_token_chiffre: string } | null
  teacherId?: string | null
}

/* Faux client Supabase réduit aux trois lectures que la fonction effectue, et à l'écriture de
   `derniere_erreur`. Les mises à jour sont conservées pour pouvoir vérifier qu'un professeur resté
   en lecture seule est bien averti sur SA ligne, et non dans les paramètres de l'établissement. */
function clientFactice(monde: Monde) {
  const erreursNotees: { table: string; message: string | null }[] = []

  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => {
                  if (table === 'google_integrations_personnelles') return { data: monde.personnelle }
                  if (table === 'google_integrations') return { data: monde.etablissement }
                  if (table === 'sessions') return { data: { teacher_id: monde.teacherId ?? null } }
                  return { data: null }
                },
              }
            },
          }
        },
        update(valeurs: { derniere_erreur: string | null }) {
          return {
            eq: async () => {
              erreursNotees.push({ table, message: valeurs.derniere_erreur })
              return { error: null }
            },
          }
        },
      }
    },
  }

  return { client, erreursNotees }
}

type ClientAttendu = Parameters<typeof integrationHoteReunion>[0]

beforeAll(() => {
  process.env.GOOGLE_CLIENT_ID = 'client-test'
  process.env.GOOGLE_CLIENT_SECRET = 'secret-test'
  process.env.GOOGLE_REDIRECT_URI = 'https://exemple.test/callback'
  process.env.GOOGLE_TOKEN_KEY = 'cle-de-chiffrement-de-test'
})

beforeEach(() => {
  /* Seul appel réseau du chemin testé : l'échange du jeton de rafraîchissement contre un jeton
     d'accès. */
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ access_token: 'jeton-acces' }), { status: 200 })),
  )
})

describe('peutEcrireDansAgenda', () => {
  it('reconnaît le scope d’écriture', () => {
    expect(peutEcrireDansAgenda(SCOPE_ECRITURE)).toBe(true)
  })

  it('refuse un compte connecté en lecture seule, comme avant le 2026-10-09', () => {
    expect(peutEcrireDansAgenda(SCOPE_LECTURE)).toBe(false)
  })

  it('refuse un scope absent', () => {
    expect(peutEcrireDansAgenda(null)).toBe(false)
  })
})

describe('integrationHoteReunion', () => {
  it('héberge la réunion chez le professeur quand son compte sait écrire', async () => {
    const { client } = clientFactice({
      personnelle: {
        google_email: 'prof@exemple.test',
        refresh_token_chiffre: await chiffrer('jeton-prof'),
        scope: SCOPE_ECRITURE,
      },
      etablissement: { google_email: 'admin@harionlineclub.com', refresh_token_chiffre: await chiffrer('jeton-etab') },
    })

    const hote = await integrationHoteReunion(client as unknown as ClientAttendu, {
      organisateurId: 'prof-1',
      etablissementId: 'etab-1',
    })

    expect(hote?.type).toBe('professeur')
    expect(hote?.googleEmail).toBe('prof@exemple.test')
  })

  it('retombe sur l’établissement quand le professeur n’a connecté qu’une lecture seule, et l’en avertit', async () => {
    const { client, erreursNotees } = clientFactice({
      personnelle: {
        google_email: 'prof@exemple.test',
        refresh_token_chiffre: await chiffrer('jeton-prof'),
        scope: SCOPE_LECTURE,
      },
      etablissement: { google_email: 'admin@harionlineclub.com', refresh_token_chiffre: await chiffrer('jeton-etab') },
    })

    const hote = await integrationHoteReunion(client as unknown as ClientAttendu, {
      organisateurId: 'prof-1',
      etablissementId: 'etab-1',
    })

    expect(hote?.type).toBe('etablissement')
    expect(hote?.googleEmail).toBe('admin@harionlineclub.com')
    /* L'avertissement doit atterrir sur la ligne du professeur : c'est lui qui doit reconnecter
       son compte, et c'est son écran « Mon profil » qui lit cette colonne. */
    expect(erreursNotees).toHaveLength(1)
    expect(erreursNotees[0].table).toBe('google_integrations_personnelles')
    expect(erreursNotees[0].message).toContain('lecture seule')
  })

  it('retombe sur l’établissement quand le professeur n’a rien connecté, sans rien signaler', async () => {
    const { client, erreursNotees } = clientFactice({
      personnelle: null,
      etablissement: { google_email: 'admin@harionlineclub.com', refresh_token_chiffre: await chiffrer('jeton-etab') },
    })

    const hote = await integrationHoteReunion(client as unknown as ClientAttendu, {
      organisateurId: 'prof-1',
      etablissementId: 'etab-1',
    })

    expect(hote?.type).toBe('etablissement')
    /* Ne pas avoir connecté son agenda n'est pas un incident Google : rien à noter. */
    expect(erreursNotees).toHaveLength(0)
  })

  it('ne renvoie aucun hôte quand aucun compte n’est connecté', async () => {
    const { client } = clientFactice({ personnelle: null, etablissement: null })

    const hote = await integrationHoteReunion(client as unknown as ClientAttendu, {
      organisateurId: 'prof-1',
      etablissementId: 'etab-1',
    })

    expect(hote).toBeNull()
  })

  it('utilise l’établissement quand la réunion n’a pas d’organisateur identifié', async () => {
    const { client } = clientFactice({
      personnelle: {
        google_email: 'prof@exemple.test',
        refresh_token_chiffre: await chiffrer('jeton-prof'),
        scope: SCOPE_ECRITURE,
      },
      etablissement: { google_email: 'admin@harionlineclub.com', refresh_token_chiffre: await chiffrer('jeton-etab') },
    })

    const hote = await integrationHoteReunion(client as unknown as ClientAttendu, {
      organisateurId: null,
      etablissementId: 'etab-1',
    })

    /* Sans organisateur, aucune raison d'aller chercher un agenda personnel : c'est un rendez-vous
       de l'établissement. */
    expect(hote?.type).toBe('etablissement')
  })
})
