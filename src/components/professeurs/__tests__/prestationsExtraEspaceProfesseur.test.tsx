import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

/* Demande client du 2026-11-17 : « ce bloc sera visible du côté professeur en mode LECTURE
   UNIQUEMENT ». Même frontière que pour les bonus — l'admin attribue et corrige
   (PrestationsExtraModale), le professeur consulte (HistoriqueExtraModale). Aucun champ, aucun
   bouton d'écriture ne doit apparaître de son côté : la RLS (0163) les refuserait, mais un
   bouton qui échoue serait une mauvaise surprise. */

const { HistoriqueExtraModale } = await import('../HistoriqueExtraModale')

function extra(id: string, montant: number, type: string, statut: string, paye = false) {
  return {
    id,
    montant,
    type_prestation: type,
    date_prestation: '2026-11-15',
    lieu: 'En ligne',
    duree_minutes: 90,
    statut,
    teacher_payment_id: paye ? 'paie-1' : null,
  } as never
}

describe('HistoriqueExtraModale — ce que le professeur voit', () => {
  it('affiche les trois totaux', () => {
    render(
      <HistoriqueExtraModale
        nomProfesseur="Patricia ANDRIAMIFIDISOA"
        extras={[extra('e-1', 20000, 'Atelier', 'planifiee'), extra('e-2', 30000, 'Jury', 'validee')]}
        onFermer={() => {}}
      />,
    )

    expect(screen.getByText('Planifié')).toBeTruthy()
    expect(screen.getByText('Validé, à payer')).toBeTruthy()
    expect(screen.getByText('Déjà payé')).toBeTruthy()
  })

  it('montre chaque prestation avec son type, sa date, son lieu et sa durée', () => {
    render(
      <HistoriqueExtraModale
        nomProfesseur="Patricia ANDRIAMIFIDISOA"
        extras={[extra('e-1', 20000, 'Atelier de conversation', 'validee')]}
        onFermer={() => {}}
      />,
    )

    expect(screen.getByText('Atelier de conversation (15/11/2026) · En ligne')).toBeTruthy()
    expect(screen.getByText('Durée : 1h 30m')).toBeTruthy()
    expect(screen.getByText('Validée')).toBeTruthy()
  })

  it('distingue une prestation déjà payée', () => {
    render(
      <HistoriqueExtraModale
        nomProfesseur="Patricia ANDRIAMIFIDISOA"
        extras={[extra('e-1', 20000, 'Atelier', 'validee', true)]}
        onFermer={() => {}}
      />,
    )

    expect(screen.getByText('Payée')).toBeTruthy()
  })

  it('affiche un état vide sans aucune prestation', () => {
    render(<HistoriqueExtraModale nomProfesseur="Patricia ANDRIAMIFIDISOA" extras={[]} onFermer={() => {}} />)

    expect(screen.getByText('Aucune prestation pour le moment')).toBeTruthy()
  })

  /* Le cœur de la demande : aucun moyen d'agir, seulement de regarder. */
  it('ne propose ni formulaire ni bouton d’écriture', () => {
    render(
      <HistoriqueExtraModale
        nomProfesseur="Patricia ANDRIAMIFIDISOA"
        extras={[extra('e-1', 20000, 'Atelier', 'planifiee')]}
        onFermer={() => {}}
      />,
    )

    expect(screen.queryByText('Attribuer la prestation')).toBeNull()
    expect(screen.queryByText(/Corriger cette prestation/)).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    // Seule la croix « Fermer » subsiste : aucun bouton d'action sur les lignes.
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Fermer'])
  })
})
