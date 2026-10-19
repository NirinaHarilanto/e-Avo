import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { messageAttente, verifierDebit } from '../limiteDebit.js'

/* Signalé par le client le 2026-10-19, capture à l'appui : bloqué au bouton « Valider ma
   réservation » après avoir répondu aux 67 questions du test collectif, avec pour seule
   explication « Trop de tentatives. Réessayez dans un instant. » — alors que la fenêtre dure une
   heure entière. Il a recliqué, attendu « un instant », recliqué encore, sans jamais savoir
   combien de temps il lui restait à patienter.

   Ces tests verrouillent le refus honnête : le message porte l'attente qui RESTE, calculée sur
   l'expiration du compteur et non sur la durée de la fenêtre, et `Retry-After` dit la même
   chose. */

describe('messageAttente', () => {
  it('ne promet jamais « un instant » pour une heure d’attente', () => {
    expect(messageAttente(3600)).toBe('Trop de tentatives. Réessayez dans une heure.')
    expect(messageAttente(3600)).not.toContain('instant')
  })

  it('annonce les minutes restantes, arrondies au-dessus', () => {
    expect(messageAttente(2940)).toBe('Trop de tentatives. Réessayez dans 49 minutes.')
    expect(messageAttente(61)).toBe('Trop de tentatives. Réessayez dans 2 minutes.')
  })

  it('reste simple sous la minute', () => {
    expect(messageAttente(60)).toBe('Trop de tentatives. Réessayez dans une minute.')
    expect(messageAttente(0)).toBe('Trop de tentatives. Réessayez dans une minute.')
  })
})

let autorise = true
let expireLe: string | null = null

function clientFactice() {
  return {
    rpc: async () => ({ data: autorise, error: null }),
    from: (table: string) => {
      if (table !== 'limites_debit') throw new Error('table inattendue : ' + table)
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: expireLe ? { expire_le: expireLe } : null }) }) }),
      }
    },
  } as never
}

const limite = { route: 'inscrire-test', max: 15, fenetreSecondes: 3600 }

beforeEach(() => {
  autorise = true
  expireLe = null
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('verifierDebit', () => {
  const requete = new Request('https://exemple.test/api/prospects/inscrire-test', {
    headers: { 'x-forwarded-for': '41.188.0.1' },
  })

  it('laisse passer sous le plafond', async () => {
    expect(await verifierDebit(requete, clientFactice(), limite)).toBeNull()
  })

  it('annonce l’attente qui reste, pas la fenêtre entière', async () => {
    autorise = false
    // Compteur ouvert il y a 11 minutes : il reste 49 minutes, pas une heure.
    expireLe = '2026-10-19T12:49:00Z'
    const refus = await verifierDebit(requete, clientFactice(), limite)
    expect(refus?.status).toBe(429)
    expect(refus?.headers.get('Retry-After')).toBe('2940')
    expect(await refus?.json()).toMatchObject({
      error: 'Trop de tentatives. Réessayez dans 49 minutes.',
      secondesRestantes: 2940,
    })
  })

  it('retombe sur la fenêtre si l’expiration est illisible, sans jamais échouer', async () => {
    autorise = false
    expireLe = null
    const refus = await verifierDebit(requete, clientFactice(), limite)
    expect(refus?.status).toBe(429)
    expect(await refus?.json()).toMatchObject({ secondesRestantes: 3600 })
  })
})
