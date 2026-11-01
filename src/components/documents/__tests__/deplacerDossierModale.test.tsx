import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DeplacerDossierModale } from '../DeplacerDossierModale'
import type { DossierDocument } from '../../../hooks/useDossiersDocuments'

/* Déplacer un dossier dans un autre (2026-11-01). Ces tests fixent le seul risque réel de cette
   fonctionnalité : une arborescence qui se refermerait sur elle-même. La base l'empêche déjà
   (trigger `document_dossiers_avant_ecriture`, 0058) — ici on fixe que l'INTERFACE empêche aussi
   de la proposer, pour ne jamais renvoyer un utilisateur vers une erreur serveur évitable. */

const etat = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn() }))

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      update: (valeurs: unknown) => {
        etat.update(valeurs)
        return { eq: (c: string, v: string) => { etat.eq(c, v); return Promise.resolve({ error: null }) } }
      },
    }),
  },
}))

const dossier = (id: string, nom: string, parentId: string | null = null): DossierDocument =>
  ({ id, nom, parent_id: parentId, proprietaire_profile_id: 'moi', etablissement_wide: false }) as unknown as DossierDocument

describe('DeplacerDossierModale', () => {
  it('propose la racine et les autres dossiers comme destinations', () => {
    render(
      <DeplacerDossierModale
        dossier={dossier('cible', 'Classe de 6e')}
        dossiers={[dossier('cible', 'Classe de 6e'), dossier('autre', 'Archives')]}
        titreRacine="Mes documents"
        onFermer={vi.fn()}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Mes documents')).toBeInTheDocument()
    expect(screen.getByText('Archives')).toBeInTheDocument()
  })

  it('désactive le dossier lui-même et ses sous-dossiers comme destination', () => {
    render(
      <DeplacerDossierModale
        dossier={dossier('cible', 'Classe de 6e')}
        dossiers={[dossier('cible', 'Classe de 6e'), dossier('enfant', 'Devoirs', 'cible'), dossier('autre', 'Archives')]}
        titreRacine="Mes documents"
        onFermer={vi.fn()}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /Classe de 6e/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Devoirs/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Archives/ })).not.toBeDisabled()
  })

  it('déplace le dossier choisi vers la destination sélectionnée', async () => {
    const onChange = vi.fn()
    const onFermer = vi.fn()
    render(
      <DeplacerDossierModale
        dossier={dossier('cible', 'Classe de 6e')}
        dossiers={[dossier('cible', 'Classe de 6e'), dossier('autre', 'Archives')]}
        titreRacine="Mes documents"
        onFermer={onFermer}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Archives/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer ici' }))
    await vi.waitFor(() => expect(etat.update).toHaveBeenCalledWith({ parent_id: 'autre' }))
    expect(etat.eq).toHaveBeenCalledWith('id', 'cible')
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onFermer).toHaveBeenCalled()
  })

  it('désactive le bouton tant que l’emplacement choisi est déjà l’emplacement actuel', () => {
    render(
      <DeplacerDossierModale
        dossier={dossier('cible', 'Devoirs', 'parent')}
        dossiers={[dossier('parent', 'Classe de 6e'), dossier('cible', 'Devoirs', 'parent')]}
        titreRacine="Mes documents"
        onFermer={vi.fn()}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Classe de 6e/ }))
    expect(screen.getByRole('button', { name: 'Déplacer ici' })).toBeDisabled()
    expect(screen.getByText(/est déjà à cet endroit/)).toBeInTheDocument()
  })
})
