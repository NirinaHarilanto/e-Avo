import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Liste déroulante des forfaits proposés par HOC dans le pop-up « Ajouter un forfait » —
   demande client du 2026-11-05 : « on devrait avoir une liste déroulante des forfaits proposés
   par HOC dans la zone heures à ajouter, l'enregistrement de paiement doit suivre, et la mise à
   jour des heures de l'étudiant et l'historique de forfait ».

   Jusqu'ici l'admin tapait un nombre d'heures libre, sans rapport avec la grille tarifaire, et
   devait retrouver le prix lui-même pour le ressaisir côté paiement. Ce que garde ce fichier :
   la liste propose les formules du BON programme, en choisir une remplit les heures ET le prix,
   un prix retouché à la main n'est plus écrasé, et la saisie libre reste possible hors grille. */

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ session: { access_token: 'jeton' }, profile: { id: 'admin-1' } }),
}))

vi.mock('../../../lib/jetonAcces', () => ({ jetonAcces: async () => 'jeton' }))

vi.mock('../../../hooks/useTarifs', () => ({
  useTarifs: () => ({
    tarifs: [
      { id: 't-10', type_programme: 'individuel', titre: '10h', heures: 10, prix: 300000 },
      { id: 't-20', type_programme: 'individuel', titre: '20h', heures: 20, prix: 500000 },
      { id: 't-duo', type_programme: 'duo', titre: 'DUO 20h', heures: 20, prix: 700000 },
      /* Une ligne sans volume d'heures (prestation à l'unité) n'a rien à faire dans une liste
         dont le rôle est d'ajouter des heures. */
      { id: 't-sans-heures', type_programme: 'individuel', titre: 'Forfait sur mesure', heures: null, prix: 0 },
    ],
  }),
}))

const { AjouterForfaitModale } = await import('../AjouterForfaitModale')

function monter(typeProgramme: 'individuel' | 'duo' = 'individuel') {
  return render(
    <AjouterForfaitModale
      studentId="eleve-1"
      nomEtudiant="Herilanto ANDRIANTSOA"
      etablissementId="etab-1"
      typeProgramme={typeProgramme}
      onFermer={() => {}}
      onAjoute={() => {}}
    />,
  )
}

/* `toLocaleString('fr-FR')` sépare les milliers par une espace FINE INSÉCABLE (U+202F), pas
   par une espace ordinaire : une attente écrite au clavier ne correspondrait jamais. */
const sommeFr = (n: number) => n.toLocaleString('fr-FR')

const liste = () => screen.getByLabelText(/^Forfait à ajouter/) as HTMLSelectElement
const montant = () => screen.getByLabelText(/^Montant réglé/) as HTMLInputElement

function corpsEnvoye() {
  const appel = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
  return JSON.parse((appel[1] as RequestInit).body as string)
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
})

