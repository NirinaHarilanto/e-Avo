import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { DossierEtudiant } from '../../../hooks/useDossierEtudiant'

/* Troisième étape de l'assistant de création d'un étudiant — demande client du 2026-11-04 : « on
   doit pouvoir renseigner en troisième étape toutes les informations concernant l'étudiant : les
   forfaits choisis, si le paiement est fait (sinon enregistrer un paiement), son niveau,
   renseigner son diagnostic call, son heure de cours restantes, attribution de professeur,
   création de planning ».

   Ce qui est vérifié ici est ce qui n'appartient qu'à cette étape, et ne se lit nulle part
   ailleurs : les sept blocs, l'ORDRE imposé par leurs dépendances (pas de paiement sans forfait,
   pas de planning sans professeur), la soustraction des heures déjà suivies, et le rattachement
   du diagnostic à `student_id` — impossible avant 0158, et seule raison d'être de cette
   migration. Les formulaires eux-mêmes sont ceux de la fiche de l'élève, testés de leur côté :
   ils sont remplacés ici par des repères, pour que ce fichier ne teste pas deux fois la même
   chose ni ne dépende de leur rendu. */

const insertions: { table: string; valeurs: Record<string, unknown> }[] = []
let paiement: Record<string, unknown> | null = null

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ session: { access_token: 'jeton' }, profile: { id: 'admin-1', etablissement_id: 'etab-1' } }),
}))

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (valeurs: Record<string, unknown>) => {
        insertions.push({ table, valeurs })
        return Promise.resolve({ error: null })
      },
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}))

/* Seul `CompleterDossierEtudiant` passe par ce cache (les hooks de dossier et de niveaux sont
   remplacés juste en dessous), pour y lire la ligne de paiement du forfait. */
vi.mock('../../../hooks/useCacheRequete', () => ({
  useCacheRequete: () => ({ valeur: paiement, loading: false, erreur: null, recharger: vi.fn() }),
}))

let dossierCourant: DossierEtudiant
vi.mock('../../../hooks/useDossierEtudiant', () => ({
  useDossierEtudiant: () => ({ dossier: dossierCourant, loading: false, erreur: null, recharger: vi.fn() }),
}))

let niveaux: { niveau: string }[] = []
vi.mock('../../../hooks/useNiveauxEtudiant', () => ({
  useNiveauxEtudiant: () => ({ evaluations: niveaux, loading: false, erreur: null, recharger: vi.fn() }),
}))

// Formulaires déjà testés pour eux-mêmes : réduits à un repère.
vi.mock('../CreerForfait', () => ({ CreerForfait: () => <p>formulaire de forfait</p> }))
vi.mock('../AttribuerProfesseur', () => ({ AttribuerProfesseur: () => <p>formulaire de professeur</p> }))
vi.mock('../PlanifierSeancesForfait', () => ({ PlanifierSeancesForfait: () => <p>formulaire de planning</p> }))
vi.mock('../../paiements/DetailPaiementModale', () => ({ DetailPaiementModale: () => <p>fenêtre de paiement</p> }))
/* Le questionnaire vient de lib/diagnostic.ts et n'a rien de propre à cette étape : un bouton
   suffit à simuler une réponse, ce qui laisse voir l'enregistrement — le vrai sujet ici. */
vi.mock('../../prospects/FormulaireDiagnosticCall', () => ({
  FormulaireDiagnosticCall: ({ onChange }: { onChange: (r: Record<string, string>) => void }) => (
    <button onClick={() => onChange({ niveau_estime: 'Intermediate', heures_par_semaine: '2 h' })}>répondre</button>
  ),
}))

const { CompleterDossierEtudiant } = await import('../CompleterDossierEtudiant')

function dossier(surcharge: Partial<DossierEtudiant> = {}): DossierEtudiant {
  return {
    etudiant: { id: 'eleve-1', prenom: 'Anaïs', nom: 'RASOA', etablissement_id: 'etab-1' },
    periodes: [],
    seancesCollectives: [],
    periodesActuelles: [],
    professeursDesSeances: {},
    diagnostic: null,
    diagnosticPartenaire: null,
    packages: [],
    cohorte: null,
    cohortClasse: null,
    professeurClasse: null,
    heuresConsommees: 0,
    heuresConsommeesClasse: null,
    heuresReprises: 0,
    prochaineSeance: null,
    duoPartenaire: null,
    tarifChoisi: null,
    ...surcharge,
  } as unknown as DossierEtudiant
}

