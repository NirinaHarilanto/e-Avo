import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PanneauDossiers } from '../PanneauDossiers'
import type { DossierDocument } from '../../../hooks/useDossiersDocuments'

/* Panneau de navigation de l'espace documentaire (2026-10-31) : ces tests fixent ce que le
   client a demandé mot pour mot — un panneau visible, un arbre qui se déplie, et un clic droit
   qui ouvre les mêmes actions que sur un PC. Ils fixent aussi la limite inverse : un dossier
   qu'on nous a PARTAGÉ ne se renomme ni ne se supprime depuis ce menu, parce qu'il ne nous
   appartient pas (la base ne l'autorise pas non plus, voir 0155). */

const dossier = (id: string, nom: string, parentId: string | null = null): DossierDocument =>
  ({
    id,
    nom,
    parent_id: parentId,
    proprietaire_profile_id: 'moi',
    etablissement_id: 'etab',
    etablissement_wide: false,
    created_at: '2026-10-31T08:00:00Z',
    created_by_profile_id: 'moi',
    proprietaire_role: 'student',
  }) as unknown as DossierDocument

type Props = Parameters<typeof PanneauDossiers>[0]

const rendre = (surcharges: Partial<Omit<Props, 'actions'>> & { actions?: Partial<Props['actions']> } = {}) => {
  const actions: Props['actions'] = {
    onOuvrir: vi.fn(),
    onRenommer: vi.fn(),
    onSupprimer: vi.fn(),
    onNouveauSousDossier: vi.fn(),
    onPartager: vi.fn(),
    ...(surcharges.actions ?? {}),
  }
  render(
    <PanneauDossiers
      dossiers={[dossier('d1', 'Dossier 1'), dossier('d2', 'Dossier 2'), dossier('d1a', 'Sous-dossier', 'd1')]}
      dossierCourantId={null}
      titreRacine="Mes documents"
      compteurDe={() => ({ fichiers: 0, dossiers: 0 })}
      partagesRecus={[]}
      descendancePartagee={[]}
      nombreFichiersRecus={0}
      idPartages="__partages__"
      peutOrganiser
      {...surcharges}
      actions={actions}
    />,
  )
  return actions
}

describe('PanneauDossiers', () => {
  it('affiche la racine et les dossiers de premier niveau, sans les sous-dossiers repliés', () => {
    rendre()
    expect(screen.getByText('Mes documents')).toBeInTheDocument()
    expect(screen.getByText('Dossier 1')).toBeInTheDocument()
    expect(screen.getByText('Dossier 2')).toBeInTheDocument()
    // Replié par défaut, comme un explorateur qui s'ouvre sur sa racine.
    expect(screen.queryByText('Sous-dossier')).not.toBeInTheDocument()
  })

  it('déplie un dossier sans l’ouvrir : le chevron et la ligne sont deux gestes distincts', () => {
    const actions = rendre()
    fireEvent.click(screen.getAllByLabelText('Déplier')[0])
    expect(screen.getByText('Sous-dossier')).toBeInTheDocument()
    // Déplier ne doit pas naviguer : sinon impossible d'explorer l'arbre sans changer de contenu.
    expect(actions.onOuvrir).not.toHaveBeenCalled()
  })

  it('ouvre le dossier au clic sur son nom', () => {
    const actions = rendre()
    fireEvent.click(screen.getByText('Dossier 1'))
    expect(actions.onOuvrir).toHaveBeenCalledWith('d1')
  })

  it('ouvre au clic droit un menu contextuel avec les actions d’un dossier de PC', () => {
    rendre()
    fireEvent.contextMenu(screen.getByText('Dossier 1'))
    const menu = screen.getByRole('menu')
    const libelles = Array.from(menu.querySelectorAll('button')).map((b) => b.textContent)
    expect(libelles).toEqual(['Ouvrir', 'Nouveau sous-dossier', 'Renommer', 'Partager…', 'Supprimer'])
  })

  it('déclenche le renommage depuis le menu contextuel', () => {
    const actions = rendre()
    fireEvent.contextMenu(screen.getByText('Dossier 2'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Renommer' }))
    expect(actions.onRenommer).toHaveBeenCalledWith(expect.objectContaining({ id: 'd2' }))
  })

  it('n’offre ni renommage ni suppression quand l’espace n’est pas réorganisable', () => {
    rendre({ peutOrganiser: false, actions: { onRenommer: undefined, onSupprimer: undefined, onNouveauSousDossier: undefined } })
    fireEvent.contextMenu(screen.getByText('Dossier 1'))
    const libelles = Array.from(screen.getByRole('menu').querySelectorAll('button')).map((b) => b.textContent)
    expect(libelles).toEqual(['Ouvrir', 'Partager…'])
  })

  it('montre les dossiers reçus à part, et signale celui qui autorise l’écriture', () => {
    rendre({
      partagesRecus: [
        {
          dossier: { ...dossier('p1', 'Classe de 6e'), proprietaire_profile_id: 'autre' } as DossierDocument,
          partage: { niveau: 'ecriture', partage_par_nom: 'Koloina' } as never,
        },
        {
          dossier: { ...dossier('p2', 'Archives'), proprietaire_profile_id: 'autre' } as DossierDocument,
          partage: { niveau: 'lecture', partage_par_nom: 'Koloina' } as never,
        },
      ],
    })
    expect(screen.getByText('Partagés avec moi')).toBeInTheDocument()
    expect(screen.getByText('Classe de 6e')).toBeInTheDocument()
    // Le badge ne se pose que sur le dossier en écriture : c'est ce qui dit où l'on peut déposer.
    expect(screen.getAllByText('écriture')).toHaveLength(1)
  })

  it('n’offre aucune action de rangement sur un dossier reçu', () => {
    rendre({
      partagesRecus: [
        {
          dossier: { ...dossier('p1', 'Classe de 6e'), proprietaire_profile_id: 'autre' } as DossierDocument,
          partage: { niveau: 'ecriture', partage_par_nom: 'Koloina' } as never,
        },
      ],
    })
    fireEvent.contextMenu(screen.getByText('Classe de 6e'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
