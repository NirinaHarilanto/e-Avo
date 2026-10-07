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

/* Contrôle depuis le test le moment où une requête « répond », pour simuler un enchaînement
   précis (une clé qui change avant que la précédente ait fini de charger). */
function creerPromesseDifferee<T>() {
  let resoudre!: (valeur: T) => void
  const promesse = new Promise<T>((r) => {
    resoudre = r
  })
  return { promesse, resoudre }
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

  /* Cas réel : EtudiantsAdmin.tsx affiche <DossierPanel studentId={id} /> sans `key={id}` — React
     Router change `id` (l'URL) sans remonter le composant quand l'admin clique un autre étudiant
     dans la liste. useDossierEtudiant(studentId) reçoit alors une nouvelle clé sur une instance
     de hook déjà montée, pas sur un nouveau montage. */
  it("n'affiche pas la donnée de l'ancienne clé sous la nouvelle quand une instance déjà montée change de clé", async () => {
    const cleA = cleUnique()
    const cleB = cleUnique()
    const differeeB = creerPromesseDifferee<string>()

    const { result, rerender } = renderHook(({ cle }) => useCacheRequete(cle, () => (cle === cleA ? Promise.resolve('donnee-A') : differeeB.promesse)), {
      initialProps: { cle: cleA },
    })
    await waitFor(() => expect(result.current.valeur).toBe('donnee-A'))

    rerender({ cle: cleB })
    // Immédiatement après le changement de clé, avant même que la nouvelle requête ait répondu :
    // plus question d'afficher « donnee-A » sous la nouvelle personne.
    expect(result.current.valeur).toBeUndefined()
    expect(result.current.loading).toBe(true)

    differeeB.resoudre('donnee-B')
    await waitFor(() => expect(result.current.valeur).toBe('donnee-B'))
  })

  it("une réponse tardive d'une clé abandonnée n'écrase pas la donnée de la clé actuelle", async () => {
    const cleA = cleUnique()
    const cleB = cleUnique()
    const differeeA = creerPromesseDifferee<string>()

    const { result, rerender } = renderHook(({ cle }) => useCacheRequete(cle, () => (cle === cleA ? differeeA.promesse : Promise.resolve('donnee-B'))), {
      initialProps: { cle: cleA },
    })

    // L'admin change de sélection avant que la requête pour cleA n'ait eu le temps de répondre.
    rerender({ cle: cleB })
    await waitFor(() => expect(result.current.valeur).toBe('donnee-B'))

    differeeA.resoudre('donnee-A-en-retard')
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current.valeur).toBe('donnee-B')
  })

  it('ne lance qu’une requête quand plusieurs composants demandent la même clé en même temps', async () => {
    // Cas courant : un écran monte plusieurs composants qui veulent la même donnée, et un signal
    // de synchronisation les relance tous à la même seconde.
    const cle = cleUnique()
    const differee = creerPromesseDifferee<string>()
    const requete = vi.fn().mockReturnValue(differee.promesse)

    const premier = renderHook(() => useCacheRequete(cle, requete))
    const second = renderHook(() => useCacheRequete(cle, requete))
    const troisieme = renderHook(() => useCacheRequete(cle, requete))

    expect(requete).toHaveBeenCalledTimes(1)

    await act(async () => {
      differee.resoudre('donnee-partagee')
      await differee.promesse
    })

    // La réponse unique alimente bien les trois.
    for (const rendu of [premier, second, troisieme]) {
      await waitFor(() => expect(rendu.result.current.valeur).toBe('donnee-partagee'))
    }
  })

  it('refait un appel réseau quand on recharge après coup', async () => {
    // La fusion ne vaut que pour les appels SIMULTANÉS : un rechargement ultérieur doit
    // réinterroger le serveur, sinon la donnée ne se rafraîchirait jamais après une mutation.
    const cle = cleUnique()
    const requete = vi.fn().mockResolvedValue('v1')
    const { result } = renderHook(() => useCacheRequete(cle, requete))
    await waitFor(() => expect(result.current.valeur).toBe('v1'))
    expect(requete).toHaveBeenCalledTimes(1)

    requete.mockResolvedValue('v2')
    await act(async () => {
      await result.current.recharger()
    })

    expect(requete).toHaveBeenCalledTimes(2)
    expect(result.current.valeur).toBe('v2')
  })
})
