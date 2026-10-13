import { describe, expect, it, vi } from 'vitest'

/* Une photo de témoignage a deux provenances possibles, jamais les deux à la fois (contrainte
   `temoignages_une_seule_photo`, 0128) : un fichier livré avec le site pour les témoignages repris
   de l'ancienne page, le bucket public `photos-profil` pour la photo d'un élève. Se tromper de
   provenance donne une image cassée sur la page publique, visible de tous les visiteurs. */

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (chemin: string) => ({ data: { publicUrl: `https://stockage.test/${bucket}/${chemin}` } }),
      }),
    },
  },
}))

const { urlPhotoTemoignage } = await import('../useTemoignages')

describe('urlPhotoTemoignage', () => {
  it('sert le fichier livré avec le site pour un témoignage historique', () => {
    expect(urlPhotoTemoignage({ photo_fichier: 'temoignage-dia.webp', photo_path: null }, '/etablissements/hoc')).toBe(
      '/etablissements/hoc/temoignages/temoignage-dia.webp',
    )
  })

  it('sert l’URL publique du bucket pour la photo d’un élève', () => {
    expect(urlPhotoTemoignage({ photo_fichier: null, photo_path: 'abc/photo.jpg' }, '/etablissements/hoc')).toBe(
      'https://stockage.test/photos-profil/abc/photo.jpg',
    )
  })

  it('ne renvoie rien sans photo — les initiales s’afficheront à la place', () => {
    expect(urlPhotoTemoignage({ photo_fichier: null, photo_path: null }, '/etablissements/hoc')).toBeNull()
  })

  it('donne la priorité au fichier du site si les deux étaient renseignés', () => {
    // La base l'interdit ; si cela arrivait malgré tout, le fichier du site reste servable sans
    // dépendre du bucket.
    expect(urlPhotoTemoignage({ photo_fichier: 'x.webp', photo_path: 'abc/photo.jpg' }, '/e/hoc')).toBe(
      '/e/hoc/temoignages/x.webp',
    )
  })
})
