import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SelecteurRecurrence } from '../SelecteurRecurrence'
import { RecapitulatifSeances } from '../RecapitulatifSeances'
import { finParDefaut, type RegleRecurrence } from '../../../lib/recurrence'

/* Les trois exigences du client du 2026-11-03, posées après l'incident des 107 séances
   fantômes : une période visible dès que la répétition est active, des jours du lundi au
   dimanche avec une heure chacun, et un récapitulatif avant toute validation en série. */

const LUNDI_8H = new Date(2026, 10, 2, 8, 0)

describe('SelecteurRecurrence — période toujours visible', () => {
  it('n’affiche aucune période tant que rien ne se répète', () => {
    render(<SelecteurRecurrence debut={LUNDI_8H} valeur={null} onChange={vi.fn()} />)
    expect(screen.queryByText('au')).not.toBeInTheDocument()
  })

  it('affiche « Du … au … » dès qu’une répétition est choisie, préréglage compris', () => {
    const regle: RegleRecurrence = { frequence: 'jour', intervalle: 1, fin: finParDefaut(LUNDI_8H) }
    render(<SelecteurRecurrence debut={LUNDI_8H} valeur={regle} onChange={vi.fn()} />)
    expect(screen.getByText('Du')).toBeInTheDocument()
    expect(screen.getByText('02/11/2026')).toBeInTheDocument()
    // La date de fin est modifiable, et pré-remplie : c'est le garde-fou contre les 156 séances.
    expect(screen.getByDisplayValue('2027-02-02')).toBeInTheDocument()
  })

  it('avertit si la récurrence n’a pas de date de fin', () => {
    const regle: RegleRecurrence = { frequence: 'jour', intervalle: 1, fin: { type: 'jamais' } }
    render(<SelecteurRecurrence debut={LUNDI_8H} valeur={regle} onChange={vi.fn()} />)
    expect(screen.getByText(/plafond de 156/)).toBeInTheDocument()
  })
})

describe('SelecteurRecurrence — jours et horaires du personnalisé', () => {
  const reglePerso: RegleRecurrence = {
    frequence: 'semaine',
    intervalle: 1,
    joursSemaine: [1],
    heuresParJour: { 1: '10:00' },
    fin: finParDefaut(LUNDI_8H),
  }

  it('aligne les sept jours du lundi au dimanche, avec une heure pour chacun', () => {
    render(<SelecteurRecurrence debut={LUNDI_8H} valeur={reglePerso} onChange={vi.fn()} />)
    const jours = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
    const rendus = jours.map((j) => screen.getByRole('button', { name: j }))
    expect(rendus).toHaveLength(7)
    jours.forEach((j) => expect(screen.getByLabelText(`Heure du ${j}`)).toBeInTheDocument())
  })

  it('l’heure d’un jour non coché est désactivée', () => {
    render(<SelecteurRecurrence debut={LUNDI_8H} valeur={reglePerso} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Heure du Lun')).not.toBeDisabled()
    expect(screen.getByLabelText('Heure du Mer')).toBeDisabled()
  })

  it('cocher un jour lui donne une heure, la changer ne touche pas les autres', () => {
    const onChange = vi.fn()
    render(<SelecteurRecurrence debut={LUNDI_8H} valeur={reglePerso} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mer' }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ joursSemaine: [1, 3], heuresParJour: { 1: '10:00', 3: '08:00' } }),
    )

    onChange.mockClear()
    fireEvent.change(screen.getByLabelText('Heure du Lun'), { target: { value: '14:30' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ heuresParJour: { 1: '14:30' } }))
  })
})

describe('RecapitulatifSeances', () => {
  const dates = [new Date(2026, 10, 2, 10, 0), new Date(2026, 10, 4, 14, 30), new Date(2026, 10, 9, 10, 0)]

  it('annonce le nombre, les dates/heures, le professeur et les étudiants', () => {
    render(
      <RecapitulatifSeances
        dates={dates}
        dureeMinutes={60}
        professeurs={['Harinjo ANDRIAMAHENINA']}
        etudiants={['Ravaka RANDRIARIVONY']}
        enCours={false}
        onAnnuler={vi.fn()}
        onConfirmer={vi.fn()}
      />,
    )
    // Le compteur en tête, pas le « 3 » de la numérotation des lignes plus bas.
    expect(screen.getByText('3', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText(/3 h au total/)).toBeInTheDocument()
    expect(screen.getByText('Harinjo ANDRIAMAHENINA')).toBeInTheDocument()
    expect(screen.getByText('Ravaka RANDRIARIVONY')).toBeInTheDocument()
    expect(screen.getByText(/lundi 2 novembre 2026/)).toBeInTheDocument()
    expect(screen.getByText('14:30')).toBeInTheDocument()
  })

  it('rien n’est écrit tant que la confirmation n’est pas donnée', () => {
    const onConfirmer = vi.fn()
    const onAnnuler = vi.fn()
    render(
      <RecapitulatifSeances
        dates={dates}
        dureeMinutes={60}
        professeurs={[]}
        etudiants={[]}
        enCours={false}
        onAnnuler={onAnnuler}
        onConfirmer={onConfirmer}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    expect(onAnnuler).toHaveBeenCalled()
    expect(onConfirmer).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Confirmer 3 séances/ }))
    expect(onConfirmer).toHaveBeenCalled()
  })

  it('avertit au-delà de trente séances, le seuil où plus personne ne relit', () => {
    const beaucoup = Array.from({ length: 40 }, (_, i) => new Date(2026, 10, 2 + i, 10, 0))
    render(
      <RecapitulatifSeances
        dates={beaucoup}
        dureeMinutes={60}
        professeurs={[]}
        etudiants={[]}
        enCours={false}
        onAnnuler={vi.fn()}
        onConfirmer={vi.fn()}
      />,
    )
    expect(screen.getByText(/Vérifiez la date de fin/)).toBeInTheDocument()
  })
})
