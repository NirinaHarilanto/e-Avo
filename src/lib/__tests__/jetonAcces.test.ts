import { beforeEach, describe, expect, it, vi } from 'vitest'

/* Signalé par le client le 2026-10-31 : « Jeton invalide. » au clic sur « Valider et générer la
   facture » d'un TimeSheet. Le jeton part du ProfileContext, où il dort depuis l'ouverture de
   l'écran, et il avait expiré. `jetonAcces` le redemande à Supabase au moment de l'appel — ce qui
   le renouvelle s'il a expiré — et rend `null` quand plus aucune session n'est exploitable, pour
   que l'écran propose une reconnexion au lieu d'envoyer une requête vouée au 401. */

const getSession = vi.fn()
vi.mock('../supabaseClient', () => ({ supabase: { auth: { getSession: () => getSession() } } }))

const { jetonAcces } = await import('../jetonAcces.js')

beforeEach(() => {
  getSession.mockReset()
})

describe('jetonAcces', () => {
  it('rend le jeton que Supabase vient de relire (et de renouveler si besoin)', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'jeton-frais' } } })
    await expect(jetonAcces()).resolves.toBe('jeton-frais')
  })

  it('redemande la session à CHAQUE appel, sans jamais mémoriser un jeton', async () => {
    getSession
      .mockResolvedValueOnce({ data: { session: { access_token: 'premier' } } })
      .mockResolvedValueOnce({ data: { session: { access_token: 'renouvele' } } })

    await expect(jetonAcces()).resolves.toBe('premier')
    await expect(jetonAcces()).resolves.toBe('renouvele')
    expect(getSession).toHaveBeenCalledTimes(2)
  })

  it('rend null quand il n’y a plus de session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    await expect(jetonAcces()).resolves.toBeNull()
  })

  /* `getSession()` prend un verrou `navigator.locks` qui peut rester coincé après une mise en
     veille (incident du 2026-10-11) : elle lève alors, et cela ne doit pas remonter en erreur
     non capturée au milieu d'un clic. */
  it('rend null au lieu de lever quand la lecture de session échoue', async () => {
    getSession.mockRejectedValue(new Error('NavigatorLockAcquireTimeoutError'))
    await expect(jetonAcces()).resolves.toBeNull()
  })
})
