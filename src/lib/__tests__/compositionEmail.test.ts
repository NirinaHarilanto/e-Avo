import { describe, expect, it } from 'vitest'
import { lienCompositionGmail, LONGUEUR_MAX_LIEN } from '../compositionEmail'

/* Les modèles d'e-mail de l'espace admin ouvrent désormais un brouillon dans Gmail au lieu de
   partir par Resend (demande client du 2026-10-11). Ce qui compte ici : que rien du message ne se
   perde en route — accents, sauts de ligne, destinataires multiples. */

const base = {
  expediteur: 'admin@harionlineclub.com',
  destinataires: ['eleve@exemple.test'],
  objet: 'Votre formation',
  corps: 'Bonjour Miary,\n\nVOTRE CLASSE\n- Niveau : A2',
}

function parametres(lien: string) {
  return new URL(lien).searchParams
}

describe('lienCompositionGmail', () => {
  it('vise le composeur Gmail du compte de l’établissement', () => {
    const p = parametres(lienCompositionGmail(base))
    expect(p.get('view')).toBe('cm')
    expect(p.get('authuser')).toBe('admin@harionlineclub.com')
  })

  it('conserve l’objet, les accents et les sauts de ligne du corps', () => {
    const p = parametres(
      lienCompositionGmail({ ...base, objet: 'Préparation à l’évaluation', corps: 'Ligne 1\nLigne 2\n\nFin' }),
    )
    expect(p.get('objet')).toBeNull()
    expect(p.get('su')).toBe('Préparation à l’évaluation')
    expect(p.get('body')).toBe('Ligne 1\nLigne 2\n\nFin')
  })

  it('sépare plusieurs destinataires par des virgules', () => {
    const p = parametres(lienCompositionGmail({ ...base, destinataires: ['a@x.test', 'b@x.test'] }))
    expect(p.get('to')).toBe('a@x.test,b@x.test')
  })

  it('n’ajoute le champ Cc que lorsqu’il y a vraiment des copies', () => {
    expect(parametres(lienCompositionGmail(base)).has('cc')).toBe(false)
    expect(parametres(lienCompositionGmail({ ...base, copies: [] })).has('cc')).toBe(false)
    expect(parametres(lienCompositionGmail({ ...base, copies: ['c@x.test'] })).get('cc')).toBe('c@x.test')
  })

  it('laisse un modèle réel largement sous la limite de longueur', () => {
    // Le plus long modèle de l'application fait ~1 700 caractères.
    const corpsLong = 'Bonjour Miary,\n\n' + 'Ligne avec des accents éàù et un tiret - puce.\n'.repeat(35)
    const lien = lienCompositionGmail({ ...base, corps: corpsLong })
    expect(corpsLong.length).toBeGreaterThan(1600)
    expect(lien.length).toBeLessThan(LONGUEUR_MAX_LIEN)
  })
})
