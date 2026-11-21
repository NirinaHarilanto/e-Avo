import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-11-21 : « quand on clique sur le bouton "Relancer le prospect", est-ce
 * que l'on peut un deuxième pop-up sur lequel se trouve le mail à envoyer au prospect et
 * éventuellement possibilité de modifier le contenu du mail avant de valider et envoyer ».
 *
 * Ce que ces tests gardent, et qui est le cœur de la demande :
 *   — le premier clic n'envoie PLUS RIEN. Jusqu'ici, « Relancer le prospect » expédiait l'e-mail
 *     sur-le-champ, sans retour possible ;
 *   — le message affiché est celui que le serveur a composé, destinataire compris ;
 *   — ce qui part est ce qui est À L'ÉCRAN, retouches comprises : montrer un texte et en envoyer
 *     un autre serait pire que de n'en montrer aucun ;
 *   — annuler n'envoie rien. */

const etat = vi.hoisted(() => ({
  apercu: {
    destinataire: 'wrfcamrodin@gmail.com',
    objet: 'On vous attend chez Hari Online Club !',
    corps: 'Bonjour Wadjeedah,\n\nVotre diagnostic est fait : il ne reste qu’à choisir votre formule.',
    manquantes: [] as string[],
  },
  erreurApercu: null as string | null,
  appels: [] as { url: string; corps: Record<string, unknown> }[],
}))

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'jeton' } } }) } },
}))
vi.mock('../../../hooks/useRelances', () => ({
  useRelances: () => ({ relances: [], loading: false, recharger: vi.fn() }),
}))

const { BoutonRelance } = await import('../Relances')

const CIBLE = { prospectId: 'prospect-1', motif: 'forfait_a_choisir' } as const

