import { describe, expect, it } from 'vitest'
import { jourDansFuseauEtablissement } from '../etablissement'

/* Toute date métier de HOC (date de paiement, date d'envoi d'un contrat, clôture d'une
   affectation, comparaison « en retard ») doit porter le jour tel qu'il est à Antananarivo.
   `new Date().toISOString().slice(0, 10)` convertit d'abord en UTC et recule donc d'un jour
   pendant les trois premières heures de la journée malgache (UTC+3) — un reçu encaissé à 1 h du
   matin était daté de la veille. Le même écart touchait les fonctions serverless, qui tournent
   en UTC quelle que soit l'heure locale de celui qui clique.
   Ces cas verrouillent précisément cette frontière. */

describe('jourDansFuseauEtablissement', () => {
  it('rend le jour malgache, pas le jour UTC, juste après minuit à Antananarivo', () => {
    // 20/10 à 00h30 à Antananarivo = 19/10 à 21h30 UTC.
    const instant = new Date('2026-10-19T21:30:00.000Z')

    expect(jourDansFuseauEtablissement(instant)).toBe('2026-10-20')
    // Ce que l'ancien calcul renvoyait, et qu'on ne veut plus voir en base.
    expect(instant.toISOString().slice(0, 10)).toBe('2026-10-19')
  })

  it('rend le même jour que UTC le reste de la journée', () => {
    // 20/10 à 12h00 à Antananarivo = 20/10 à 09h00 UTC.
    const instant = new Date('2026-10-20T09:00:00.000Z')

    expect(jourDansFuseauEtablissement(instant)).toBe('2026-10-20')
  })

  it('bascule au bon moment, à 21h00 UTC exactement', () => {
    // La frontière : 20h59 UTC est encore le 20 à Tana (23h59), 21h00 UTC est déjà le 21.
    expect(jourDansFuseauEtablissement(new Date('2026-10-20T20:59:59.000Z'))).toBe('2026-10-20')
    expect(jourDansFuseauEtablissement(new Date('2026-10-20T21:00:00.000Z'))).toBe('2026-10-21')
  })

  it('rend le format YYYY-MM-DD attendu par une colonne date de Postgres', () => {
    expect(jourDansFuseauEtablissement(new Date('2026-01-05T09:00:00.000Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
