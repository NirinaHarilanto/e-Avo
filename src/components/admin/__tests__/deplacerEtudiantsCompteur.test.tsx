import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Demande client du 2026-11-19 : « Quand l'admin choisit de déplacer un étudiant vers une autre
   classe ou une autre vague de classe, alors qu'il n'a pas encore terminé tout son forfait
   d'heures en cours, il faut alors l'avertir et lui donner le choix s'il souhaite garder le
   compteur actuel ou souhaite réinitialiser le compteur de l'étudiant. Il faut mettre en valeur
   ce choix. Il faut que l'admin valide son choix. »

   Quatre exigences, et ce fichier en garde les quatre séparément :
     — AVERTIR : le bloc n'apparaît que pour un élève réellement à mi-parcours, et il annonce ses
       volumes réels ;
     — DONNER LE CHOIX : deux options, aucune pré-cochée — pré-cocher reviendrait à décider à sa
       place du sort d'heures déjà payées ;
     — VALIDER : le bouton de déplacement reste fermé tant que rien n'est coché ;
     — et le choix doit ARRIVER à la route, sans quoi tout le reste n'est qu'un décor.

   Le forfait annoncé est celui de L'ÉLÈVE, pas celui que vend la vague : un élève déjà déplacé
   une fois en conservant son compteur porte un forfait réduit, et c'est ce total-là que la route
   reprendra. Annoncer 32 h quand le déplacement en accordera 20 ferait mentir l'écran. */

interface Ligne {
  [cle: string]: unknown
}

const ELEVES = [
  { id: 'eleve-1', prenom: 'Aina', nom: 'RAKOTO' },
  { id: 'eleve-2', prenom: 'Miary', nom: 'RABE' },
]
/* `forfaits` = ce que chaque élève a réellement acheté ; `heuresForfaitVague` = ce que la vague
   vend. Les deux diffèrent exprès, pour que les tests puissent dire lequel est lu. */
let heuresForfaitVague: number | null = 32
let forfaits: Ligne[] = []
/* Les écritures d'heures, avec leur rattachement : `session_id` pour une séance suivie dans
   l'application, `package_id` pour une reprise d'antériorité (0140), qui n'a aucune séance. */
let debitsHeures: Ligne[] = []

vi.mock('../../../lib/supabaseClient', () => {
  /* Faux client : un constructeur chaînable qui se résout en `data` quand on l'attend. Les
     filtres ne sont pas rejoués — chaque table n'est interrogée qu'une fois par la modale. */
  function requete(donnees: unknown) {
    const builder: Record<string, unknown> = {}
    for (const methode of ['select', 'eq', 'in', 'is', 'order', 'limit']) {
      builder[methode] = () => builder
    }
    builder.maybeSingle = () => Promise.resolve({ data: donnees, error: null })
    builder.then = (resoudre: (v: unknown) => unknown) => Promise.resolve({ data: donnees, error: null }).then(resoudre)
    return builder
  }
  return {
    supabase: {
      from: (table: string) => {
        if (table === 'profiles') return requete(ELEVES)
        if (table === 'sessions') return requete([{ id: 'seance-1' }])
        if (table === 'cohorts') return requete({ heures_forfait: heuresForfaitVague })
        if (table === 'packages') return requete(forfaits)
        if (table === 'hour_ledger') return requete(debitsHeures)
        throw new Error('table inattendue dans ce test : ' + table)
      },
    },
  }
})