const forfait40h = { id: 'forfait-1', type_programme: 'individuel', total_heures: 40, montant: 900000, echeance: null }
const professeur = { id: 'prof-1', prenom: 'Harinjo', nom: 'ANDRIAMAHENINA' }
const periodeAvecProfesseur = { affectation: { id: 'aff-1', date_fin: null }, professeur, seances: [] }

function monter(d: DossierEtudiant, type: 'individuel' | 'duo' | 'collectif' = 'individuel') {
  dossierCourant = d
  return render(<CompleterDossierEtudiant studentId="eleve-1" typeProgramme={type} onTermine={() => {}} />)
}

/* Déplie un bloc par son intitulé. Le nom accessible du bouton est « <numéro> <titre>
   <résumé> » — ou « <titre> <résumé> » dès que le bloc est renseigné, son numéro cédant la place
   à une icône `aria-hidden`. On vise donc le titre sans ancrer le début : les titres sont
   capitalisés et les résumés non, aucun des deux ne se confond avec l'autre. */
function ouvrir(intitule: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: intitule }))
}

beforeEach(() => {
  insertions.length = 0
  paiement = null
  niveaux = []
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
})

describe('CompleterDossierEtudiant', () => {
  it('propose les sept informations du dossier', () => {
    monter(dossier())

    for (const titre of [
      'Forfait',
      'Paiement',
      'Niveau',
      'Appel diagnostic',
      'Heures de cours restantes',
      'Professeur',
      'Planning prévisionnel',
    ]) {
      expect(screen.getByText(titre)).toBeTruthy()
    }
  })

  it('dit ce qui manque plutôt que d’ouvrir un formulaire sans forfait', () => {
    monter(dossier())

    ouvrir(/Paiement/)
    expect(screen.getByText(/Créez d’abord le forfait/)).toBeTruthy()
    expect(screen.queryByText('fenêtre de paiement')).toBeNull()

    ouvrir(/Heures de cours restantes/)
    expect(screen.getByText(/les heures restantes s’y déduisent/)).toBeTruthy()
  })

  /* Sans professeur, la route de planification n'aurait personne à qui attacher les séances
     (`sessions.teacher_id` est non nul depuis 0008) : le bloc le dit au lieu de proposer un
     formulaire qui échouerait à la validation. */
  it('demande un professeur avant de laisser planifier', () => {
    monter(dossier({ packages: [forfait40h] } as unknown as Partial<DossierEtudiant>))

    ouvrir(/Planning prévisionnel/)
    expect(screen.getByText(/Attribuez d’abord un professeur/)).toBeTruthy()
    expect(screen.queryByText('formulaire de planning')).toBeNull()
  })

  it('ouvre le planning dès qu’un forfait et un professeur sont en place', () => {
    monter(
      dossier({
        packages: [forfait40h],
        periodesActuelles: [periodeAvecProfesseur],
      } as unknown as Partial<DossierEtudiant>),
    )

    ouvrir(/Planning prévisionnel/)
    expect(screen.getByText('formulaire de planning')).toBeTruthy()
  })

  /* Le cœur du bloc 5 : l'admin saisit ce qu'il LIT sur son relevé — les heures RESTANTES — et
     c'est la différence qui se débite du forfait. Envoyer le chiffre saisi tel quel débiterait
     26 h au lieu de 14 et donnerait un compteur faux dans l'autre sens. */
  it('débite la différence, pas le nombre saisi, pour les heures déjà suivies', async () => {
    monter(dossier({ packages: [forfait40h] } as unknown as Partial<DossierEtudiant>))

    ouvrir(/Heures de cours restantes/)
    fireEvent.change(screen.getByLabelText(/^Heures de cours restantes/), { target: { value: '26' } })
    expect(screen.getByText(/14h seront enregistrées comme déjà suivies/)).toBeTruthy()

    fireEvent.click(screen.getByText('Enregistrer les heures déjà suivies'))
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const appel = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(appel[0]).toBe('/api/admin/reprendre-heures')
    expect(JSON.parse((appel[1] as RequestInit).body as string)).toEqual({
      packageId: 'forfait-1',
      heuresDejaSuivies: 14,
    })
  })

  it('n’envoie rien quand le forfait est intact', () => {
    monter(dossier({ packages: [forfait40h] } as unknown as Partial<DossierEtudiant>))

    ouvrir(/Heures de cours restantes/)
    // Le champ s'ouvre sur le volume souscrit : rien n'a encore été suivi, rien à débiter.
    expect((screen.getByText('Enregistrer les heures déjà suivies') as HTMLButtonElement).disabled).toBe(true)
  })

  /* Raison d'être de 0158 : un élève créé à la main n'a aucun prospect, son diagnostic se
     rattache donc à `student_id`. Écrire `prospect_id` ici violerait la contrainte d'exclusivité
     — et avant 0158, aucune ligne n'était insérable du tout. */
  it('rattache le diagnostic à l’étudiant, et non à un prospect', async () => {
    monter(dossier())

    ouvrir(/Appel diagnostic/)
    fireEvent.click(screen.getByText('répondre'))
    fireEvent.click(screen.getByText('Enregistrer le diagnostic'))

    await waitFor(() => expect(insertions).toHaveLength(1))
    const { table, valeurs } = insertions[0]
    expect(table).toBe('diagnostic_calls')
    expect(valeurs.student_id).toBe('eleve-1')
    expect(valeurs.prospect_id).toBeUndefined()
    // Niveau et rythme sont calculés depuis les réponses, jamais saisis une seconde fois.
    expect(valeurs.niveau_evalue).toBe('Intermediate')
    expect(valeurs.rythme_convenu).toBe('2 h / semaine')
  })

  it('refuse un diagnostic vide', () => {
    monter(dossier())

    ouvrir(/Appel diagnostic/)
    fireEvent.click(screen.getByText('Enregistrer le diagnostic'))

    expect(screen.getByText(/Répondez au moins à une question/)).toBeTruthy()
    expect(insertions).toHaveLength(0)
  })

  it('enregistre le niveau comme une réévaluation du dossier', async () => {
    monter(dossier())

    ouvrir(/Niveau/)
    fireEvent.change(screen.getByLabelText(/^Niveau/), { target: { value: 'Advanced' } })
    fireEvent.click(screen.getByText('Enregistrer le niveau'))

    await waitFor(() => expect(insertions).toHaveLength(1))
    expect(insertions[0].table).toBe('niveau_evaluations')
    expect(insertions[0].valeurs).toMatchObject({ student_id: 'eleve-1', niveau: 'Advanced', evalue_par: 'admin-1' })
  })

  /* Collectif : ni forfait ni planning ne se décident ici — le forfait de la vague naît du
     trigger à l'inscription, et les séances appartiennent à la classe de niveau (règle du
     2026-10-19 : « les modifications se font par classe dans la section cours collectifs »). */
  it('renvoie le collectif vers Cours collectifs pour le forfait et le planning', () => {
    monter(dossier({ packages: [forfait40h], cohorte: { id: 'v-1', nom: 'Vague Novembre' } } as unknown as Partial<DossierEtudiant>), 'collectif')

    ouvrir(/Forfait/)
    expect(screen.getByText(/le forfait de la vague a été créé automatiquement/)).toBeTruthy()
    expect(screen.queryByText('formulaire de forfait')).toBeNull()

    ouvrir(/Planning prévisionnel/)
    expect(screen.getByText(/le planning est celui de sa classe/)).toBeTruthy()
    expect(screen.queryByText('formulaire de planning')).toBeNull()
  })

  it('annonce un forfait soldé plutôt qu’un paiement à enregistrer', () => {
    paiement = { id: 'pay-1', montant: 900000, montant_regle: 900000, devise: 'Ar', statut: 'en_attente' }
    monter(dossier({ packages: [forfait40h] } as unknown as Partial<DossierEtudiant>))

    expect(screen.getByText('Réglé')).toBeTruthy()
    ouvrir(/Paiement/)
    expect(screen.getByText('Voir le paiement')).toBeTruthy()
  })

  /* Une reprise ne s'enregistre qu'une fois par forfait (`hour_ledger_reprise_unique`, 0140) :
     le bloc montre celle qui existe au lieu de proposer un formulaire qui serait refusé. */
  it('montre la reprise déjà enregistrée sans en proposer une seconde', () => {
    monter(dossier({ packages: [forfait40h], heuresReprises: 14 } as unknown as Partial<DossierEtudiant>))

    expect(screen.getByText(/14h déjà suivies avant la mise en service/)).toBeTruthy()
    ouvrir(/Heures de cours restantes/)
    expect(screen.getByText(/il en reste donc 26h/)).toBeTruthy()
    expect(screen.queryByText('Enregistrer les heures déjà suivies')).toBeNull()
  })
})
