import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* Régression du 2026-10-11 — « après un certain temps d'inactivité, l'écran bug » (client).
   Trois hooks verrouillent l'affichage de TOUS les espaces derrière leur `loading`
   (EspaceLayout.tsx reste sur « Chargement… » tant qu'il vaut `true`). Aucun des trois ne
   gérait l'échec de sa requête :

   - `getSession()` passe par un verrou `navigator.locks` et REJETTE avec
     `NavigatorLockAcquireTimeoutError` quand il ne peut pas être pris — typiquement au réveil
     d'une machine en veille, ou si un autre onglet a laissé le verrou coincé ;
   - une lecture de `profiles` / `platform_admins` peut échouer (jeton expiré, réseau coupé).

   Sans `catch`, la promesse rejetée laissait `loading` à `true` définitivement : écran de
   chargement sans fin. Et pour le profil, écraser la valeur par `null` en cas d'erreur faisait
   rejeter vers /connexion un utilisateur pourtant toujours connecté. */

const getSession = vi.fn()
const single = vi.fn()
const maybeSingle = vi.fn()

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => single(),
          maybeSingle: () => maybeSingle(),
        }),
      }),
    }),
  },
}))

const { useAuth } = await import('../useAuth')
const { useProfile } = await import('../useProfile')
const { usePlatformAdmin } = await import('../usePlatformAdmin')

const SESSION = { user: { id: 'u1' }, access_token: 'jeton' } as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAuth face à un verrou d’authentification indisponible', () => {
  it('rend la main au lieu de rester bloqué quand getSession rejette deux fois', async () => {
    getSession.mockRejectedValue(new Error('Acquiring an exclusive Navigator LockManager lock failed'))

    const { result } = renderHook(() => useAuth())
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 4000 })
    expect(result.current.session).toBeNull()
    // Un seul nouvel essai, pas une boucle de relances.
    expect(getSession).toHaveBeenCalledTimes(2)
  })

  it('retient la session quand le second essai aboutit', async () => {
    getSession
      .mockRejectedValueOnce(new Error('lock timeout'))
      .mockResolvedValueOnce({ data: { session: SESSION } })

    const { result } = renderHook(() => useAuth())

    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 4000 })
    expect(result.current.session).toBe(SESSION)
  })
})

describe('useProfile face à une lecture en échec', () => {
  it('ne reste pas en chargement quand la requête rejette', async () => {
    single.mockRejectedValue(new Error('réseau coupé'))

    const { result } = renderHook(() => useProfile(SESSION, false))
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('conserve le profil déjà chargé quand un rafraîchissement échoue', async () => {
    const profil = { id: 'u1', role: 'admin_etablissement' }
    single.mockResolvedValueOnce({ data: profil, error: null })

    const { result, rerender } = renderHook(({ s }) => useProfile(s, false), { initialProps: { s: SESSION } })
    await waitFor(() => expect(result.current.profile).toEqual(profil))

    // Nouvelle session (même utilisateur) : la requête repart et échoue cette fois.
    single.mockResolvedValueOnce({ data: null, error: { message: 'JWT expired' } })
    rerender({ s: { user: { id: 'u1' }, access_token: 'jeton-2' } as never })

    await waitFor(() => expect(result.current.loading).toBe(false))
    // Le profil NE DOIT PAS être effacé : sinon EspaceLayout renvoie vers /connexion.
    expect(result.current.profile).toEqual(profil)
  })
})

describe('usePlatformAdmin face à une lecture en échec', () => {
  it('ne reste pas en chargement quand la requête rejette', async () => {
    maybeSingle.mockRejectedValue(new Error('réseau coupé'))

    const { result } = renderHook(() => usePlatformAdmin(SESSION, false))
    await waitFor(() => expect(result.current.loading).toBe(false))
  })
})
