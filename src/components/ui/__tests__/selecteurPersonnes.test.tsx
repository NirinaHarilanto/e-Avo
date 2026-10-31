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

function Harnais({ autoriserAdresseLibre = false }: { autoriserAdresseLibre?: boolean } = {}) {
  const [selection, setSelection] = useState<string[]>([])
  return (
    <SelecteurPersonnes
      etiquette="Destinataires obligatoires"
      placeholder="Rechercher une personne…"
      candidats={PERSONNES}
      selectionnes={selection}
      onChange={setSelection}
      autoriserAdresseLibre={autoriserAdresseLibre}
    />
  )
}

/* Le champ perd son placeholder dès qu'une pastille est posée (voir SelecteurPersonnes) : on le
   vise par son rôle, pour pouvoir chercher aussi après une première sélection. */
function chercher(texte: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: texte } })
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

  it('ne propose aucune adresse externe quand l’appelant ne l’autorise pas', () => {
    render(<Harnais />)
    chercher('prospect@gmail.com')
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

/* Demande client du 2026-10-31 : « quand une adresse mail externe à HOC est indiqué, il faut que
   le bouton s'active également ». Écrire à un prospect, qui n'a pas de compte, suppose de pouvoir
   le convier par son adresse seule — sans jamais la confondre avec une personne inscrite. */
describe('SelecteurPersonnes — adresse externe à l’établissement', () => {
  it('propose d’écrire à une adresse que personne ne porte', () => {
    render(<Harnais autoriserAdresseLibre />)
    chercher('prospect@gmail.com')
    expect(screen.getByRole('option', { name: /prospect@gmail\.com/ })).toBeTruthy()
  })

  it('préfère la personne inscrite à l’adresse libre quand les deux pourraient convenir', () => {
    render(<Harnais autoriserAdresseLibre />)
    chercher('anael@harionlineclub.com')
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0].textContent).toContain('Anael')
  })

  it('ne propose rien pour une saisie qui n’est pas une adresse', () => {
    render(<Harnais autoriserAdresseLibre />)
    chercher('zzz inconnu')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('affiche l’adresse retenue comme pastille, retirable', () => {
    render(<Harnais autoriserAdresseLibre />)
    chercher('prospect@gmail.com')
    fireEvent.mouseDown(screen.getByRole('option', { name: /prospect@gmail\.com/ }))
    expect(screen.getByLabelText('Retirer prospect@gmail.com')).toBeTruthy()
  })

  it('ne propose plus une adresse déjà retenue', () => {
    render(<Harnais autoriserAdresseLibre />)
    chercher('prospect@gmail.com')
    fireEvent.mouseDown(screen.getByRole('option', { name: /prospect@gmail\.com/ }))
    chercher('prospect@gmail.com')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})
