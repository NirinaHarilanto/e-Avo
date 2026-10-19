import { describe, expect, it } from 'vitest'
import { HEURES_AVANT_FIN_PARCOURS, jalonsAtteints } from '../jalonsParcours'

/* Les deux instants où l'admin fait son suivi pédagogique et où l'élève remplit son enquête de
   satisfaction (demandes client 5 et 8 du 2026-10-19). Ce sont ces seuils qui décident d'envoyer
   une notification et d'ouvrir une enquête : ils doivent être vérifiés, pas supposés. */
describe('jalonsAtteints', () => {
  it('ne déclenche rien avant la moitié des heures', () => {
    expect(jalonsAtteints(9, 20)).toEqual([])
  })

  it('déclenche le mi-parcours pile à la moitié', () => {
    expect(jalonsAtteints(10, 20)).toEqual(['mi_parcours'])
  })

  it('garde le mi-parcours entre la moitié et le seuil de fin', () => {
    expect(jalonsAtteints(14, 20)).toEqual(['mi_parcours'])
  })

  it('déclenche la fin de parcours aux 3 heures restantes', () => {
    expect(jalonsAtteints(17, 20)).toEqual(['mi_parcours', 'fin_parcours'])
  })

  it('rend les DEUX jalons quand une seule séance les franchit ensemble', () => {
    // Séance de 8 h sur un forfait de 20 : l'élève passe de 40 % à 80 % en une clôture. Les deux
    // jalons doivent tomber, pas seulement le dernier — c'est l'unicité en base qui empêche
    // ensuite qu'ils se répètent.
    expect(jalonsAtteints(18, 20)).toEqual(['mi_parcours', 'fin_parcours'])
  })

  it('reste atteint après la fin du forfait', () => {
    expect(jalonsAtteints(20, 20)).toEqual(['mi_parcours', 'fin_parcours'])
    expect(jalonsAtteints(23, 20)).toEqual(['mi_parcours', 'fin_parcours'])
  })

  it('ne déclenche rien sans forfait connu', () => {
    // Un élève sans forfait (collectif sans forfait de vague, dossier pas encore doté) n'a pas de
    // parcours mesurable : l'inviter à conclure n'aurait aucun sens.
    expect(jalonsAtteints(5, null)).toEqual([])
    expect(jalonsAtteints(5, 0)).toEqual([])
  })

  it('n’annonce pas la fin avant la moitié sur un forfait court', () => {
    // Sur 4 h, « 3 heures avant la fin » tomberait à 1 h consommée, soit AVANT la moitié : les
    // deux enquêtes partiraient le même jour, dans le mauvais ordre. Seul le mi-parcours sort.
    expect(jalonsAtteints(1, 4)).toEqual([])
    expect(jalonsAtteints(2, 4)).toEqual(['mi_parcours'])
    expect(jalonsAtteints(4, 4)).toEqual(['mi_parcours'])
  })

  it('n’annonce jamais la fin sur un forfait plus court que le seuil', () => {
    expect(jalonsAtteints(2, HEURES_AVANT_FIN_PARCOURS)).toEqual(['mi_parcours'])
    expect(jalonsAtteints(1, 1)).toEqual(['mi_parcours'])
  })

  it('traite les heures décimales', () => {
    expect(jalonsAtteints(5.25, 10.5)).toEqual(['mi_parcours'])
    expect(jalonsAtteints(5.2, 10.5)).toEqual([])
  })
})
