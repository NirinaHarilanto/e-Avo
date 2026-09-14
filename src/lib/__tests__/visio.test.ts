import { describe, expect, it } from 'vitest'
import { estLienReel, getJoinUrl, getRecordingUrl } from '../visio'

describe('getJoinUrl', () => {
  it('renvoie le lien Meet tel quel quand la séance en a un', () => {
    expect(getJoinUrl({ provider: 'google_meet', room_ref: 'https://meet.google.com/abc-defg-hij' })).toBe(
      'https://meet.google.com/abc-defg-hij',
    )
  })

  it('retombe sur le lien interne sans compte Google connecté', () => {
    expect(getJoinUrl({ provider: 'stub', room_ref: 'id-de-seance' })).toBe('https://meet.e-avo.example/salle/id-de-seance')
    expect(getJoinUrl({ provider: null, room_ref: 'id-de-seance' })).toBe('https://meet.e-avo.example/salle/id-de-seance')
  })

  it('ne présente jamais un lien Meet vide comme réel', () => {
    // Cas d'une ligne à moitié écrite : le fournisseur dit Meet mais l'URL manque.
    expect(estLienReel({ provider: 'google_meet', room_ref: null })).toBe(false)
    expect(estLienReel({ provider: 'google_meet', room_ref: 'https://meet.google.com/abc' })).toBe(true)
    expect(estLienReel({ provider: 'stub', room_ref: 'id' })).toBe(false)
  })
})

describe('getRecordingUrl', () => {
  it('rend l’enregistrement seulement s’il existe', () => {
    expect(getRecordingUrl({ enregistrement_url: null })).toBeNull()
    expect(getRecordingUrl({ enregistrement_url: 'https://exemple/x' })).toBe('https://exemple/x')
  })
})
