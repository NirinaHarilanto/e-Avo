import { beforeEach, describe, expect, it, vi } from 'vitest'

/* Le cache des profils est la seule donnée de l'application servie depuis la mémoire sans passer
   par useCacheRequete. Ces tests verrouillent ce qui doit rester vrai : il accélère, mais il ne
   doit JAMAIS afficher une valeur d'avant une écriture. */

const select = vi.fn()
vi.mock('../supabaseClient', () => ({ supabase: { from: () => ({ select }) } }))

const videurs: (() => void)[] = []
vi.mock('../synchro', () => ({ surMutation: (fn: () => void) => { videurs.push(fn); return () => {} } }))

const { chargerProfilsEtablissement } = await import('../profilsEtablissement')
const muter = () => videurs.forEach((f) => f())

beforeEach(() => {
  select.mockReset()
  muter() // chaque test repart d'un cache vide
})

describe('chargerProfilsEtablissement', () => {
  it('ne fait qu’une seule requête pour des appels simultanés', async () => {
    select.mockResolvedValue({ data: [{ id: 'a' }], error: null })
    const [u, d] = await Promise.all([chargerProfilsEtablissement(), chargerProfilsEtablissement()])
    expect(select).toHaveBeenCalledTimes(1)
    expect(u).toEqual([{ id: 'a' }])
    expect(d).toEqual([{ id: 'a' }])
  })

  it('réutilise la réponse juste après, sans repartir en réseau', async () => {
    select.mockResolvedValue({ data: [{ id: 'a' }], error: null })
    await chargerProfilsEtablissement()
    await chargerProfilsEtablissement()
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('oublie tout dès qu’une écriture a lieu — jamais de valeur d’avant', async () => {
    select.mockResolvedValue({ data: [{ id: 'avant' }], error: null })
    await chargerProfilsEtablissement()
    muter()
    select.mockResolvedValue({ data: [{ id: 'apres' }], error: null })
    await expect(chargerProfilsEtablissement()).resolves.toEqual([{ id: 'apres' }])
    expect(select).toHaveBeenCalledTimes(2)
  })

  it('oublie aussi la réponse passée le délai de cache', async () => {
    vi.useFakeTimers()
    try {
      select.mockResolvedValue({ data: [{ id: 'a' }], error: null })
      await chargerProfilsEtablissement()
      vi.setSystemTime(Date.now() + 6_000)
      await chargerProfilsEtablissement()
      expect(select).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ne met jamais un échec en cache : l’appel suivant retente', async () => {
    select.mockResolvedValue({ data: null, error: { message: 'réseau coupé' } })
    await expect(chargerProfilsEtablissement()).rejects.toThrow('réseau coupé')
    select.mockResolvedValue({ data: [{ id: 'a' }], error: null })
    await expect(chargerProfilsEtablissement()).resolves.toEqual([{ id: 'a' }])
    expect(select).toHaveBeenCalledTimes(2)
  })
})
