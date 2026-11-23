import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Signalé par le client le 2026-11-23 : « l'utilisateur de l'admin se plaint de devoir insérer à
 * chaque connexion son adresse mail et mot de passe. Pourquoi il n'y a pas de mémorisation de
 * ses identifiants pour les reconnexions sur le même appareil ? »
 *
 * La session, elle, persistait bien : le client Supabase la garde dans `localStorage` et aucune
 * déconnexion automatique n'existe. Ce que le navigateur ne mémorisait pas, c'étaient les
 * IDENTIFIANTS — et la cause tenait à la forme du formulaire.
 *
 * La connexion se fait en deux temps : l'adresse, puis le mot de passe. Or un navigateur
 * n'enregistre un identifiant que s'il voit le nom d'utilisateur ET le mot de passe dans le
 * MÊME formulaire. Le second n'affichait l'adresse que dans un `<p>` : Chrome ne proposait donc
 * jamais d'enregistrer, et ne remplissait jamais rien au retour.
 *
 * Ces tests gardent les deux conditions de cette mémorisation — faute de quoi le défaut
 * reviendrait sans que rien ne casse visiblement. */

const etat = vi.hoisted(() => ({ emailConnu: true }))

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ session: null, profile: null, loading: false, platformAdmin: false, platformAdminLoading: false }),
}))
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))
vi.mock('../../vitrine/animations', () => ({ useFondVitrine: () => {} }))
vi.mock('../../vitrine/PreuveSociale', () => ({
  AVIS_CONNEXION: [],
  AvatarsProfesseurs: () => null,
  CarteAvis: () => null,
  ChiffresCles: () => null,
}))

const { Connexion } = await import('../Connexion')

const EMAIL = 'admin@harionlineclub.com'

beforeEach(() => {
  etat.emailConnu = true
  globalThis.fetch = vi.fn(
    async () => new Response(JSON.stringify({ existe: etat.emailConnu, aMotDePasse: true }), { status: 200 }),
  ) as never
})

/** Passe l'étape de l'adresse pour atteindre le formulaire du mot de passe. */
async function allerAuMotDePasse() {
  render(<Connexion />)
  fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: EMAIL } })
  fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
  await waitFor(() => expect(screen.getByLabelText(/Mot de passe/)).toBeTruthy())
}

describe('mémorisation des identifiants par le navigateur', () => {
  /* `username` est la valeur que les gestionnaires apparient avec `current-password` ; `email`
     ne suffit pas toujours à former un couple enregistrable. */
  it('annonce le champ d’adresse comme un identifiant', () => {
    render(<Connexion />)

    expect(screen.getByLabelText(/E-mail/).getAttribute('autocomplete')).toBe('username')
  })

  /* LE point de la correction : sans adresse DANS ce formulaire, aucun navigateur ne propose
     d'enregistrer le mot de passe. */
  it('répète l’adresse dans le formulaire du mot de passe', async () => {
    await allerAuMotDePasse()

    const champs = document.querySelectorAll<HTMLInputElement>('input[autocomplete="username"]')
    expect(champs).toHaveLength(1)
    expect(champs[0].value).toBe(EMAIL)
    expect(champs[0].readOnly).toBe(true)
  })

  /* Ce champ répété ne doit ni s'entendre, ni s'atteindre au clavier : l'adresse est déjà
     affichée juste au-dessus, la redire serait une gêne. */
  it('garde ce champ hors du clavier et des lecteurs d’écran', async () => {
    await allerAuMotDePasse()

    const champ = document.querySelector<HTMLInputElement>('input[autocomplete="username"]')!
    expect(champ.tabIndex).toBe(-1)
    expect(champ.getAttribute('aria-hidden')).toBe('true')
    /* Ni `display: none` ni `visibility: hidden` : un champ retiré de la mise en page est
       souvent ignoré par les gestionnaires de mots de passe, ce qui annulerait la correction. */
    expect(champ.style.display).not.toBe('none')
    expect(champ.style.visibility).not.toBe('hidden')
  })

  it('demande au navigateur de remplir le mot de passe enregistré', async () => {
    await allerAuMotDePasse()

    expect(screen.getByLabelText(/Mot de passe/).getAttribute('autocomplete')).toBe('current-password')
  })
})