vi.mock('../../../context/ProfileContext', () => ({
  useProfileContext: () => ({ session: { user: { id: 'admin-1' } }, profile: { id: 'admin-1', role: 'admin' } }),
}))
vi.mock('../../../lib/jetonAcces', () => ({ jetonAcces: async () => 'jeton' }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

const CLASSE_DEPART = {
  id: 'classe-beginner',
  cohort_id: 'vague-1',
  niveau: 'beginner',
  nom: 'A',
  creneau: 'samedi_matin',
} as never
const VAGUE_1 = { id: 'vague-1', nom: 'Vague Novembre' }
const VAGUE_2 = { id: 'vague-2', nom: 'Vague Décembre' }

vi.mock('../../../hooks/useClassesAvecMembres', () => ({
  useClassesAvecMembres: () => ({
    classes: [
      { classe: CLASSE_DEPART, cohorte: VAGUE_1, membreIds: ['eleve-1', 'eleve-2'] },
      {
        classe: { id: 'classe-interm', cohort_id: 'vague-1', niveau: 'intermediate', nom: 'B', creneau: 'samedi_matin' },
        cohorte: VAGUE_1,
        membreIds: [],
      },
      {
        classe: { id: 'classe-dec', cohort_id: 'vague-2', niveau: 'beginner', nom: 'C', creneau: 'samedi_matin' },
        cohorte: VAGUE_2,
        membreIds: [],
      },
    ],
    chargement: false,
  }),
}))
vi.mock('../../../hooks/useCreneauxClasses', () => ({ useCreneauxClasses: () => ({ creneaux: [] }) }))

const { DeplacerEtudiantsModale } = await import('../CohortesAdmin')

function monter() {
  return render(
    <DeplacerEtudiantsModale
      classe={CLASSE_DEPART}
      studentIds={['eleve-1', 'eleve-2']}
      onFermer={() => {}}
      onChange={() => {}}
    />,
  )
}

/* ListeChoix dessine sa liste DANS la page et non dans un `<select>` natif (voir ListeChoix.tsx) :
   les options n'existent dans le DOM qu'une fois le déclencheur ouvert. */
function choisir(etiquette: RegExp, option: RegExp) {
  fireEvent.click(screen.getByLabelText(etiquette))
  fireEvent.click(screen.getByRole('option', { name: option }))
}

const boutonDeplacer = () => screen.getByRole('button', { name: /^Déplacer/ }) as HTMLButtonElement

async function cocher(nom: RegExp) {
  await waitFor(() => expect(screen.getByText(nom)).toBeTruthy())
  fireEvent.click(screen.getByText(nom))
}

beforeEach(() => {
  heuresForfaitVague = 32
  // Aina a un forfait de 20 h (déjà déplacée une fois) dont elle a suivi 8 h → 12 h restantes.
  forfaits = [
    { id: 'forfait-1', student_id: 'eleve-1', total_heures: 20, cohort_class_id: 'classe-beginner', clos_le: null },
    { id: 'forfait-2', student_id: 'eleve-2', total_heures: 32, cohort_class_id: 'classe-beginner', clos_le: null },
  ]
  debitsHeures = [{ student_id: 'eleve-1', heures: 8, session_id: 'seance-1', package_id: null }]
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as never
})

describe('déplacement : choix du sort des heures restantes', () => {
  it('avertit pour un élève à mi-parcours, avec SES volumes à lui', async () => {
    monter()
    await cocher(/Aina RAKOTO/)

    await waitFor(() => expect(screen.getByText(/n’a pas terminé son forfait/)).toBeTruthy())
    /* 8 h sur 20 h, 12 h restantes — et non « sur 32 h », qui est le forfait de la vague et non
       le sien. C'est le chiffre que le déplacement appliquera. */
    const ligne = screen.getByText(/Aina RAKOTO —/)
    expect(ligne.textContent).toContain('8h suivies sur 20h')
    expect(ligne.textContent).toContain('12h restantes')
  })

  it('ne dit rien pour un élève qui n’a suivi aucune heure', async () => {
    monter()
    await cocher(/Miary RABE/)

    await waitFor(() => expect(screen.getByLabelText(/^Nouvelle classe/)).toBeTruthy())
    expect(screen.queryByText(/pas terminé son forfait/)).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
  })

  /* « Il faut que l'admin valide son choix » : aucune option n'est pré-cochée, et le bouton
     reste fermé jusqu'à ce qu'il en coche une. */
  it('garde le bouton fermé tant que le choix n’est pas coché', async () => {
    monter()
    await cocher(/Aina RAKOTO/)
    await waitFor(() => expect(screen.getByLabelText(/^Nouvelle classe/)).toBeTruthy())
    choisir(/^Nouvelle classe/, /Intermediate/)

    expect(screen.getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked)).toBe(true)
    expect(boutonDeplacer().disabled).toBe(true)

    fireEvent.click(screen.getByRole('radio', { name: /Conserver le compteur/ }))
    expect(boutonDeplacer().disabled).toBe(false)
  })

  it('n’attend aucun choix quand personne n’est à mi-parcours', async () => {
    monter()
    await cocher(/Miary RABE/)
    await waitFor(() => expect(screen.getByLabelText(/^Nouvelle classe/)).toBeTruthy())
    choisir(/^Nouvelle classe/, /Intermediate/)

    expect(boutonDeplacer().disabled).toBe(false)
  })

  it('transmet « conserver » à la route', async () => {
    monter()
    await cocher(/Aina RAKOTO/)
    await waitFor(() => expect(screen.getByLabelText(/^Nouvelle classe/)).toBeTruthy())
    choisir(/^Nouvelle classe/, /Intermediate/)
    fireEvent.click(screen.getByRole('radio', { name: /Conserver le compteur/ }))
    fireEvent.click(boutonDeplacer())

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const corps = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(corps).toMatchObject({ classeCibleId: 'classe-interm', studentIds: ['eleve-1'], compteurHeures: 'conserver' })
  })

  it('transmet « réinitialiser » à la route', async () => {
    monter()
    await cocher(/Aina RAKOTO/)
    await waitFor(() => expect(screen.getByLabelText(/^Nouvelle classe/)).toBeTruthy())
    choisir(/^Nouvelle classe/, /Intermediate/)
    fireEvent.click(screen.getByRole('radio', { name: /Réinitialiser le compteur/ }))
    fireEvent.click(boutonDeplacer())

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    const corps = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(corps.compteurHeures).toBe('reinitialiser')
  })

  /* Le choix se pose aussi en changeant de VAGUE — c'est l'autre moitié de la phrase du client,
     et le chemin où des heures se perdaient jusqu'ici. */
  it('réclame le même choix pour une classe d’une autre vague', async () => {
    monter()
    await cocher(/Aina RAKOTO/)
    await waitFor(() => expect(screen.getByLabelText(/^Nouvelle vague/)).toBeTruthy())
    choisir(/^Nouvelle vague/, /Décembre/)
    choisir(/^Nouvelle classe/, /Beginner/)

    expect(screen.getByText(/n’a pas terminé son forfait/)).toBeTruthy()
    expect(boutonDeplacer().disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /Réinitialiser le compteur/ }))
    expect(boutonDeplacer().disabled).toBe(false)
  })

  /* L'incident du 2026-11-20, signalé par le client capture à l'appui : la fiche de Larissa
     RAOELIMBOLOLONA annonçait 32h/32 — forfait terminé — quand cette fenêtre la présentait à 4h
     sur 32, donc à mi-parcours, et lui aurait offert 28 h gratuites en « conservant » son
     compteur. 28 de ses 32 heures viennent d'une REPRISE D'ANTÉRIORITÉ (0140) : suivies avant la
     mise en service, elles n'ont aucune séance derrière elles et se rattachent au forfait. Cet
     écran les ignorait. */
  it('compte les heures reprises à l’import, qui n’ont aucune séance', async () => {
    debitsHeures = [
      { student_id: 'eleve-1', heures: 16, session_id: null, package_id: 'forfait-1' },
      { student_id: 'eleve-1', heures: 1, session_id: 'seance-1', package_id: null },
    ]

    monter()
    await cocher(/Aina RAKOTO/)
    await waitFor(() => expect(screen.getByLabelText(/^Nouvelle classe/)).toBeTruthy())

    // 16 reprises + 1 séance = 17 sur 20, et non 1 sur 20.
    expect(screen.getByText(/Aina RAKOTO —/).textContent).toContain('17h suivies sur 20h')
    expect(screen.getByText(/Aina RAKOTO —/).textContent).toContain('3h restantes')
  })

  /* Et quand la reprise suffit à solder le forfait, plus aucun choix n'est demandé : l'élève a
     fini, il n'a rien à arbitrer. C'est exactement le cas de Larissa. */
  it('ne demande aucun choix quand les heures reprises soldent le forfait', async () => {
    debitsHeures = [{ student_id: 'eleve-1', heures: 20, session_id: null, package_id: 'forfait-1' }]

    monter()
    await cocher(/Aina RAKOTO/)
    await waitFor(() => expect(screen.getByLabelText(/^Nouvelle classe/)).toBeTruthy())

    expect(screen.queryByText(/pas terminé son forfait/)).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
  })

  /* La reprise d'un forfait d'une AUTRE classe ne compte pas davantage qu'une séance d'ailleurs :
     la portée « classe » de 0146 vaut pour les deux chemins. */
  it('ignore une reprise rattachée au forfait d’une autre classe', async () => {
    forfaits = [
      { id: 'forfait-1', student_id: 'eleve-1', total_heures: 20, cohort_class_id: 'classe-beginner', clos_le: null },
      { id: 'forfait-ancien', student_id: 'eleve-1', total_heures: 32, cohort_class_id: 'classe-ailleurs', clos_le: '2026-10-01' },
    ]
    debitsHeures = [
      { student_id: 'eleve-1', heures: 30, session_id: null, package_id: 'forfait-ancien' },
      { student_id: 'eleve-1', heures: 8, session_id: 'seance-1', package_id: null },
    ]

    monter()
    await cocher(/Aina RAKOTO/)
    await waitFor(() => expect(screen.getByLabelText(/^Nouvelle classe/)).toBeTruthy())

    expect(screen.getByText(/Aina RAKOTO —/).textContent).toContain('8h suivies sur 20h')
  })

  /* Un élève sans forfait propre lisible retombe sur celui de la vague : l'écran ne doit pas
     annoncer « sur 0h », qui ferait croire à un compteur vide. */
  it('retombe sur le forfait de la vague quand l’élève n’en a pas', async () => {
    forfaits = []
    monter()
    await cocher(/Aina RAKOTO/)

    await waitFor(() => expect(screen.getByText(/Aina RAKOTO —/)).toBeTruthy())
    expect(screen.getByText(/Aina RAKOTO —/).textContent).toContain('8h suivies sur 32h')
  })
})
