import { supabase } from '../lib/supabaseClient'
import { useCacheRequete } from './useCacheRequete'
import { useEtatsParcoursEtudiants } from './useEtatsParcoursEtudiants'
import { LABEL_NIVEAU_CLASSE } from '../lib/classesCollectif'
import type { Database } from '../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

export interface EtudiantForfaitTermine {
  profil: Profile
  cohortId: string
  cohortClassId: string | null
  /* D'où il vient, pour que l'admin reconnaisse l'homonyme et voie qu'il quitte une autre
     promotion : « Vague Novembre · Beginner ». */
  origine: string
}

/* Les élèves qui peuvent REJOINDRE une nouvelle classe — demande client du 2026-10-30 : « il
   devrait être possible de rajouter des étudiants déjà existants dans HOC, à condition que
   l'étudiant ait déjà consommé toutes ses heures de forfait ET que l'étudiant soit déjà inscrit
   en cours collectif ».
   Les deux conditions, dans cet ordre :
     * inscrit en cours collectif = il a une ligne `cohort_enrollments`. C'est la définition
       retenue partout ailleurs (useDossierEtudiant.ts : « pas de colonne dédiée, la présence
       d'une inscription à une cohorte suffit à distinguer les deux cas ») ;
     * forfait entièrement consommé = `forfaitEpuise` de useEtatsParcoursEtudiants, c'est-à-dire
       `forfaitEntierementConsomme` (lib/heures.ts) appliqué aux heures de SA CLASSE sur le
       forfait de sa vague. La même règle est reposée côté serveur par la route de déplacement
       et par la base au changement de vague (0147) : l'écran ne doit pas pouvoir proposer
       quelqu'un que l'un des deux refusera ensuite.
   Un élève suspendu (dossier supprimé) n'y figure jamais. */
export function useEtudiantsForfaitTermine(etablissementId: string | undefined) {
  const { valeur, loading: chargementBase, recharger } = useCacheRequete(
    etablissementId && `etudiants-collectifs-${etablissementId}`,
    async (): Promise<EtudiantForfaitTermine[]> => {
      const { data: inscriptions } = await supabase
        .from('cohort_enrollments')
        .select('student_id, cohort_id, cohort_class_id')
        .order('created_at', { ascending: false })
      if (!inscriptions || inscriptions.length === 0) return []

      /* Une inscription par élève, la plus récente : un élève passé d'une vague à l'autre en a
         historiquement plusieurs, et c'est la dernière qui dit où il en est. */
      const parEleve = new Map<string, (typeof inscriptions)[number]>()
      for (const inscription of inscriptions) {
        if (!parEleve.has(inscription.student_id)) parEleve.set(inscription.student_id, inscription)
      }

      const ids = [...parEleve.keys()]
      const classeIds = [...new Set([...parEleve.values()].map((i) => i.cohort_class_id).filter((id): id is string => !!id))]
      const [{ data: profils }, { data: vagues }, { data: classes }] = await Promise.all([
        supabase.from('profiles').select('*').in('id', ids).eq('role', 'etudiant').neq('status', 'suspended'),
        supabase.from('cohorts').select('id, nom'),
        classeIds.length > 0
          ? supabase.from('cohort_classes').select('id, niveau, nom').in('id', classeIds)
          : Promise.resolve({ data: [] as { id: string; niveau: Database['public']['Tables']['cohort_classes']['Row']['niveau']; nom: string | null }[] }),
      ])

      const nomVague = new Map((vagues ?? []).map((v) => [v.id, v.nom]))
      const classeParId = new Map((classes ?? []).map((c) => [c.id, c]))

      return (profils ?? []).map((profil) => {
        const inscription = parEleve.get(profil.id)!
        const classe = inscription.cohort_class_id ? classeParId.get(inscription.cohort_class_id) : null
        const morceaux = [
          nomVague.get(inscription.cohort_id) ?? 'Promotion inconnue',
          classe ? `${LABEL_NIVEAU_CLASSE[classe.niveau]}${classe.nom ? ` — ${classe.nom}` : ''}` : null,
        ].filter(Boolean)
        return {
          profil,
          cohortId: inscription.cohort_id,
          cohortClassId: inscription.cohort_class_id,
          origine: morceaux.join(' · '),
        }
      })
    },
  )

  const tous = valeur ?? []
  const { etats, loading: chargementEtats } = useEtatsParcoursEtudiants(tous.map((e) => e.profil.id))
  const eligibles = tous.filter((e) => etats[e.profil.id]?.forfaitEpuise)

  return { eligibles, loading: chargementBase || chargementEtats, recharger }
}
