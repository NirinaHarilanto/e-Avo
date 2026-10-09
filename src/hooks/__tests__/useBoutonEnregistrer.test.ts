import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useBoutonEnregistrer } from '../useBoutonEnregistrer'

/* Demande client du 2026-10-10 : un bouton « Enregistrer » doit afficher « Enregistré » après un
   succès, et retomber sur son état initial dès que de nouvelles modifications sont en cours —
   automatiquement, sans qu'aucun point de saisie n'ait à prévenir explicitement ce hook. C'est
   l'approche DÉRIVÉE (comparaison d'empreintes) qui porte cette garantie : ces tests la vérifient
   directement. */
describe('useBoutonEnregistrer', () => {
  it('n’est pas enregistré avant tout succès', () => {
    const { result } = renderHook(() => useBoutonEnregistrer())
    expect(result.current.estEnregistre(JSON.stringify({ a: 1 }))).toBe(false)
  })

  it('devient enregistré pour l’empreinte marquée', () => {
    const { result } = renderHook(() => useBoutonEnregistrer())
    const instantane = JSON.stringify({ a: 1 })
    act(() => result.current.marquerEnregistre(instantane))
    expect(result.current.estEnregistre(instantane)).toBe(true)
  })

  it('retombe automatiquement dès que l’empreinte actuelle diffère — sans appel explicite', () => {
    const { result } = renderHook(() => useBoutonEnregistrer())
    act(() => result.current.marquerEnregistre(JSON.stringify({ a: 1 })))
    // Simule une modification : la nouvelle empreinte n'a jamais été marquée comme enregistrée.
    expect(result.current.estEnregistre(JSON.stringify({ a: 2 }))).toBe(false)
  })

  it('redevient enregistré si l’on revient exactement à l’état déjà enregistré', () => {
    const { result } = renderHook(() => useBoutonEnregistrer())
    const instantaneInitial = JSON.stringify({ a: 1 })
    act(() => result.current.marquerEnregistre(instantaneInitial))
    expect(result.current.estEnregistre(JSON.stringify({ a: 2 }))).toBe(false)
    expect(result.current.estEnregistre(instantaneInitial)).toBe(true)
  })

  it('suit le dernier succès en date, pas le premier', () => {
    const { result } = renderHook(() => useBoutonEnregistrer())
    act(() => result.current.marquerEnregistre(JSON.stringify({ a: 1 })))
    act(() => result.current.marquerEnregistre(JSON.stringify({ a: 2 })))
    expect(result.current.estEnregistre(JSON.stringify({ a: 1 }))).toBe(false)
    expect(result.current.estEnregistre(JSON.stringify({ a: 2 }))).toBe(true)
  })
})
