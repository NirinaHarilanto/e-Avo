import { describe, expect, it } from 'vitest'
import { memeAdresseGoogle } from '../google.js'

/* Comparaison des adresses Google, pierre du verrou posé le 2026-10-10 : l'adresse confirmée dans
   le pop-up est comparée à celle que Google renvoie réellement, et un décalage refuse
   l'enregistrement (api/admin/google-oauth-callback.ts). Trop stricte, la comparaison rejetterait
   une saisie correcte et ferait brûler une place du quota Google pour rien ; trop laxiste, elle
   laisserait s'installer la mauvaise adresse — l'exact problème qu'elle existe pour empêcher. */
describe('memeAdresseGoogle', () => {
  it('reconnaît la même adresse écrite à l’identique', () => {
    expect(memeAdresseGoogle('irinastefane@gmail.com', 'irinastefane@gmail.com')).toBe(true)
  })

  it('ignore la casse et les espaces autour', () => {
    expect(memeAdresseGoogle('  Irina.Stefane@Gmail.com ', 'irina.stefane@gmail.com')).toBe(true)
  })

  it('ignore les points d’une adresse gmail, que Google ignore lui aussi', () => {
    expect(memeAdresseGoogle('irina.stefane@gmail.com', 'irinastefane@gmail.com')).toBe(true)
  })

  it('traite googlemail.com comme gmail.com, son alias historique', () => {
    expect(memeAdresseGoogle('irina.stefane@googlemail.com', 'irinastefane@gmail.com')).toBe(true)
  })

  it('n’ignore PAS les points hors gmail : ailleurs ce sont deux adresses distinctes', () => {
    expect(memeAdresseGoogle('prenom.nom@harionlineclub.com', 'prenomnom@harionlineclub.com')).toBe(false)
  })

  it('distingue deux comptes différents', () => {
    expect(memeAdresseGoogle('irinastefane@gmail.com', 'irinastefanefr@gmail.com')).toBe(false)
  })

  it('distingue le même nom sur deux domaines', () => {
    expect(memeAdresseGoogle('contact@gmail.com', 'contact@harionlineclub.com')).toBe(false)
  })

  /* Une valeur absente ne vaut jamais « identique » : sans cela, une intégration sans adresse
     enregistrée passerait tous les contrôles d'autorisation. */
  it('refuse toute comparaison avec une valeur vide ou absente', () => {
    expect(memeAdresseGoogle(null, null)).toBe(false)
    expect(memeAdresseGoogle(undefined, 'irinastefane@gmail.com')).toBe(false)
    expect(memeAdresseGoogle('irinastefane@gmail.com', '')).toBe(false)
    expect(memeAdresseGoogle('   ', '   ')).toBe(false)
  })

  /* `organisateur_email` d'une vieille ligne `video_sessions` peut ne pas être une adresse Google
     canonique : la comparaison ne doit pas lever, juste répondre non. */
  it('ne lève pas sur une valeur qui n’est pas une adresse', () => {
    expect(memeAdresseGoogle('pas-une-adresse', 'irinastefane@gmail.com')).toBe(false)
    expect(memeAdresseGoogle('pas-une-adresse', 'pas-une-adresse')).toBe(true)
  })
})
