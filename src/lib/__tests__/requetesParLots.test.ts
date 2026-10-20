import { describe, expect, it, vi } from 'vitest'
import { selectionParLots } from '../requetesParLots'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`)

describe('selectionParLots', () => {
  it('ne lance aucune requête pour une liste vide', async () => {
    const requete = vi.fn()
    expect(await selectionParLots([], requete)).toEqual({ data: [], error: null })
    expect(requete).not.toHaveBeenCalled()
  })

  it('découpe en lots de la taille demandée et concatène les lignes', async () => {
    const requete = vi.fn(async (lot: string[]) => ({ data: lot.map((id) => ({ id })), error: null }))
    const { data, error } = await selectionParLots(ids(250), requete, 100)
    expect(requete).toHaveBeenCalledTimes(3)
    expect(requete.mock.calls.map(([lot]) => lot.length)).toEqual([100, 100, 50])
    expect(data).toHaveLength(250)
    expect(error).toBeNull()
  })

  it('dédoublonne les identifiants avant de découper', async () => {
    const requete = vi.fn(async (lot: string[]) => ({ data: lot, error: null }))
    await selectionParLots(['a', 'b', 'a', 'b', 'c'], requete, 2)
    expect(requete.mock.calls.map(([lot]) => lot)).toEqual([['a', 'b'], ['c']])
  })

  it('remonte l’erreur d’un lot au lieu de la taire', async () => {
    const requete = vi.fn(async (lot: string[]) =>
      lot.includes('id-150') ? { data: null, error: { message: 'URI too long' } } : { data: lot, error: null },
    )
    const { data, error } = await selectionParLots(ids(200), requete, 100)
    expect(error).toEqual({ message: 'URI too long' })
    expect(data).toHaveLength(100)
  })
})
