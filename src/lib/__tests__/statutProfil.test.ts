import { describe, expect, it } from 'vitest'
import { activiteEtudiant, libelleActiviteEtudiant, libelleStatutProfil, tonActiviteEtudiant, tonStatutProfil } from '../statutProfil'

describe('libelleStatutProfil', () => {
  it('donne un libellé lisible pour chaque statut, jamais la valeur brute de l’enum', () => {
    expect(libelleStatutProfil('approved')).toBe('Actif')
    expect(libelleStatutProfil('pending')).toBe('En attente d’activation')
    expect(libelleStatutProfil('en_pause')).toBe('En pause')
    expect(libelleStatutProfil('suspended')).toBe('Supprimé')
  })
})

describe('tonStatutProfil', () => {
  it('distingue la pause (ambre) de l’actif (teal)', () => {
    expect(tonStatutProfil('en_pause').color).toBe('var(--warning)')
    expect(tonStatutProfil('approved').color).toBe('var(--accent-teal)')
    expect(tonStatutProfil('en_pause').color).not.toBe(tonStatutProfil('approved').color)
  })
})

/* Redéfinition demandée le 2026-10-19 : « l'étudiant serait inactif lorsque son forfait d'heures
   est épuisé, ou lorsqu'il fait une pause. Dans les autres cas, il serait actif. » */
describe('activiteEtudiant', () => {
  it('dit actif un parcours en cours', () => {
    expect(activiteEtudiant({ status: 'approved', forfaitEpuise: false })).toBe('actif')
  })

  it('dit inactif un forfait épuisé, même si le compte reste approuvé', () => {
    // C'est tout l'écart avec `profiles.status` : le compte fonctionne, le parcours est à l'arrêt.
    expect(activiteEtudiant({ status: 'approved', forfaitEpuise: true })).toBe('inactif')
  })

  it('dit inactif une mise en pause, forfait épuisé ou non', () => {
    expect(activiteEtudiant({ status: 'en_pause', forfaitEpuise: false })).toBe('inactif')
    expect(activiteEtudiant({ status: 'en_pause', forfaitEpuise: true })).toBe('inactif')
  })

  it('garde à part l’invitation jamais acceptée', () => {
    // Un compte pas encore ouvert n'est pas un parcours inactif : l'écran le compte séparément,
    // et « inactif » enverrait l'admin relancer un élève qui n'a jamais commencé.
    expect(activiteEtudiant({ status: 'pending', forfaitEpuise: false })).toBe('en_attente')
    expect(activiteEtudiant({ status: 'pending', forfaitEpuise: true })).toBe('en_attente')
  })

  it('garde à part un compte supprimé', () => {
    expect(activiteEtudiant({ status: 'suspended', forfaitEpuise: false })).toBe('supprime')
  })

  it('nomme et colore chaque activité, jamais la valeur brute', () => {
    expect(libelleActiviteEtudiant('actif')).toBe('Actif')
    expect(libelleActiviteEtudiant('inactif')).toBe('Inactif')
    expect(libelleActiviteEtudiant('en_attente')).toBe('En attente d’activation')
    expect(tonActiviteEtudiant('inactif').color).toBe('var(--warning)')
    expect(tonActiviteEtudiant('actif').color).toBe('var(--accent-teal)')
  })
})
