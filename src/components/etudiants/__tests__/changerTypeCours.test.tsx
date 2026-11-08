import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { DossierEtudiant } from '../../../hooks/useDossierEtudiant'

/* Demande client du 2026-11-08 : « quand un étudiant a complètement fini son forfait de cours ou
   n'a pas encore commencé une séance de cours, on doit pouvoir changer de type de cours. »

   Deux choses se perdent facilement ici et ont chacune leur test : la RÈGLE (qui ouvre la
   bascule, et qui l'explique quand elle est fermée), et la PLACE du bouton — le client ne l'a pas
   trouvé une première fois, l'onglet qui le porte s'appelant « Forfait » pour un élève individuel
   et « Programme » pour un collectif. */

vi.mock('../../../lib/jetonAcces', () => ({ jetonAcces: async () => 'jeton' }))
vi.mock('../../../hooks/useNiveauxEtudiant', () => ({
  useNiveauxEtudiant: () => ({ evaluations: [], loading: false }),
}))
vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ profile: { id: 'admin-1', role: 'admin_etablissement' }, session: { access_token: 'jeton' } }),
}))

const { ChangerTypeCoursModale } = await import('../ChangerTypeCoursModale')
const { DossierEtudiantVue } = await import('../DossierEtudiantVue')

function monter(proprietes: Partial<Parameters<typeof ChangerTypeCoursModale>[0]> = {}) {
  return render(
    <ChangerTypeCoursModale
      studentId="eleve-1"
      nomEleve="Aina RAKOTO"
      typeActuel="individuel"
      heuresConsommees={0}
      heuresForfait={20}
      onChange={() => {}}
      {...proprietes}
    />,
  )
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ok: true, typeAvant: 'individuel', typeApres: 'collectif', seancesAnnulees: 2, inscriptionsRetirees: 0, forfaitsSoldes: [], forfaitsSupprimes: 1 }),
          { status: 200 },
        ),
    ),
  )
})

/* Décision client du 2026-11-08 : le bouton de l'en-tête s'ouvre TOUJOURS, « le bouton passer en
   cours collectif n'est actif que lorsque les conditions de changement de type sont remplies ».
   La règle se lit donc dans la fenêtre, où il y a la place de l'expliquer — un bouton grisé dans
   un en-tête n'explique rien. */
describe('ChangerTypeCoursModale — la règle', () => {
  function confirmer() {
    return screen.getByText(/^Passer en cours/) as HTMLButtonElement
  }

  it('ouvre toujours la fenêtre, même au milieu d’un forfait', () => {
    monter({ heuresConsommees: 6, heuresForfait: 20 })
    expect((screen.getByText('Changer de type de cours') as HTMLButtonElement).disabled).toBe(false)
  })

  it('autorise le basculement quand aucune heure n’a été suivie', () => {
    monter({ heuresConsommees: 0 })
    fireEvent.click(screen.getByText('Changer de type de cours'))
    expect(confirmer().disabled).toBe(false)
  })

  it('autorise le basculement quand le forfait est entièrement consommé', () => {
    monter({ heuresConsommees: 20, heuresForfait: 20 })
    fireEvent.click(screen.getByText('Changer de type de cours'))
    expect(confirmer().disabled).toBe(false)
  })

  it('le refuse au milieu d’un forfait, en disant pourquoi et où en est l’élève', () => {
    monter({ heuresConsommees: 6, heuresForfait: 20 })
    fireEvent.click(screen.getByText('Changer de type de cours'))

    expect(confirmer().disabled).toBe(true)
    expect(screen.getByText(/Possible uniquement avant la première séance/)).toBeTruthy()
    expect(screen.getByText(/6h suivies sur 20h/)).toBeTruthy()
  })

  it('autorise le basculement d’un élève sans aucun forfait connu', () => {
    monter({ heuresConsommees: 0, heuresForfait: null })
    fireEvent.click(screen.getByText('Changer de type de cours'))
    expect(confirmer().disabled).toBe(false)
  })
})

