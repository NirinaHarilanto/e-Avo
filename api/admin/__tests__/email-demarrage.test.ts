import { describe, expect, it, vi, beforeEach } from 'vitest'

/* Signalé par le client le 2026-11-06 : une élève venant d'être attribuée à une professeure a
   reçu « Nous vous souhaitons un excellent premier cours avec Patricia le vendredi 06 novembre »
   alors qu'aucun cours n'avait encore été planifié entre elles.

   Cause : la requête qui cherche « la prochaine séance » ne filtrait que sur `teacher_id` — elle
   rendait donc la prochaine séance DE LA PROFESSEURE, toutes personnes confondues, et l'annonçait
   à une élève qui n'y est pas inscrite. Confirmé en base : l'élève concernée n'avait aucune
   inscription à une séance, et la date annoncée était celle d'une autre élève de la même
   professeure.

   Ce fichier verrouille la règle : la date annoncée vient d'une séance où l'élève est INSCRITE,
   et d'aucune autre. */

const envoyerDepuisModele = vi.fn(async (..._args: unknown[]) => ({ envoye: true, manquantes: [] as string[] }))

vi.mock('../../_lib/adminAuth.js', () => ({
  requireAdmin: vi.fn(async () => ({ serviceClient: clientFactice(), profileId: 'admin-1', etablissementId: 'etab-1' })),
  AdminAuthError: class AdminAuthError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

vi.mock('../../_lib/templatesEmail.js', async () => {
  const reel = await vi.importActual<typeof import('../../_lib/templatesEmail.js')>('../../_lib/templatesEmail.js')
  return { ...reel, envoyerDepuisModele: (...args: unknown[]) => envoyerDepuisModele(...args) }
})

vi.mock('../../_lib/notifications.js', () => ({ creerNotification: vi.fn(async () => {}) }))

/* Séances existantes, toutes professeures confondues, et les inscriptions de CHAQUE élève. */
let seances: { id: string; debut: string; teacher_id: string; statut: string }[] = []
let inscriptionsParEleve: Record<string, string[]> = {}
let affectations: { teacher_id: string; date_debut: string; date_fin: string | null }[] = []

/* Reproduit le minimum de PostgREST dont la route se sert : des filtres chaînés, puis une
   lecture. Chaque filtre est appliqué réellement — c'est ce qui permet au test de constater
   qu'un filtre MANQUE, ce qu'un bouchon qui renverrait une valeur figée ne verrait jamais. */
function requeteSeances() {
  let lignes = [...seances]
  const builder = {
    select: () => builder,
    in: (colonne: string, valeurs: string[]) => {
      lignes = lignes.filter((s) => valeurs.includes(s[colonne as 'id']))
      return builder
    },
    eq: (colonne: string, valeur: string) => {
      lignes = lignes.filter((s) => String(s[colonne as keyof typeof s]) === valeur)
      return builder
    },
    gte: (colonne: string, valeur: string) => {
      lignes = lignes.filter((s) => String(s[colonne as keyof typeof s]) >= valeur)
      return builder
    },
    order: () => {
      lignes.sort((a, b) => a.debut.localeCompare(b.debut))
      return builder
    },
    limit: () => builder,
    maybeSingle: async () => ({ data: lignes[0] ?? null }),
  }
  return builder
}

function clientFactice() {
  return {
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'eleve-1', prenom: 'Narindra', email: 'narindra@exemple.test', etablissement_id: 'etab-1' },
              }),
            }),
            in: async () => ({
              data: [{ id: 'prof-1', prenom: 'Patricia', nom: 'ANDRIAMIFIDISOA', email: 'patricia@exemple.test' }],
            }),
          }),
        }
      }
      if (table === 'teacher_assignments') {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: affectations }) }) }) }
      }
      if (table === 'cohort_enrollments') {
        return { select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }
      }
      if (table === 'session_enrollments') {
        return {
          select: () => ({
            eq: async (_colonne: string, studentId: string) => ({
              data: (inscriptionsParEleve[studentId] ?? []).map((id) => ({ session_id: id })),
            }),
          }),
        }
      }
      if (table === 'sessions') return requeteSeances()
      if (table === 'packages') {
        return { select: () => ({ eq: async () => ({ data: [{ total_heures: 20 }] }) }) }
      }
      throw new Error('table inattendue dans ce test : ' + table)
    },
  }
}

const { default: handler } = await import('../email-demarrage.js')

function requete() {
  return new Request('https://exemple.test/api/admin/email-demarrage', {
    method: 'POST',
    body: JSON.stringify({ studentId: 'eleve-1', teacherId: 'prof-1' }),
  })
}

