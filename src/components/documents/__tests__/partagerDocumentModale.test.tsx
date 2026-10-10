import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Partage à PLUSIEURS destinataires d'un coup, façon Outlook — demande client du 2026-10-10 :
   « on doit pouvoir rajouter plusieurs personnes, comme l'ajout de plusieurs personnes dans la
   zone de destinataire d'un mail outlook ». Ces tests fixent ce qui change de comportement : un
   seul INSERT porteur de toutes les lignes (pas un appel par personne), le même mot joint pour
   tout le monde, et l'exclusion des personnes déjà destinataires — c'est elle qui évite qu'un
   doublon sur une seule personne fasse échouer le partage de toutes les autres (un INSERT
   multi-lignes est une transaction unique côté Postgres). */

const etat = vi.hoisted(() => ({
  profils: [] as { id: string; nom: string; prenom: string; status: string }[],
  partages: [] as { id: string; document_id: string; destinataire_profile_id: string; message: string | null }[],
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

  it('exclut des suggestions une personne déjà destinataire d’un partage', async () => {
    etat.partages = [{ id: 'p1', document_id: 'doc-1', destinataire_profile_id: 'ana', message: null }]
    render(<PartagerDocumentModale document={document} onFermer={() => {}} onChange={() => {}} />)

    const champ = await screen.findByPlaceholderText('Rechercher un nom ou un prénom…')
    fireEvent.change(champ, { target: { value: 'Ana' } })

    /* `queryByRole` est immédiat : pas d'option pour Ana à attendre puisqu'elle ne doit JAMAIS
       apparaître. Un `findByRole` aurait attendu tout le délai par défaut avant d'échouer. */
    expect(screen.queryByRole('option', { name: /Ana/i })).toBeNull()
  })

  it('affiche un message singulier pour une seule personne', async () => {
    render(<PartagerDocumentModale document={document} onFermer={() => {}} onChange={() => {}} />)
    const champ = await ouvrirChamp()

    await choisir(champ, 'Cy')
    fireEvent.click(screen.getByRole('button', { name: 'Partager' }))

    expect(await screen.findByText(/la personne verra ce fichier/)).toBeTruthy()
  })

  it('recharge la liste et avertit en cas de doublon détecté côté serveur', async () => {
    etat.insert.mockResolvedValueOnce({ error: { code: '23505', message: 'conflit' } })
    render(<PartagerDocumentModale document={document} onFermer={() => {}} onChange={() => {}} />)
    const champ = await ouvrirChamp()

    await choisir(champ, 'Ana')
    await choisir(champ, 'Bo')
    fireEvent.click(screen.getByRole('button', { name: 'Partager avec 2 personnes' }))

    expect(await screen.findByText(/a déjà ce fichier partagé/)).toBeTruthy()
  })
})
