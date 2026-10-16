import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dateRendezVousCarte, sousTitreCarte } from '../PipelineCRM'
import type { ProspectAvecDiagnostic } from '../../../hooks/useProspectsPipeline'

function prospect(extra: Partial<ProspectAvecDiagnostic> = {}): ProspectAvecDiagnostic {
  return {
    id: 'p1',
    prenom: 'Tiana',
    nom: 'Rakoto',
    statut: 'prospect',
    langue_visee: 'Anglais professionnel',
    created_at: '2026-10-16T05:00:00Z',
    rendezVous: null,
    diagnostic: null,
    ...extra,
  } as ProspectAvecDiagnostic
}

/* Les deux fonctions datent les cartes du tableau d'étapes. Elles raisonnent sur le fuseau de
   l'établissement (Antananarivo, UTC+3) et non sur celui du navigateur : l'écran doit dire
   « demain » quand c'est demain à Tana, où qu'en soit l'admin qui le consulte. C'est précisément
   ce que ces tests tiennent — le calcul est invisible à l'œil une fois la page rendue, et il
   passerait inaperçu sur une machine réglée, elle, sur le fuseau de Tana. */
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('sousTitreCarte', () => {
  it('date l’arrivée du dossier à la première étape', () => {
    // 05 h UTC = 08 h à Tana : même jour que le `created_at` ci-dessus.
    vi.setSystemTime(new Date('2026-10-16T05:00:00Z'))
    expect(sousTitreCarte(prospect())).toBe("Reçu aujourd'hui")

    vi.setSystemTime(new Date('2026-10-17T05:00:00Z'))
    expect(sousTitreCarte(prospect())).toBe('Reçu hier')
  })

  it('bascule sur une date absolue au-delà de la veille', () => {
    vi.setSystemTime(new Date('2026-10-20T05:00:00Z'))
    expect(sousTitreCarte(prospect())).toBe('Reçu le 16 oct.')
  })

  it('annonce l’intitulé du besoin quand l’appel est planifié, la date vivant dans l’encart', () => {
    expect(sousTitreCarte(prospect({ statut: 'diagnostic_planifie' }))).toBe('Anglais professionnel')
  })

  it('date le diagnostic une fois celui-ci réalisé', () => {
    vi.setSystemTime(new Date('2026-10-16T05:00:00Z'))
    const avec = prospect({
      statut: 'diagnostic_fait',
      diagnostic: { date_appel: '2026-10-12T06:00:00Z' } as ProspectAvecDiagnostic['diagnostic'],
    })
    expect(sousTitreCarte(avec)).toBe('Diagnostic le 12 oct.')
  })
})

describe('dateRendezVousCarte', () => {
  it('ne montre rien tant qu’aucune date n’est connue', () => {
    expect(dateRendezVousCarte(prospect())).toBeNull()
  })

  it('écrit l’heure telle qu’elle se lit à Antananarivo, pas dans le fuseau du navigateur', () => {
    vi.setSystemTime(new Date('2026-10-16T05:00:00Z'))
    const avec = prospect({
      rendezVous: { debut: '2026-10-17T05:00:00Z', duree_minutes: 30 } as ProspectAvecDiagnostic['rendezVous'],
    })
    // 05 h UTC = 08 h à Tana, et le 17 est bien le lendemain du 16.
    expect(dateRendezVousCarte(avec)).toBe('Demain, 08:00')
  })

  it('reconnaît le jour même', () => {
    vi.setSystemTime(new Date('2026-10-17T02:00:00Z'))
    const avec = prospect({
      rendezVous: { debut: '2026-10-17T05:00:00Z', duree_minutes: 30 } as ProspectAvecDiagnostic['rendezVous'],
    })
    expect(dateRendezVousCarte(avec)).toBe('Aujourd’hui, 08:00')
  })

  /* Un prospect planifié par l'admin n'a pas de `rendez_vous` : sa date ne vit que dans
     `diagnostic_calls`. Sans ce repli, l'encart de la deuxième colonne restait vide pour tous
     les dossiers qui n'étaient pas passés par la réservation en ligne. */
  it('se rabat sur la date de l’appel diagnostic quand aucun rendez-vous n’a été réservé en ligne', () => {
    vi.setSystemTime(new Date('2026-10-16T05:00:00Z'))
    const avec = prospect({
      diagnostic: { date_appel: '2026-10-19T12:30:00Z' } as ProspectAvecDiagnostic['diagnostic'],
    })
    expect(dateRendezVousCarte(avec)).toBe('lun. 19 oct., 15:30')
  })
})
