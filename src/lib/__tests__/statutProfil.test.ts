import { describe, expect, it } from 'vitest'
import { libelleStatutProfil, tonStatutProfil } from '../statutProfil'

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
