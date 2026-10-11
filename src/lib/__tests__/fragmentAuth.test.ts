import { describe, expect, it } from 'vitest'
import { analyserFragmentAuth } from '../fragmentAuth'

/* Distinguer les trois arrivées possibles sur /auth/reinitialiser (demande client du 2026-10-11,
   « la réinitialisation du mot de passe sur mobile bug ») : jeton valide, refus nommé par
   Supabase, ou fragment vide — ce dernier cas voulant dire que la clé s'est perdue en route, pas
   qu'elle a expiré. */

describe('analyserFragmentAuth', () => {
  it('reconnaît un jeton de connexion', () => {
    const resultat = analyserFragmentAuth('#access_token=abc&type=recovery&expires_in=3600')
    expect(resultat.present).toBe(true)
    expect(resultat.erreur).toBeNull()
  })

  it('reconnaît un refus nommé et en extrait le motif lisible', () => {
    const resultat = analyserFragmentAuth('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    expect(resultat.present).toBe(true)
    expect(resultat.erreur).toEqual({ code: 'otp_expired', description: 'Email link is invalid or has expired' })
  })

  it('retombe sur `error` quand Supabase ne donne pas de `error_code`', () => {
    expect(analyserFragmentAuth('#error=access_denied').erreur?.code).toBe('access_denied')
  })

  it('signale un fragment vide : la clé n’est jamais arrivée', () => {
    expect(analyserFragmentAuth('')).toEqual({ present: false, erreur: null })
    expect(analyserFragmentAuth('#')).toEqual({ present: false, erreur: null })
  })

  it('ignore un fragment qui n’a rien à voir avec l’authentification', () => {
    expect(analyserFragmentAuth('#section-tarifs').present).toBe(false)
  })

  it('tolère l’absence du croisillon', () => {
    expect(analyserFragmentAuth('access_token=abc').present).toBe(true)
  })
})
