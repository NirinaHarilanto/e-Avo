import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { SelecteurPersonnes } from '../SelecteurPersonnes'
import type { PersonneSelectionnable } from '../../../lib/invitations'

/* Signalé par le client le 2026-10-31 : « pourquoi le bouton envoyer via gmail ne fonctionne
   pas ? ». L'adresse du destinataire avait été COLLÉE dans le champ de recherche sans qu'aucune
   suggestion n'apparaisse — la recherche ne regardait que le nom — donc sans que personne ne soit
   sélectionné, et l'envoi restait bloqué. Ces tests fixent qu'une adresse retrouve sa personne. */

const PERSONNES: PersonneSelectionnable[] = [
  { id: 'a', prenom: 'Anael', nom: 'ANRIANAINA', role: 'Administrateur', email: 'anael@harionlineclub.com' },
  { id: 'b', prenom: 'Bruno', nom: 'ANDRIA', role: 'Étudiant', email: 'bruno.andria@exemple.test' },
  /* Personne sans adresse connue : l'annuaire n'en porte pas toujours une, et son absence ne doit
     casser ni la recherche par nom ni celle par adresse. */
  { id: 'c', prenom: 'Chloé', nom: 'BETUM', role: 'Étudiante' },
]

function Harnais() {
  const [selection, setSelection] = useState<string[]>([])
  return (
    <SelecteurPersonnes
      etiquette="Destinataires obligatoires"
      placeholder="Rechercher une personne…"
      candidats={PERSONNES}
      selectionnes={selection}
      onChange={setSelection}
    />
  )
}

function chercher(texte: string) {
  fireEvent.change(screen.getByPlaceholderText('Rechercher une personne…'), { target: { value: texte } })
}

describe('SelecteurPersonnes — recherche par adresse e-mail', () => {
  it('retrouve une personne par son adresse complète', () => {
    render(<Harnais />)
    chercher('anael@harionlineclub.com')
    expect(screen.getByRole('option', { name: /Anael/ })).toBeTruthy()
  })

  it('retrouve une personne par un fragment de son adresse', () => {
    render(<Harnais />)
    chercher('bruno.andria')
    expect(screen.getByRole('option', { name: /Bruno/ })).toBeTruthy()
  })

  it('continue de retrouver une personne par son nom', () => {
    render(<Harnais />)
    chercher('betum')
    expect(screen.getByRole('option', { name: /BETUM/ })).toBeTruthy()
  })

  it('ne propose personne pour une adresse inconnue', () => {
    render(<Harnais />)
    chercher('inconnu@gmail.com')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('sélectionne la personne au clic sur la suggestion trouvée par son adresse', () => {
    render(<Harnais />)
    chercher('anael@harionlineclub.com')
    /* `mouseDown` et non `click` : le composant choisit sur l'appui, pour devancer le `blur` du
       champ qui fermerait la liste avant le clic (voir SelecteurPersonnes). */
    fireEvent.mouseDown(screen.getByRole('option', { name: /Anael/ }))
    // La personne devient une pastille portant son bouton de retrait.
    expect(screen.getByLabelText(/Retirer Anael/)).toBeTruthy()
  })
})