function valeursEnvoyees() {
  return (envoyerDepuisModele.mock.calls[0]?.[1] as { reference: string; valeurs: Record<string, string | undefined> }) ?? null
}

beforeEach(() => {
  envoyerDepuisModele.mockClear()
  affectations = [{ teacher_id: 'prof-1', date_debut: '2026-11-05', date_fin: null }]
  inscriptionsParEleve = {}
  seances = []
})

describe('api/admin/email-demarrage — date du premier cours', () => {
  /* Le cas exact signalé : la professeure a des cours avec d'AUTRES élèves, la nouvelle élève
     n'en a aucun. Aucune date ne doit être annoncée. */
  it('n’annonce aucune date quand l’élève n’a encore aucune séance', async () => {
    seances = [{ id: 'seance-autre-eleve', debut: '2026-11-06T09:00:00.000Z', teacher_id: 'prof-1', statut: 'planifiee' }]
    inscriptionsParEleve = { 'eleve-1': [] }

    const reponse = await handler(requete())
    expect(reponse.status).toBe(200)

    const envoi = valeursEnvoyees()
    expect(envoi.reference).toBe('3.1')
    /* Vide, et non une date : `dateLisible` rend la chaîne vide faute de date, et le moteur de
       modèles compte une valeur vide comme MANQUANTE (voir `manquantes` dans
       src/lib/templatesEmail.ts) — la mention disparaît donc du corps au lieu d'annoncer une
       date fausse. */
    expect(envoi.valeurs.date_debut_formation).toBeFalsy()
    expect(envoi.valeurs.heure_premier_cours).toBeFalsy()
  })

  it('annonce la séance de l’élève quand elle en a une', async () => {
    /* Dates calculées à partir de MAINTENANT, et non écrites en dur : la route ne retient que
       les séances encore à venir (`gte('debut', now)`), si bien que des dates fixes finissent
       par tomber dans le passé — ce test est passé au rouge tout seul deux jours après avoir été
       écrit, sans qu'une ligne de code ait bougé. */
    const dans = (jours: number) => new Date(Date.now() + jours * 86_400_000)
    const seanceAutre = dans(2)
    const seanceAElle = dans(6)
    seances = [
      { id: 'seance-autre-eleve', debut: seanceAutre.toISOString(), teacher_id: 'prof-1', statut: 'planifiee' },
      { id: 'seance-a-elle', debut: seanceAElle.toISOString(), teacher_id: 'prof-1', statut: 'planifiee' },
    ]
    inscriptionsParEleve = { 'eleve-1': ['seance-a-elle'] }

    await handler(requete())

    const envoi = valeursEnvoyees()
    /* La SIENNE (la plus LOINTAINE des deux), pas celle de la professeure avec quelqu'un d'autre,
       pourtant plus proche — c'est précisément ce que l'ancienne requête retenait. */
    const attendue = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Indian/Antananarivo', day: 'numeric', month: 'long' }).format(seanceAElle)
    expect(envoi.valeurs.date_debut_formation).toContain(attendue)
  })

  /* Le mail nomme UN professeur : annoncer la séance d'un autre sous son nom serait le même
     défaut à l'envers. */
  it('ignore une séance de l’élève donnée par un autre professeur', async () => {
    seances = [
      { id: 'seance-autre-prof', debut: '2026-11-07T09:00:00.000Z', teacher_id: 'prof-2', statut: 'planifiee' },
      { id: 'seance-bon-prof', debut: '2026-11-12T07:00:00.000Z', teacher_id: 'prof-1', statut: 'planifiee' },
    ]
    inscriptionsParEleve = { 'eleve-1': ['seance-autre-prof', 'seance-bon-prof'] }

    await handler(requete())

    expect(valeursEnvoyees().valeurs.date_debut_formation).toContain('12')
  })

  /* Une séance annulée ou déjà clôturée n'est pas « le premier cours à venir ». */
  it('ne retient qu’une séance encore planifiée', async () => {
    seances = [
      { id: 'seance-annulee', debut: '2026-11-07T09:00:00.000Z', teacher_id: 'prof-1', statut: 'annulee' },
      { id: 'seance-ok', debut: '2026-11-14T07:00:00.000Z', teacher_id: 'prof-1', statut: 'planifiee' },
    ]
    inscriptionsParEleve = { 'eleve-1': ['seance-annulee', 'seance-ok'] }

    await handler(requete())

    expect(valeursEnvoyees().valeurs.date_debut_formation).toContain('14')
  })
})
