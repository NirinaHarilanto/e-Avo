import { describe, expect, it } from 'vitest'
import {
  SECTIONS_DIAGNOSTIC,
  extraireCles,
  niveauDepuisReponses,
  rythmeDepuisReponses,
  sectionsCollectif,
  sectionsIndividuellesDuo,
  sectionsPartageesDuo,
} from '../diagnostic'

describe('niveauDepuisReponses', () => {
  it('reprend le niveau estimé du questionnaire', () => {
    expect(niveauDepuisReponses({ niveau_estime: 'B1' })).toBe('B1')
  })

  it('retourne null si la question n’a pas été remplie', () => {
    expect(niveauDepuisReponses({})).toBeNull()
    expect(niveauDepuisReponses({ niveau_estime: '   ' })).toBeNull()
  })
})

describe('rythmeDepuisReponses', () => {
  it('combine heures par semaine et durée de session', () => {
    expect(rythmeDepuisReponses({ heures_par_semaine: '2h', duree_session: '1h' })).toBe('2h / semaine, séances de 1h')
  })

  it('se contente d’un seul des deux champs quand l’autre manque', () => {
    expect(rythmeDepuisReponses({ heures_par_semaine: '2h' })).toBe('2h / semaine')
    expect(rythmeDepuisReponses({ duree_session: '1h30' })).toBe('séances de 1h30')
  })

  it('retourne null si rien n’a été renseigné', () => {
    expect(rythmeDepuisReponses({})).toBeNull()
  })
})

describe('sections communes/individuelles d’un binôme DUO (0060)', () => {
  it('classe « Disponibilités et logistique » et « Rythme souhaité » côté commun', () => {
    const cles = sectionsPartageesDuo().flatMap((s) => s.questions.map((q) => q.cle))
    expect(cles).toEqual(
      expect.arrayContaining(['moments_disponibles', 'jours_disponibles', 'connait_google_meet', 'heures_par_semaine', 'duree_session']),
    )
  })

  it('sépare « Notes internes » : niveau estimé individuel, le reste commun', () => {
    const communes = sectionsPartageesDuo().flatMap((s) => s.questions.map((q) => q.cle))
    const individuelles = sectionsIndividuellesDuo().flatMap((s) => s.questions.map((q) => q.cle))

    expect(communes).toEqual(expect.arrayContaining(['profil_formateur', 'besoins_prioritaires', 'programme_recommande']))
    expect(individuelles).toContain('niveau_estime')
    expect(communes).not.toContain('niveau_estime')
  })

  it('ne perd et ne duplique aucune question de la trame complète', () => {
    const total = SECTIONS_DIAGNOSTIC.flatMap((s) => s.questions.map((q) => q.cle))
    const reparti = [...sectionsPartageesDuo(), ...sectionsIndividuellesDuo()].flatMap((s) => s.questions.map((q) => q.cle))
    expect(reparti.sort()).toEqual(total.sort())
  })

  it('ne garde que des sections non vides', () => {
    for (const section of [...sectionsPartageesDuo(), ...sectionsIndividuellesDuo()]) {
      expect(section.questions.length).toBeGreaterThan(0)
    }
  })
})

describe('extraireCles', () => {
  it('ne garde que les réponses des sections données', () => {
    const reponses = { pays_residence: 'Madagascar', heures_par_semaine: '2h', niveau_estime: 'B1' }
    expect(extraireCles(reponses, sectionsPartageesDuo())).toEqual({ heures_par_semaine: '2h' })
  })

  it('conserve la précision libre d’une question « Autre » avec sa question de base', () => {
    const reponses = { raison_cours: ['Autre'], raison_cours_precision: 'Immigration', niveau_estime: 'B1' }
    expect(extraireCles(reponses, sectionsIndividuellesDuo())).toEqual(reponses)
  })
})

/* Demande client du 2026-11-08 : « prends la même trame de diagnostic appel comme pour la partie
   individuel mais uniquement les informations applicables pour un cours collectif (le niveau
   anglais définitif, heure préférence cours, etc.) ». « La même trame » est la contrainte la plus
   facile à perdre de vue : le réflexe serait de recopier quelques champs dans un formulaire à
   part, qui divergerait dès la première question ajoutée à l'individuel. D'où le test central
   ci-dessous — tout ce qui n'est pas explicitement écarté DOIT suivre la trame complète. */
describe('sectionsCollectif', () => {
  const clesCollectif = () => sectionsCollectif().flatMap((s) => s.questions.map((q) => q.cle))

  it('écarte ce qu’une vague collective fixe déjà d’avance', () => {
    // Rythme imposé par la vague, professeur imposé par la classe de niveau (0074), programme
    // imposé par le parcours collectif lui-même.
    expect(clesCollectif()).not.toContain('heures_par_semaine')
    expect(clesCollectif()).not.toContain('duree_session')
    expect(clesCollectif()).not.toContain('profil_formateur')
    expect(clesCollectif()).not.toContain('programme_recommande')
  })

  it('garde tout le reste de la trame individuelle, sans exception', () => {
    const attendues = SECTIONS_DIAGNOSTIC.flatMap((s) => s.questions.map((q) => q.cle)).filter(
      (cle) => !['heures_par_semaine', 'duree_session', 'profil_formateur', 'programme_recommande'].includes(cle),
    )
    expect(clesCollectif().sort()).toEqual(attendues.sort())
  })

  it('garde les deux informations que le client a nommées : le niveau et les disponibilités', () => {
    expect(clesCollectif()).toContain('niveau_estime')
    expect(clesCollectif()).toContain('moments_disponibles')
    expect(clesCollectif()).toContain('jours_disponibles')
  })

  it('nomme le niveau « retenu (définitif) » et non « estimé »', () => {
    /* Au collectif cette case n'est pas une estimation : elle détermine la classe de niveau ET le
       montant des frais d'inscription (0118). */
    const question = sectionsCollectif()
      .flatMap((s) => s.questions)
      .find((q) => q.cle === 'niveau_estime')
    expect(question?.libelle).toBe('Niveau d’anglais retenu (définitif)')
    // Les options, elles, restent celles de l'échelle unique — jamais recopiées ici.
    const origine = SECTIONS_DIAGNOSTIC.flatMap((s) => s.questions).find((q) => q.cle === 'niveau_estime')
    expect(question?.options).toEqual(origine?.options)
  })

  it('ne laisse aucune section vide derrière lui', () => {
    for (const section of sectionsCollectif()) {
      expect(section.questions.length).toBeGreaterThan(0)
    }
    // « Rythme souhaité » perd ses deux seules questions : la section disparaît au lieu de
    // s'afficher en titre sans contenu.
    expect(sectionsCollectif().map((s) => s.titre)).not.toContain('Rythme souhaité')
  })

  it('ne modifie pas la trame d’origine', () => {
    sectionsCollectif()
    const origine = SECTIONS_DIAGNOSTIC.flatMap((s) => s.questions).find((q) => q.cle === 'niveau_estime')
    expect(origine?.libelle).toBe('Niveau estimé')
    expect(SECTIONS_DIAGNOSTIC.map((s) => s.titre)).toContain('Rythme souhaité')
  })
})
