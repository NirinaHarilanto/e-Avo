import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Partage à PLUSIEURS destinataires d'un coup, façon Outlook — demande client du 2026-10-10 :
   « on doit pouvoir rajouter plusieurs personnes, comme l'ajout de plusieurs personnes dans la
   zone de destinataire d'un mail outlook ». Un seul INSERT porteur de toutes les lignes NOUVELLES
   (pas un appel par personne), le même mot joint pour tout le monde.

   Révision du même jour, après la première version : PLUS AUCUNE exclusion des suggestions.
   « Il ne faut pas exclure les personnes des suggestions [...] après validation, tu ne bloques
   pas, tu partageras uniquement la vue aux personnes qui ne l'ont pas encore, et tu affiches un
   pop-up pour notifier l'utilisateur sur les personnes qui ont déjà eu accès [...] et les
   personnes qui viennent d'avoir la vue. » Toute personne reste choisissable, y compris une qui a
   déjà accès ; le tri entre « nouveau » et « déjà partagé » se fait APRÈS validation, jamais en
   empêchant un choix. */

const etat = vi.hoisted(() => ({
  profils: [] as { id: string; nom: string; prenom: string; status: string }[],
  partages: [] as { id: string; document_id: string; destinataire_profile_id: string; partage_par_profile_id: string; message: string | null }[],
  insert: vi.fn(async (_lignes: unknown) => ({ error: null as { code: string; message: string } | null })),
  delete: vi.fn(async () => ({ error: null as { message: string } | null })),
}))

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ order: async () => ({ data: etat.profils }) }),
          }),
        }
      }
      // document_partages
      return {
        select: () => ({ eq: async () => ({ data: etat.partages }) }),
        insert: (lignes: unknown) => etat.insert(lignes),
        delete: () => ({ eq: async () => etat.delete() }),
      }
    },
  },
}))

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ profile: { id: 'moi', prenom: 'Moi', nom: 'Même' } }),
}))

const { PartagerDocumentModale } = await import('../PartagerDocumentModale')

const document = {
  id: 'doc-1',
  nom_original: 'Support.pdf',
  owner_profile_id: 'moi',
  etablissement_wide: false,
} as unknown as Parameters<typeof PartagerDocumentModale>[0]['document']

beforeEach(() => {
  etat.profils = [
    { id: 'ana', nom: 'Rivot', prenom: 'Ana', status: 'approved' },
    { id: 'bo', nom: 'Tahiry', prenom: 'Bo', status: 'approved' },
    { id: 'cy', nom: 'Rakoto', prenom: 'Cy', status: 'approved' },
  ]
  etat.partages = []
  etat.insert.mockReset()
  etat.insert.mockResolvedValue({ error: null })
})

/* Attend la fin du chargement asynchrone (useEffect → charger()) avant d'interagir : sans cette
   attente, le sélecteur n'est pas encore monté (l'écran affiche encore « Chargement… ») et
   `getByPlaceholderText` échoue immédiatement. */
async function ouvrirChamp() {
  return screen.findByPlaceholderText('Rechercher un nom ou un prénom…')
}

/* Prend l'élément une seule fois (voir `ouvrirChamp`) plutôt que de le re-chercher par son
   placeholder à chaque appel : dès qu'une première personne est choisie, SelecteurPersonnes vide
   ce placeholder (il ne réapparaît que le champ redevenu vide de toute pastille) — le re-chercher
   par ce texte échouerait au deuxième ajout. */
async function choisir(champ: HTMLElement, nom: string) {
  fireEvent.change(champ, { target: { value: nom } })
  const option = await screen.findByRole('option', { name: new RegExp(nom, 'i') })
  fireEvent.mouseDown(option)
}

