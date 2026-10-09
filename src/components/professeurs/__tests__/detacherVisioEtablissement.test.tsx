import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Le bloc « Agenda Google de l'administration » (0107, demande client du 2026-10-10) ne doit
   jamais apparaître pour un professeur dont toutes les séances sont déjà ailleurs que sur le
   compte de l'établissement — sinon chaque fiche professeur afficherait un bouton d'action sans
   rien à faire. Ces tests fixent ce seuil d'affichage et le texte de confirmation, qui est la
   seule garde-fou avant une action qui annule de vraies invitations Google. */

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ session: { access_token: 'jeton-test' } }),
}))

const { DetacherVisioEtablissement } = await import('../DetacherVisioEtablissement')

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('DetacherVisioEtablissement', () => {
  it("ne rend rien quand aucune séance n'est hébergée par l'établissement", () => {
    const { container } = render(
      <DetacherVisioEtablissement teacherId="prof-1" nombreSeances={0} onDetache={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche le nombre de réunions concernées et le bouton d’action', () => {
    render(<DetacherVisioEtablissement teacherId="prof-1" nombreSeances={5} onDetache={() => {}} />)
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByRole('button', { name: /retirer ces réunions de mon agenda google/i })).toBeTruthy()
  })

  it('demande confirmation avant d’agir, et prévient que les participants reçoivent une annulation', () => {
    render(<DetacherVisioEtablissement teacherId="prof-1" nombreSeances={3} onDetache={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /retirer ces réunions de mon agenda google/i }))
    expect(screen.getByText(/annulées dans Google Agenda/)).toBeTruthy()
    expect(screen.getByText(/reçoivent une notification d’annulation/)).toBeTruthy()
  })

  it('appelle la route avec le teacherId et répercute le résultat', async () => {
    const onDetache = vi.fn()
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ detachees: 3, restant: 0, echecs: [] }), { status: 200 }),
    )

    render(<DetacherVisioEtablissement teacherId="prof-42" nombreSeances={3} onDetache={onDetache} />)
    fireEvent.click(screen.getByRole('button', { name: /retirer ces réunions de mon agenda google/i }))
    fireEvent.click(screen.getByRole('button', { name: /^retirer de mon agenda$/i }))

    await waitFor(() => expect(onDetache).toHaveBeenCalledTimes(1))

    const appel = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(appel[0]).toBe('/api/admin/detacher-visio-etablissement')
    expect(JSON.parse(appel[1].body)).toEqual({ teacherId: 'prof-42' })
    expect(await screen.findByText(/3 réunion\(s\) détachée/)).toBeTruthy()
  })

  it('affiche l’erreur renvoyée par le serveur sans fermer la confirmation', async () => {
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Connexion Google expirée.' }), { status: 502 }),
    )

    render(<DetacherVisioEtablissement teacherId="prof-1" nombreSeances={2} onDetache={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /retirer ces réunions de mon agenda google/i }))
    fireEvent.click(screen.getByRole('button', { name: /^retirer de mon agenda$/i }))

    expect(await screen.findByText('Connexion Google expirée.')).toBeTruthy()
  })
})
