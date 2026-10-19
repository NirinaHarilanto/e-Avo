import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChoixNatureRendezVous } from '../ChoixNatureRendezVous'
import { NATURES_PROFESSEUR } from '../../../lib/natureRendezVous'

/* Les prestations hors cursus (corporate, chat & chill) ont été ajoutées le 2026-10-19 à la
   création de séance du PROFESSEUR : « dans l'espace professeur, pour chaque séance de cours lors
   de sa création, il faut rajouter les options Cours corporate et cours chat & chill ».

   Le cas à ne jamais casser : l'agenda de l'ADMINISTRATION ne doit pas se mettre à les proposer.
   Il planifie des rendez-vous d'établissement, et une prestation créée là n'aurait aucun
   professeur à qui créditer les heures — la liste par défaut doit donc rester à deux natures. */
describe('ChoixNatureRendezVous', () => {
  it('ne propose que séance de cours et autre par défaut (agenda de l’administration)', () => {
    render(<ChoixNatureRendezVous valeur="seance_cours" onChange={vi.fn()} />)

    expect(screen.getByText('Une séance de cours')).toBeTruthy()
    expect(screen.getByText('Autre')).toBeTruthy()
    expect(screen.queryByText('Un cours corporate')).toBeNull()
    expect(screen.queryByText('Un cours chat & chill')).toBeNull()
  })

  it('propose les quatre natures au professeur', () => {
    render(<ChoixNatureRendezVous valeur="seance_cours" onChange={vi.fn()} natures={NATURES_PROFESSEUR} />)

    expect(screen.getByText('Une séance de cours')).toBeTruthy()
    expect(screen.getByText('Autre')).toBeTruthy()
    expect(screen.getByText('Un cours corporate')).toBeTruthy()
    expect(screen.getByText('Un cours chat & chill')).toBeTruthy()
  })

  it('dit au professeur ce qu’une prestation change pour lui', () => {
    render(<ChoixNatureRendezVous valeur="corporate" onChange={vi.fn()} natures={NATURES_PROFESSEUR} />)

    // Le taux appliqué doit être annoncé AVANT la création : c'est lui qui décidera du montant
    // sur le relevé d'heures.
    expect(screen.getByText(/Facturée à votre taux corporate/)).toBeTruthy()
    // Les deux prestations le disent : `getAllByText`, pas `getByText`.
    expect(screen.getAllByText(/hors cursus HOC/)).toHaveLength(2)
  })

  it('coche la nature choisie, et elle seule', () => {
    render(<ChoixNatureRendezVous valeur="chat_chill" onChange={vi.fn()} natures={NATURES_PROFESSEUR} />)

    const coches = screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)
    expect(coches).toHaveLength(1)
  })
})