describe('PartagerDocumentModale — plusieurs destinataires', () => {
  it('ajoute plusieurs personnes comme des pastilles amovibles', async () => {
    render(<PartagerDocumentModale document={document} onFermer={() => {}} onChange={() => {}} />)
    const champ = await ouvrirChamp()

    await choisir(champ, 'Ana')
    await choisir(champ, 'Bo')

    expect(screen.getByRole('button', { name: /Retirer Ana Rivot/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Retirer Bo Tahiry/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Partager avec 2 personnes' })).toBeTruthy()
  })

  it('envoie un seul INSERT avec une ligne par destinataire et le même mot joint', async () => {
    render(<PartagerDocumentModale document={document} onFermer={() => {}} onChange={() => {}} />)
    const champ = await ouvrirChamp()

    await choisir(champ, 'Ana')
    await choisir(champ, 'Bo')
    fireEvent.change(screen.getByPlaceholderText(/voici le support/), { target: { value: 'Pour la réunion' } })
    fireEvent.click(screen.getByRole('button', { name: 'Partager avec 2 personnes' }))

    await waitFor(() => expect(etat.insert).toHaveBeenCalledTimes(1))
    const lignes = etat.insert.mock.calls[0][0] as { destinataire_profile_id: string; message: string | null }[]
    expect(lignes).toHaveLength(2)
    expect(lignes.map((l) => l.destinataire_profile_id).sort()).toEqual(['ana', 'bo'])
    expect(lignes.every((l) => l.message === 'Pour la réunion')).toBe(true)
  })

  it('ne retire plus personne des suggestions, même une personne qui a déjà accès', async () => {
    etat.partages = [{ id: 'p1', document_id: 'doc-1', destinataire_profile_id: 'ana', partage_par_profile_id: 'moi', message: null }]
    render(<PartagerDocumentModale document={document} onFermer={() => {}} onChange={() => {}} />)

    const champ = await screen.findByPlaceholderText('Rechercher un nom ou un prénom…')
    fireEvent.change(champ, { target: { value: 'Ana' } })

    expect(await screen.findByRole('option', { name: /Ana/i })).toBeTruthy()
  })

  it('n’envoie aucun INSERT quand tout le monde choisi a déjà accès, et l’affiche en pop-up', async () => {
    etat.partages = [{ id: 'p1', document_id: 'doc-1', destinataire_profile_id: 'ana', partage_par_profile_id: 'moi', message: null }]
    render(<PartagerDocumentModale document={document} onFermer={() => {}} onChange={() => {}} />)
    const champ = await ouvrirChamp()

    await choisir(champ, 'Ana')
    fireEvent.click(screen.getByRole('button', { name: 'Partager' }))

    expect(await screen.findByText(/Tout le monde choisi avait déjà accès/)).toBeTruthy()
    expect(etat.insert).not.toHaveBeenCalled()
  })

  it('partage seulement aux nouveaux et liste les deux groupes dans la pop-up de résultat', async () => {
    etat.partages = [{ id: 'p1', document_id: 'doc-1', destinataire_profile_id: 'ana', partage_par_profile_id: 'moi', message: null }]
    render(<PartagerDocumentModale document={document} onFermer={() => {}} onChange={() => {}} />)
    const champ = await ouvrirChamp()

    // Ana a déjà accès, Bo non : les deux restent choisissables (plus d'exclusion).
    await choisir(champ, 'Ana')
    await choisir(champ, 'Bo')
    fireEvent.click(screen.getByRole('button', { name: 'Partager avec 2 personnes' }))

    await waitFor(() => expect(etat.insert).toHaveBeenCalledTimes(1))
    // Seule Bo (la nouvelle) part dans l'INSERT — Ana, déjà destinataire, n'est pas réinsérée.
    const lignes = etat.insert.mock.calls[0][0] as { destinataire_profile_id: string }[]
    expect(lignes.map((l) => l.destinataire_profile_id)).toEqual(['bo'])

    /* Scopé à la pop-up de résultat : « Ana Rivot » apparaît aussi dans le pied « Vos partages sur
       ce fichier », en dehors de cette pop-up — sans portée, les deux occurrences se
       confondraient. */
    const popup = within(await screen.findByRole('dialog', { name: 'Résultat du partage' }))
    expect(popup.getByText('Viennent d’obtenir l’accès')).toBeTruthy()
    expect(popup.getByText('Bo Tahiry')).toBeTruthy()
    expect(popup.getByText('Avaient déjà accès — inchangé')).toBeTruthy()
    expect(popup.getByText('Ana Rivot')).toBeTruthy()
  })

  it('recharge la liste et avertit en cas de doublon détecté côté serveur malgré le filtrage local', async () => {
    // Coïncidence pure : l'état local ne sait pas encore qu'Ana a été partagée entre-temps
    // (par un autre onglet, par exemple) — le serveur refuse, le filtrage local n'a rien pu faire.
    etat.insert.mockResolvedValueOnce({ error: { code: '23505', message: 'conflit' } })
    render(<PartagerDocumentModale document={document} onFermer={() => {}} onChange={() => {}} />)
    const champ = await ouvrirChamp()

    await choisir(champ, 'Ana')
    fireEvent.click(screen.getByRole('button', { name: 'Partager' }))

    expect(await screen.findByText(/a déjà ce fichier partagé entre-temps/)).toBeTruthy()
  })

  it('ne propose de retirer que les partages que j’ai moi-même émis', async () => {
    etat.partages = [
      { id: 'p1', document_id: 'doc-1', destinataire_profile_id: 'ana', partage_par_profile_id: 'moi', message: null },
      // Émis par quelqu'un d'autre (visible depuis 0113), mais pas « mien » : pas de bouton Retirer.
      { id: 'p2', document_id: 'doc-1', destinataire_profile_id: 'bo', partage_par_profile_id: 'quelqu-un-d-autre', message: null },
    ]
    render(<PartagerDocumentModale document={document} onFermer={() => {}} onChange={() => {}} />)

    await screen.findByText('Vos partages sur ce fichier')
    expect(screen.getByText('Ana Rivot')).toBeTruthy()
    expect(screen.queryByText('Bo Tahiry')).toBeNull()
  })
})
