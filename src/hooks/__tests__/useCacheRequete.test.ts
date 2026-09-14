import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCacheRequete } from '../useCacheRequete'

/* Le cache est un module-level Map, partagé entre tous les tests de ce fichier — chaque test
   utilise donc sa propre clé pour ne pas lire l'état laissé par le précédent. */
let compteurCle = 0
function cleUnique() {
  compteurCle += 1
  return `test-${compteurCle}`
}

describe('useCacheRequete', () => {
  it('charge la valeur au montage quand rien n’est en cache', async () => {
    const cle = cleUnique()
    const requete = vi.fn().mockResolvedValue('donnee')
    const { result } = renderHook(() => useCacheRequete(cle, requete))

    expect(result.current.loading).toBe(true)
    expect(result.current.valeur).toBeUndefined()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.valeur).toBe('donnee')
    expect(requete).toHaveBeenCalledTimes(1)
  })

  it('affiche instantanément une valeur déjà en cache, sans passer par loading', async () => {
    const cle = cleUnique()
    const requeteInitiale = vi.fn().mockResolvedValue('premiere-visite')
    const { result: premierMontage, unmount } = renderHook(() => useCacheRequete(cle, requeteInitiale))
    await waitFor(() => expect(premierMontage.current.loading).toBe(false))
    unmount()

    const requeteRafraichissement = vi.fn().mockResolvedValue('valeur-rafraichie')
    const { result: retourSurLaPage } = renderHook(() => useCacheRequete(cle, requeteRafraichissement))

    // La donnée du premier montage s'affiche tout de suite, avant même que la requête de
    // rafraîchissement ait résolu — c'est tout l'intérêt du cache : pas d'écran de chargement au
    // retour sur une page déjà visitée.
    expect(retourSurLaPage.current.loading).toBe(false)
    expect(retourSurLaPage.current.valeur).toBe('premiere-visite')

    await waitFor(() => expect(retourSurLaPage.current.valeur).toBe('valeur-rafraichie'))
  })

  it('recharger() écrase la valeur en cache et la valeur affichée', async () => {
    const cle = cleUnique()
    const requete = vi.fn().mockResolvedValueOnce('initiale').mockResolvedValueOnce('mise-a-jour')
    const { result } = renderHook(() => useCacheRequete(cle, requete))
    await waitFor(() => expect(result.current.valeur).toBe('initiale'))

    await act(async () => {
      await result.current.recharger()
    })
    expect(result.current.valeur).toBe('mise-a-jour')
  })

  it('remonte l’échec de la requête sans effacer la valeur déjà affichée', async () => {
    const cle = cleUnique()
    const requete = vi.fn().mockRejectedValue(new Error('panne réseau'))
    const { result } = renderHook(() => useCacheRequete(cle, requete))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.erreur).toBe('panne réseau')
  })

  it('ne déclenche aucune requête tant que la clé est absente', () => {
    const requete = vi.fn().mockResolvedValue('donnee')
    const { result } = renderHook(() => useCacheRequete(undefined, requete))

    expect(requete).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
  })
})
