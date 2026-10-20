import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-10-19 : « pour les cours corporate & chat and chill, le professeur
   concerné devrait renseigner un compte rendu au moment de la clôture de la séance [...] visible
   par le professeur [...] et par l'admin [...] », complétée le lendemain : « il faut que l'admin
   puisse modifier le compte rendu [...] si besoin ».

   Ces tests vérifient le RENDU réel (pas seulement le typage) : qui voit un formulaire d'écriture
   et qui ne voit qu'une lecture. `FichePrestation` (agenda du professeur, CalendrierProfesseur.tsx)
   n'est jamais ouverte par un admin — `LignePrestation` avec `peutGerer`, la vraie fiche admin
   (ProfesseurDetailAdmin.tsx), couvre ce second parcours. */

let profilActuel = { id: 'prof-1' }
vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ session: { access_token: 'jeton-test' }, profile: profilActuel }),
}))

const { FichePrestation, LignePrestation } = await import('../PrestationsExternes')

const professeur = {
  id: 'prof-1',
  prenom: 'Nirina',
  nom: 'RAKOTONJANAHARY',
  etablissement_id: 'etab-1',
  taux_horaire_corporate: 50000,
  taux_horaire_chat_chill: 30000,
} as never

function prestation(champs: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'prestation-1',
    etablissement_id: 'etab-1',
    teacher_id: 'prof-1',
    type: 'corporate',
    client: 'Telma',
    debut: '2026-10-19T08:00:00.000Z',
    duree_minutes: 60,
    lieu: null,
    notes: null,
    statut: 'terminee',
    terminee_le: '2026-10-19T09:00:00.000Z',
    terminee_par: 'prof-1',
    motif_annulation: null,
    compte_rendu: null,
    compte_rendu_le: null,
    cree_par: 'admin-1',
    created_at: '2026-10-18T08:00:00.000Z',
    updated_at: '2026-10-18T08:00:00.000Z',
    ...champs,
  } as never
}

beforeEach(() => {
  profilActuel = { id: 'prof-1' }
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })))
})

describe('CompteRenduPrestation (via FichePrestation)', () => {
  it('propose le formulaire au professeur concerné quand rien n’est encore rédigé', () => {
    render(<FichePrestation prestation={prestation()} professeur={professeur} onChange={() => {}} />)
    // Repliée par défaut (demande client du 2026-10-13, hors geste « je viens de clôturer ») :
    // il faut déplier avant de trouver le formulaire.
    fireEvent.click(screen.getByText('Compte rendu'))
    expect(screen.getByPlaceholderText(/Ce qui a été fait/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Enregistrer le compte rendu/ })).toBeTruthy()
  })

  it('propose aussi le formulaire à l’admin, même si rien n’est encore rédigé', () => {
    profilActuel = { id: 'admin-1' }
    render(<LignePrestation prestation={prestation()} professeur={professeur} peutGerer peutCloturer onChange={() => {}} />)
    fireEvent.click(screen.getByText('Compte rendu'))
    expect(screen.getByPlaceholderText(/Ce qui a été fait/)).toBeTruthy()
  })

  it('laisse l’admin modifier un compte rendu déjà rédigé par le professeur', async () => {
    const onChange = vi.fn()
    profilActuel = { id: 'admin-1' }
    render(
      <LignePrestation
        prestation={prestation({ compte_rendu: 'Atelier e-mails professionnels, groupe motivé.' })}
        professeur={professeur}
        peutGerer
        peutCloturer
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByText('Compte rendu'))
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le compte rendu' }))
    const champ = screen.getByDisplayValue('Atelier e-mails professionnels, groupe motivé.')
    fireEvent.change(champ, { target: { value: 'Atelier e-mails professionnels, groupe motivé (corrigé par l’admin).' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer le compte rendu/ }))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
  })

  it('n’affiche qu’une lecture, sans formulaire, à un visiteur qui n’est ni l’admin ni le professeur concerné', () => {
    profilActuel = { id: 'autre-prof' }
    render(
      <LignePrestation
        prestation={prestation({ compte_rendu: 'Atelier e-mails professionnels, groupe motivé.' })}
        professeur={professeur}
        peutGerer={false}
        peutCloturer={false}
        onChange={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('Compte rendu'))
    expect(screen.getByText('Atelier e-mails professionnels, groupe motivé.')).toBeTruthy()
    expect(screen.queryByPlaceholderText(/Ce qui a été fait/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Enregistrer le compte rendu/ })).toBeNull()
  })

  it('laisse le professeur concerné modifier son propre compte rendu déjà rédigé', () => {
    render(
      <FichePrestation
        prestation={prestation({ compte_rendu: 'Atelier e-mails professionnels, groupe motivé.' })}
        professeur={professeur}
        onChange={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('Compte rendu'))
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le compte rendu' }))
    expect(screen.getByDisplayValue('Atelier e-mails professionnels, groupe motivé.')).toBeTruthy()
  })

  it('n’affiche aucun compte rendu tant que la prestation n’est pas clôturée', () => {
    render(<FichePrestation prestation={prestation({ statut: 'planifiee' })} professeur={professeur} onChange={() => {}} />)
    expect(screen.queryByText('Compte rendu')).toBeNull()
  })

  it('envoie le texte saisi à la route serveur dédiée', async () => {
    const onChange = vi.fn()
    render(<FichePrestation prestation={prestation()} professeur={professeur} onChange={onChange} />)
    fireEvent.click(screen.getByText('Compte rendu'))
    fireEvent.change(screen.getByPlaceholderText(/Ce qui a été fait/), { target: { value: 'Atelier réussi.' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer le compte rendu/ }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/prestations/enregistrer-compte-rendu',
        expect.objectContaining({
          body: JSON.stringify({ prestationId: 'prestation-1', compteRendu: 'Atelier réussi.' }),
        }),
      ),
    )
  })
})
