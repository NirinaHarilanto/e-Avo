import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/* Demande client du 2026-11-18 : « est-ce que tu as rajouté le bloc Bonus du côté espace
   professeurs, en mode lecture uniquement ? Au lieu de modifier comme bouton, le professeur
   aurait le bouton "Voir" pour voir l'historique. »

   Ce fichier garde la frontière entre les deux côtés : l'admin accorde et corrige
   (BonusProfesseurModale.tsx), le professeur ne fait que consulter
   (HistoriqueBonusModale.tsx) — aucun bouton d'écriture ne doit même apparaître à l'écran, la
   RLS les refuserait de toute façon mais un bouton qui échoue serait une mauvaise surprise. */

const { HistoriqueBonusModale } = await import('../HistoriqueBonusModale')

function bonus(id: string, montant: number, motif: string, paye: boolean) {
  return {
    id,
    montant,
    motif,
    accorde_le: '2026-11-10',
    teacher_payment_id: paye ? 'paie-1' : null,
  } as never
}

describe('HistoriqueBonusModale — ce que le professeur voit', () => {
  it('affiche les totaux en attente et payés', () => {
    render(
      <HistoriqueBonusModale
        nomProfesseur="Patricia ANDRIAMIFIDISOA"
        bonus={[bonus('b-1', 10000, 'Renouvellement de Aina', false), bonus('b-2', 15000, 'Renouvellement de Miary', true)]}
        onFermer={() => {}}
      />,
    )

    // Chaque montant apparaît deux fois (le total, puis la ligne de l'historique) : c'est
    // voulu, le total doit donc être au moins présent une fois.
    expect(screen.getAllByText(/10 000,00 Ar/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/15 000,00 Ar/).length).toBeGreaterThan(0)
    expect(screen.getByText('En attente de paiement')).toBeTruthy()
    expect(screen.getByText('Déjà payés')).toBeTruthy()
  })

  it('montre chaque ligne avec son statut', () => {
    render(
      <HistoriqueBonusModale
        nomProfesseur="Patricia ANDRIAMIFIDISOA"
        bonus={[bonus('b-1', 10000, 'Renouvellement de Aina', false), bonus('b-2', 15000, 'Renouvellement de Miary', true)]}
        onFermer={() => {}}
      />,
    )

    expect(screen.getByText('Renouvellement de Aina')).toBeTruthy()
    expect(screen.getByText('Renouvellement de Miary')).toBeTruthy()
    expect(screen.getByText('En attente')).toBeTruthy()
    expect(screen.getByText('Payé')).toBeTruthy()
  })

  it('affiche un état vide sans aucun bonus', () => {
    render(<HistoriqueBonusModale nomProfesseur="Patricia ANDRIAMIFIDISOA" bonus={[]} onFermer={() => {}} />)

    expect(screen.getByText('Aucun bonus pour le moment')).toBeTruthy()
  })

  /* Le cœur de la demande : aucun moyen d'agir, seulement de regarder. */
  it('ne propose aucun bouton d’écriture', () => {
    render(
      <HistoriqueBonusModale
        nomProfesseur="Patricia ANDRIAMIFIDISOA"
        bonus={[bonus('b-1', 10000, 'Renouvellement de Aina', false)]}
        onFermer={() => {}}
      />,
    )

    expect(screen.queryByText('Accorder le bonus')).toBeNull()
    expect(screen.queryByText(/^Accorder /)).toBeNull()
    expect(screen.queryByText('Renouvellements repérés')).toBeNull()
    expect(screen.queryByRole('button', { name: /Corriger|Retirer|Modifier/ })).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('ferme au clic sur la croix', () => {
    const onFermer = vi.fn()
    render(<HistoriqueBonusModale nomProfesseur="Patricia ANDRIAMIFIDISOA" bonus={[]} onFermer={onFermer} />)

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onFermer).toHaveBeenCalledTimes(1)
  })
})
