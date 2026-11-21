import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BandeReferences } from '../BandeReferences'

/* Demande client du 2026-11-21, maquette et liste à l'appui : « voici les sociétés avec
 * lesquelles HOC a travaillé, récupère leurs logos respectifs et intègre les sur la plateforme
 * sur la page indiquée dans la section à propos ».
 *
 * Ce que ces tests gardent :
 *   — les SIX sociétés, nommément. Une référence qui disparaît d'une bande d'images passe
 *     inaperçue : rien ne manque visuellement, la frise se referme sur elle-même ;
 *   — le chemin des fichiers, qui suit le dossier de l'établissement. Les logos ne sont pas
 *     chargés depuis les sites d'origine : un logo distant disparaît le jour où son
 *     propriétaire refait son site ;
 *   — un texte de remplacement sur chaque image, puisque ces logos PORTENT l'information. */

const SOCIETES = ['Tana Boutique Hotel', 'Carrefour', 'Concentrix', 'L.O.I Confection', 'Foundever', 'Solidis']

describe('bande de références', () => {
  it('nomme le titre voulu, avec la maison en évidence', () => {
    render(<BandeReferences dossierAssets="/etablissements/hari-online-course" />)

    expect(screen.getByRole('heading', { name: /Ils ont formé leurs équipes avec Hari Online Club/ })).toBeTruthy()
  })

  it('affiche les six sociétés, chacune avec son texte de remplacement', () => {
    render(<BandeReferences dossierAssets="/etablissements/hari-online-course" />)

    const logos = screen.getAllByRole('img')
    expect(logos).toHaveLength(SOCIETES.length)
    for (const societe of SOCIETES) {
      expect(screen.getByAltText(societe)).toBeTruthy()
    }
  })

  it('sert les logos depuis le dossier de l’établissement, jamais depuis les sites d’origine', () => {
    render(<BandeReferences dossierAssets="/etablissements/hari-online-course" />)

    for (const logo of screen.getAllByRole('img')) {
      const source = logo.getAttribute('src') ?? ''
      expect(source.startsWith('/etablissements/hari-online-course/references/')).toBe(true)
      expect(source).not.toMatch(/^https?:/)
    }
  })

  /* Le dossier vient de l'établissement affiché : la vitrine sert plusieurs écoles, et des
     chemins écrits en dur renverraient les références de l'une sur la page de l'autre. */
  it('suit le dossier d’assets qu’on lui donne', () => {
    render(<BandeReferences dossierAssets="/etablissements/autre-ecole" />)

    expect(screen.getByAltText('Carrefour').getAttribute('src')).toBe('/etablissements/autre-ecole/references/carrefour.svg')
  })
})