beforeEach(() => {
  etat.erreurApercu = null
  etat.appels = []
  globalThis.fetch = vi.fn(async (url: string, options: { body: string }) => {
    const corps = JSON.parse(options.body)
    etat.appels.push({ url, corps })
    if (url.includes('apercu-relance')) {
      if (etat.erreurApercu) return new Response(JSON.stringify({ error: etat.erreurApercu }), { status: 404 })
      return new Response(JSON.stringify(etat.apercu), { status: 200 })
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }) as never
})

function monter(onEnvoyee = vi.fn()) {
  render(<BoutonRelance cible={CIBLE} libelle="Relancer le prospect" onEnvoyee={onEnvoyee} />)
  return onEnvoyee
}

const declencheur = () => screen.getByRole('button', { name: 'Relancer le prospect' })
const champObjet = () => screen.getByLabelText(/^Objet/) as HTMLInputElement
const champMessage = () => screen.getByLabelText(/^Message/) as HTMLTextAreaElement
const boutonEnvoyer = () => screen.getByRole('button', { name: /Envoyer la relance/ }) as HTMLButtonElement

const envois = () => etat.appels.filter((a) => a.url.includes('relancer-'))

async function ouvrir() {
  fireEvent.click(declencheur())
  await waitFor(() => expect(champMessage()).toBeTruthy())
}

describe('relance : relire avant d’envoyer', () => {
  it('n’envoie rien au premier clic, et ouvre le message', async () => {
    monter()
    await ouvrir()

    expect(envois()).toEqual([])
    expect(etat.appels[0].url).toContain('apercu-relance')
    expect(etat.appels[0].corps).toMatchObject({ prospectId: 'prospect-1', motif: 'forfait_a_choisir' })
  })

  it('montre le destinataire et le message composé par le serveur', async () => {
    monter()
    await ouvrir()

    expect(screen.getByText('wrfcamrodin@gmail.com')).toBeTruthy()
    expect(champObjet().value).toBe(etat.apercu.objet)
    expect(champMessage().value).toBe(etat.apercu.corps)
  })

  it('envoie le texte tel qu’il est affiché', async () => {
    const onEnvoyee = monter()
    await ouvrir()
    fireEvent.click(boutonEnvoyer())

    await waitFor(() => expect(envois()).toHaveLength(1))
    expect(envois()[0].url).toContain('relancer-prospect')
    expect(envois()[0].corps).toMatchObject({
      prospectId: 'prospect-1',
      motif: 'forfait_a_choisir',
      objet: etat.apercu.objet,
      corpsEmail: etat.apercu.corps,
    })
    await waitFor(() => expect(onEnvoyee).toHaveBeenCalled())
  })

  /* Le cœur de « possibilité de modifier le contenu » : ce qui part est ce qui est à l'écran. */
  it('envoie les retouches de l’administration, et non le texte du modèle', async () => {
    monter()
    await ouvrir()
    fireEvent.change(champObjet(), { target: { value: 'Votre place vous attend' } })
    fireEvent.change(champMessage(), { target: { value: 'Bonjour Wadjeedah, appelez-nous quand vous voulez.' } })
    fireEvent.click(boutonEnvoyer())

    await waitFor(() => expect(envois()).toHaveLength(1))
    expect(envois()[0].corps).toMatchObject({
      objet: 'Votre place vous attend',
      corpsEmail: 'Bonjour Wadjeedah, appelez-nous quand vous voulez.',
    })
  })

  it('n’envoie rien quand on annule', async () => {
    monter()
    await ouvrir()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    await waitFor(() => expect(screen.queryByLabelText(/^Message/)).toBeNull())
    expect(envois()).toEqual([])
  })

  /* Un message vidé ne doit pas pouvoir partir : un e-mail sans objet ni corps arriverait chez le
     prospect comme une erreur de l'école. */
  it('ferme l’envoi tant que l’objet ou le message est vide', async () => {
    monter()
    await ouvrir()

    fireEvent.change(champMessage(), { target: { value: '   ' } })
    expect(boutonEnvoyer().disabled).toBe(true)

    fireEvent.change(champMessage(), { target: { value: 'Un mot suffit.' } })
    expect(boutonEnvoyer().disabled).toBe(false)

    fireEvent.change(champObjet(), { target: { value: '' } })
    expect(boutonEnvoyer().disabled).toBe(true)
  })

  /* Une information sans valeur laisse un blanc au milieu d'une phrase — « le test oral l'un de
     ces samedis : , , , . » C'est ici, et seulement ici, qu'on peut encore le combler.

     Le client a demandé le 2026-11-21 si cet avertissement pouvait disparaître. Il reste, mais
     il nomme désormais la CONSÉQUENCE et le chemin pour la régler une bonne fois : le faire
     corriger à la main à chaque envoi reviendrait à faire refaire indéfiniment le même geste. */
  it('annonce les informations manquantes, en clair, et où les régler', async () => {
    etat.apercu = { ...etat.apercu, manquantes: ['Lien du formulaire du test écrit'] }
    monter()
    await ouvrir()

    expect(screen.getByText(/laisseront un blanc dans le message/)).toBeTruthy()
    expect(screen.getByText('Lien du formulaire du test écrit')).toBeTruthy()
    expect(screen.getByText(/Liens et numéros réutilisés/)).toBeTruthy()
    etat.apercu = { ...etat.apercu, manquantes: [] }
  })

  /* Et rien ne s'affiche quand il n'y a rien à signaler : un avertissement permanent n'avertit
     plus de rien. */
  it('ne dit rien quand toutes les informations sont renseignées', async () => {
    monter()
    await ouvrir()

    expect(screen.queryByText(/laisseront un blanc/)).toBeNull()
  })

  it('dit pourquoi le message n’a pas pu être préparé, sans rien envoyer', async () => {
    etat.erreurApercu = 'Modèle 1.2 introuvable ou désactivé.'
    monter()
    fireEvent.click(declencheur())

    expect(await screen.findByText(/Modèle 1.2 introuvable/)).toBeTruthy()
    expect(envois()).toEqual([])
  })
})