describe('AjouterForfaitModale — liste des forfaits HOC', () => {
  it('propose les formules de la grille, prix compris', () => {
    monter()

    expect(screen.getByRole('option', { name: `10h · ${sommeFr(300000)} Ar` })).toBeTruthy()
    expect(screen.getByRole('option', { name: `20h · ${sommeFr(500000)} Ar` })).toBeTruthy()
  })

  /* Le titre de la grille porte déjà le volume : le répéter donnait « 20h · 20h · 500 000 Ar »,
     exactement le travers de libellé relevé par le client le 2026-10-30. */
  it('n’écrit pas le volume deux fois dans le libellé', () => {
    monter()
    expect(screen.queryByRole('option', { name: /20h · 20h/ })).toBeNull()
  })

  it('ne propose que les formules du programme de l’élève', () => {
    monter('individuel')
    expect(screen.queryByRole('option', { name: /DUO 20h/ })).toBeNull()
  })

  it('propose les formules DUO pour un élève en binôme', () => {
    monter('duo')
    expect(screen.getByRole('option', { name: `DUO 20h · ${sommeFr(700000)} Ar` })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /^10h/ })).toBeNull()
  })

  /* Une ligne de grille sans volume d'heures ne peut rien ajouter au compteur. */
  it('écarte une formule sans nombre d’heures', () => {
    monter()
    expect(screen.queryByRole('option', { name: /sur mesure/ })).toBeNull()
  })

  it('choisir une formule remplit les heures ET le prix du paiement', () => {
    monter()

    fireEvent.change(liste(), { target: { value: 't-20' } })
    /* La phrase est coupée par un <strong> autour du volume : on interroge le texte du
       conteneur plutôt que celui d'un nœud isolé. */
    expect(
      screen.getByText(
        (_, element) => {
          const texte = element?.textContent ?? ''
          return texte.includes('20h') && texte.includes('viendront s’ajouter au compteur')
        },
        { selector: 'p' },
      ),
    ).toBeTruthy()

    fireEvent.click(screen.getByText('Enregistrer le paiement'))
    expect(montant().value).toBe('500000')
  })

  /* Un prix négocié ne doit pas être repris par le simple fait de rouvrir la liste — même
     garde-fou que CreerForfait.tsx. */
  it('n’écrase pas un montant que l’admin a saisi lui-même', () => {
    monter()

    fireEvent.change(liste(), { target: { value: 't-10' } })
    fireEvent.click(screen.getByText('Enregistrer le paiement'))
    fireEvent.change(montant(), { target: { value: '250000' } })

    fireEvent.change(liste(), { target: { value: 't-20' } })
    expect(montant().value).toBe('250000')
  })

  /* La saisie libre d'avant reste accessible : geste commercial, reliquat, forfait hors grille. */
  it('laisse saisir des heures libres hors grille', () => {
    monter()

    expect(screen.getByLabelText(/^Heures à ajouter/)).toBeTruthy()
    fireEvent.change(liste(), { target: { value: 't-10' } })
    expect(screen.queryByLabelText(/^Heures à ajouter/)).toBeNull()
  })

  it('transmet la formule retenue au serveur, avec ses heures et son prix', async () => {
    monter()

    fireEvent.change(liste(), { target: { value: 't-20' } })
    fireEvent.click(screen.getByText('Enregistrer le paiement'))
    fireEvent.change(screen.getByLabelText(/^Motif/), { target: { value: 'Règlement en espèces' } })
    fireEvent.click(screen.getByText('Confirmer le paiement'))
    fireEvent.click(screen.getByText('Valider l’ajout du forfait'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(corpsEnvoye()).toMatchObject({
      studentId: 'eleve-1',
      heures: 20,
      tarifId: 't-20',
      montantPaiement: 500000,
      motifPaiement: 'Règlement en espèces',
    })
  })

  /* Hors grille, aucun `tarifId` ne part : le forfait n'est rattaché à aucune ligne de la
     grille, et le prétendre fausserait la lecture de son prix plus tard. */
  it('n’envoie aucune formule quand les heures sont saisies librement', async () => {
    monter()

    fireEvent.change(screen.getByLabelText(/^Heures à ajouter/), { target: { value: '7' } })
    fireEvent.click(screen.getByText('Enregistrer le paiement'))
    fireEvent.change(montant(), { target: { value: '200000' } })
    fireEvent.change(screen.getByLabelText(/^Motif/), { target: { value: 'Reliquat' } })
    fireEvent.click(screen.getByText('Confirmer le paiement'))
    fireEvent.click(screen.getByText('Valider l’ajout du forfait'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const corps = corpsEnvoye()
    expect(corps.heures).toBe(7)
    expect(corps.tarifId).toBeUndefined()
  })

  /* Règle posée le 2026-09-22 et inchangée : pas de forfait ajouté sans qu'on sache s'il est
     payé. */
  it('garde la validation bloquée tant que le paiement n’est pas confirmé', () => {
    monter()
    fireEvent.change(liste(), { target: { value: 't-20' } })

    expect((screen.getByText('Valider l’ajout du forfait') as HTMLButtonElement).disabled).toBe(true)
  })
})