describe('ChangerTypeCoursModale — le basculement', () => {
  it('annonce les conséquences avant de rien envoyer', () => {
    monter()
    fireEvent.click(screen.getByText('Changer de type de cours'))

    expect(screen.getByText(/Ses séances individuelles encore à venir sont annulées/)).toBeTruthy()
    expect(screen.getByText(/Son professeur actuel est retiré/)).toBeTruthy()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('vise le type opposé à celui en place', async () => {
    monter({ typeActuel: 'collectif' })
    fireEvent.click(screen.getByText('Changer de type de cours'))

    // Côté collectif, ce sont les séances de la classe qui continuent sans lui.
    expect(screen.getByText(/les séances à venir de la classe continuent sans lui/)).toBeTruthy()
    fireEvent.click(screen.getByText('Passer en cours individuel'))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const appel = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(appel[0]).toBe('/api/admin/changer-type-cours')
    expect(JSON.parse((appel[1] as RequestInit).body as string)).toEqual({ studentId: 'eleve-1', cible: 'individuel' })
  })

  it('récapitule ce qui a bougé, et ce qu’il reste à faire', async () => {
    monter()
    fireEvent.click(screen.getByText('Changer de type de cours'))
    fireEvent.click(screen.getByText('Passer en cours collectif'))

    await waitFor(() => expect(screen.getByText(/passe en cours collectif/)).toBeTruthy())
    expect(screen.getByText(/2 séances à venir annulées/)).toBeTruthy()
    expect(screen.getByText(/1 forfait jamais entamé supprimé/)).toBeTruthy()
    // La route détache sans rattacher : l'écran doit le dire, sinon l'élève reste en suspens.
    expect(screen.getByText(/assigner une vague et une classe/)).toBeTruthy()
  })

  it('affiche le refus du serveur plutôt qu’un message générique', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Cet élève a déjà suivi 6 h sur 20 h' }), { status: 409 })),
    )
    monter()
    fireEvent.click(screen.getByText('Changer de type de cours'))
    fireEvent.click(screen.getByText('Passer en cours collectif'))

    await waitFor(() => expect(screen.getByText(/déjà suivi 6 h sur 20 h/)).toBeTruthy())
  })
})

/* La place du bouton, signalée deux fois par le client le 2026-11-08 : d'abord introuvable, puis
   « mets le bouton à côté de Résumer les comptes rendus, avec une couleur brillante ». Il vit
   donc dans l'EN-TÊTE du dossier, visible sans ouvrir d'onglet — c'est ce que garde ce describe,
   avec le libellé d'onglet unifié au passage (« Programme » des deux côtés, alors qu'il disait
   « Forfait » pour un élève individuel). */
describe('DossierEtudiantVue — place du panneau de changement de type', () => {
  const etudiant = {
    id: 'eleve-1',
    prenom: 'Aina',
    nom: 'RAKOTO',
    email: 'aina@exemple.test',
    status: 'approved',
    etablissement_id: 'etab-1',
    duo_partenaire_id: null,
  }

  function dossier(avecForfait: boolean): DossierEtudiant {
    return {
      etudiant,
      periodes: [],
      seancesCollectives: [],
      periodesActuelles: [],
      professeursDesSeances: {},
      diagnostic: null,
      diagnosticPartenaire: null,
      packages: avecForfait
        ? [{ id: 'forfait-1', type_programme: 'individuel', total_heures: 20, echeance: null, montant: 700000, essai: false, essai_resultat: null }]
        : [],
      cohorte: null,
      cohortClasse: null,
      professeurClasse: null,
      heuresConsommees: 0,
      prochaineSeance: null,
      tarifChoisi: null,
      duoPartenaire: null,
    } as unknown as DossierEtudiant
  }

  it('nomme l’onglet « Programme » pour un élève individuel aussi', () => {
    render(
      <DossierEtudiantVue
        dossier={dossier(true)}
        peutModifierPlanning={false}
        panneauChangementType={<button>Changer de type de cours</button>}
      />,
    )

    expect(screen.getByRole('tab', { name: 'Programme' })).toBeTruthy()
  })

  it('rend le panneau dans l’en-tête, sans avoir à ouvrir le moindre onglet', () => {
    render(
      <DossierEtudiantVue
        dossier={dossier(true)}
        peutModifierPlanning={false}
        panneauSynthese={<button>Résumer les comptes rendus</button>}
        panneauChangementType={<button>Changer de type de cours</button>}
      />,
    )

    expect(screen.getByText('Changer de type de cours')).toBeTruthy()
    // Et bien à côté de son voisin, pas ailleurs dans la page.
    const voisin = screen.getByText('Résumer les comptes rendus')
    expect(voisin.parentElement).toBe(screen.getByText('Changer de type de cours').parentElement)
  })

  /* Un élève qui n'a encore ni forfait ni vague CHOISIT son programme, il n'en « change » pas :
     le panneau de choix initial occupe déjà cette place. */
  it('ne le rend pas tant qu’il n’y a ni forfait ni vague', () => {
    render(
      <DossierEtudiantVue
        dossier={dossier(false)}
        peutModifierPlanning={false}
        panneauChoixInitial={<span>Choisir le programme</span>}
        panneauChangementType={<button>Changer de type de cours</button>}
      />,
    )

    expect(screen.queryByText('Changer de type de cours')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Programme' }))
    expect(screen.getByText('Choisir le programme')).toBeTruthy()
  })
})
