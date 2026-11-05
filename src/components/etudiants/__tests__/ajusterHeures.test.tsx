import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { PeriodeProfesseur } from '../../../hooks/useDossierEtudiant'

/* Correction manuelle du compteur d'heures d'un élève — demande client du 2026-11-05 : « l'admin
   puisse modifier le comptage, et gérer les impacts des modifications pour le professeur et
   l'étudiant concernée ».

   Ce qui est vérifié ici n'appartient qu'à ce pop-up : l'admin saisit un TOTAL et c'est l'ÉCART
   qui part au serveur (choix du client, 2026-11-04 — le total est le chiffre qu'il lit sur la
   fiche) ; la justification est obligatoire ; et la répercussion sur le professeur est un choix
   explicite, jamais un effet de bord. */

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: historique }) }),
      }),
    }),
  },
}))

vi.mock('../../../lib/jetonAcces', () => ({ jetonAcces: async () => 'jeton' }))

let historique: { id: string; heures_avant: number; heures_apres: number; justification: string; teacher_id: string | null; created_at: string }[] = []

const { AjusterHeuresModale } = await import('../AjusterHeuresModale')

const professeur = (id: string, prenom: string, nom: string) =>
  ({ affectation: { id: 'aff-' + id, date_fin: null }, professeur: { id, prenom, nom }, seances: [] }) as unknown as PeriodeProfesseur

function monter(heuresActuelles: number, periodes: PeriodeProfesseur[] = []) {
  return render(
    <AjusterHeuresModale
      studentId="eleve-1"
      nomEleve="Haingo RAMALASON"
      heuresActuelles={heuresActuelles}
      periodesActuelles={periodes}
      onFermer={() => {}}
      onAjuste={() => {}}
    />,
  )
}

function corpsEnvoye() {
  const appel = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
  return JSON.parse((appel[1] as RequestInit).body as string)
}

beforeEach(() => {
  historique = []
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
})

describe('AjusterHeuresModale', () => {
  it('envoie le nouveau TOTAL, que le serveur convertira en écart', async () => {
    monter(10)

    fireEvent.change(screen.getByLabelText(/^Nouveau total/), { target: { value: '9' } })
    fireEvent.change(screen.getByLabelText(/^Justification/), { target: { value: 'Séance comptée deux fois' } })
    fireEvent.click(screen.getByText('Enregistrer la correction'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(corpsEnvoye()).toEqual({
      studentId: 'eleve-1',
      heuresApres: 9,
      justification: 'Séance comptée deux fois',
      teacherId: null,
    })
  })

  it('annonce l’écart à l’écran avant de valider', () => {
    monter(10)
    fireEvent.change(screen.getByLabelText(/^Nouveau total/), { target: { value: '12.5' } })

    expect(screen.getByText(/10h → 12h 30m/)).toBeTruthy()
  })

  /* Une correction sans motif serait illisible six mois plus tard, sur un compteur qui porte une
     conséquence financière. Le client l'a demandée obligatoire dès la première formulation. */
  it('refuse d’enregistrer sans justification', () => {
    monter(10)
    fireEvent.change(screen.getByLabelText(/^Nouveau total/), { target: { value: '9' } })

    expect((screen.getByText('Enregistrer la correction') as HTMLButtonElement).disabled).toBe(true)
  })

  it('refuse d’enregistrer quand le total ne change pas', () => {
    monter(10)
    fireEvent.change(screen.getByLabelText(/^Justification/), { target: { value: 'Un motif' } })

    expect((screen.getByText('Enregistrer la correction') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/il n’y a rien à corriger/)).toBeTruthy()
  })

  /* La répercussion est DÉCOCHÉE par défaut : retirer des heures à un élève ne veut pas dire que
     le professeur ne les a pas données. C'est à l'admin de le dire. */
  it('ne touche pas au professeur tant que la case n’est pas cochée', async () => {
    monter(10, [professeur('prof-1', 'Harinjo', 'ANDRIAMAHENINA')])

    fireEvent.change(screen.getByLabelText(/^Nouveau total/), { target: { value: '9' } })
    fireEvent.change(screen.getByLabelText(/^Justification/), { target: { value: 'Erreur de clôture' } })
    fireEvent.click(screen.getByText('Enregistrer la correction'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(corpsEnvoye().teacherId).toBeNull()
  })

  it('transmet le professeur quand l’admin coche la répercussion', async () => {
    monter(10, [professeur('prof-1', 'Harinjo', 'ANDRIAMAHENINA')])

    fireEvent.change(screen.getByLabelText(/^Nouveau total/), { target: { value: '9' } })
    fireEvent.change(screen.getByLabelText(/^Justification/), { target: { value: 'Erreur de clôture' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByText('Enregistrer la correction'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(corpsEnvoye().teacherId).toBe('prof-1')
  })

  /* 0138 : un élève peut avoir plusieurs professeurs. Les répartir ou prendre le premier
     remplirait la paie de quelqu'un que personne n'a désigné — l'admin tranche lui-même. */
  it('fait choisir le professeur quand l’élève en a plusieurs', () => {
    monter(10, [professeur('prof-1', 'Harinjo', 'ANDRIAMAHENINA'), professeur('prof-2', 'Oelimanda', 'RANAIVO')])

    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByLabelText(/^Professeur concerné/)).toBeTruthy()
  })

  it('ne propose aucun choix quand l’élève n’a qu’un professeur', () => {
    monter(10, [professeur('prof-1', 'Harinjo', 'ANDRIAMAHENINA')])

    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.queryByLabelText(/^Professeur concerné/)).toBeNull()
  })

  it('dit qu’il n’y a personne à impacter quand aucun professeur n’est attribué', () => {
    monter(10)

    expect(screen.getByText(/Aucun professeur n’est attribué/)).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  /* Bloc historique, redemandé par le client le 2026-11-05 : « il faut également mettre
     l'historique des changements ». */
  it('montre les corrections précédentes avec leur motif', async () => {
    historique = [
      {
        id: 'aj-1',
        heures_avant: 12,
        heures_apres: 10,
        justification: 'Deux séances comptées en double',
        teacher_id: 'prof-1',
        created_at: '2026-11-01T08:00:00Z',
      },
    ]
    monter(10)

    await waitFor(() => expect(screen.getByText('12h → 10h')).toBeTruthy())
    expect(screen.getByText('Deux séances comptées en double')).toBeTruthy()
    expect(screen.getByText('répercutée sur le professeur')).toBeTruthy()
  })

  it('dit explicitement quand aucune correction n’a jamais été faite', async () => {
    monter(10)
    await waitFor(() => expect(screen.getByText(/Aucune correction manuelle/)).toBeTruthy())
  })
})
