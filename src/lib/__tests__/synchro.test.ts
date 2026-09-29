import { describe, expect, it, vi } from 'vitest'
import { declencherSynchroLocale, estEcritureSuivie, surSynchro } from '../synchro'

describe('estEcritureSuivie', () => {
  it('suit les écritures en base et les actions serveur', () => {
    expect(estEcritureSuivie('https://x.supabase.co/rest/v1/seances?id=eq.1', 'PATCH')).toBe(true)
    expect(estEcritureSuivie('https://x.supabase.co/rest/v1/evenements_admin', 'POST')).toBe(true)
    expect(estEcritureSuivie('/api/admin/planifier-rendez-vous', 'POST')).toBe(true)
  })

  it('ignore les lectures — sinon un rechargement déclenché par le signal le réémettrait en boucle', () => {
    expect(estEcritureSuivie('https://x.supabase.co/rest/v1/seances?select=*', 'GET')).toBe(false)
    expect(estEcritureSuivie('/api/etudiant/mon-rendez-vous', 'POST')).toBe(false)
    expect(estEcritureSuivie('/api/prospects/creneaux?date=2026-09-30', 'POST')).toBe(false)
  })

  it('ignore ce qui ne concerne que soi ou ne touche pas aux données', () => {
    expect(estEcritureSuivie('https://x.supabase.co/rest/v1/notifications?id=eq.1', 'PATCH')).toBe(false)
    expect(estEcritureSuivie('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', 'POST')).toBe(false)
  })
})

describe('declencherSynchroLocale', () => {
  it('regroupe une rafale de signaux en un seul rechargement', () => {
    vi.useFakeTimers()
    const recharger = vi.fn()
    const desabonner = surSynchro(recharger)
    declencherSynchroLocale()
    declencherSynchroLocale()
    declencherSynchroLocale()
    vi.advanceTimersByTime(300)
    expect(recharger).toHaveBeenCalledTimes(1)
    desabonner()
    declencherSynchroLocale()
    vi.advanceTimersByTime(300)
    expect(recharger).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
