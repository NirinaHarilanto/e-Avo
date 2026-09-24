import type { Database } from '../types/database.types'
import { nomGroupeDuo } from './duo'
import { LABEL_NIVEAU_CLASSE } from './classesCollectif'

type Profile = Database['public']['Tables']['profiles']['Row']
type Cohort = Database['public']['Tables']['cohorts']['Row']
type CohortClass = Database['public']['Tables']['cohort_classes']['Row']

export interface PersonneSelectionnable {
  id: string
  nom: string | null
  prenom: string | null
  /* Étiquette facultative affichée à côté du nom dans la liste de suggestions (ex. « Étudiant »,
     « Professeur ») — purement indicative, aucune logique n'en dépend. */
  role?: string
  /* Partenaire DUO de cette personne (demande client du 2026-09-23) : quand elle est choisie, le
     champ propose d'ajouter son binôme au lieu de laisser l'utilisateur se souvenir tout seul
     qu'un duo se convoque à deux. La proposition reste une proposition — certains rendez-vous ne
     concernent qu'un des deux membres. */
  binomeId?: string
  /* Entrée « groupe » (une vague collectif) : la choisir revient à choisir tous ses membres. */
  membres?: string[]
}

/* `duo_partenaire_id` n'est renseigné que d'un côté — le secondaire pointe vers le principal
   (0054). Pour proposer le binôme quel que soit le membre choisi, il faut donc reconstruire le
   lien dans les deux sens. */
export function binomesParEtudiant(etudiants: Profile[]): Map<string, string> {
  const binomes = new Map<string, string>()
  for (const etudiant of etudiants) {
    const partenaireId = etudiant.duo_partenaire_id
    if (!partenaireId) continue
    binomes.set(etudiant.id, partenaireId)
    binomes.set(partenaireId, etudiant.id)
  }
  return binomes
}

export function etudiantsSelectionnables(etudiants: Profile[], role = 'Étudiant'): PersonneSelectionnable[] {
  const binomes = binomesParEtudiant(etudiants)
  return etudiants.map((e) => ({ ...e, role, binomeId: binomes.get(e.id) }))
}

/* Une vague se présente comme une personne de plus dans le même champ de recherche : on tape son
   nom, on la choisit, et tous ses inscrits deviennent des pastilles individuelles (demande
   client du 2026-09-23, point 11). Une vague sans inscrit n'est pas proposée — la choisir
   n'ajouterait personne. */
export function vaguesSelectionnables(vagues: { cohorte: Cohort; membreIds: string[] }[]): PersonneSelectionnable[] {
  return vagues
    .filter((v) => v.membreIds.length > 0)
    .map(({ cohorte, membreIds }) => ({
      id: `vague:${cohorte.id}`,
      prenom: cohorte.nom,
      nom: null,
      role: `Vague · ${membreIds.length} élève${membreIds.length > 1 ? 's' : ''}`,
      membres: membreIds,
    }))
}

/* Une classe de niveau (0074) se présente elle aussi comme une personne de plus dans le champ de
   recherche, même principe que `vaguesSelectionnables` : on tape le niveau ou le nom de la
   promotion, on la choisit, et tous ses inscrits deviennent des pastilles individuelles. Une
   classe sans inscrit n'est pas proposée. */
export function classesSelectionnables(classes: { classe: CohortClass; cohorte: Cohort | null; membreIds: string[] }[]): PersonneSelectionnable[] {
  return classes
    .filter((c) => c.membreIds.length > 0)
    .map(({ classe, cohorte, membreIds }) => ({
      id: `classe:${classe.id}`,
      prenom: `${LABEL_NIVEAU_CLASSE[classe.niveau]}${classe.nom ? ` — ${classe.nom}` : ''}`,
      nom: cohorte ? `· ${cohorte.nom}` : null,
      role: `Classe · ${membreIds.length} élève${membreIds.length > 1 ? 's' : ''}`,
      membres: membreIds,
    }))
}

/* Libellé d'un binôme dans une liste où les deux membres doivent tenir sur une ligne. */
export function libelleBinome(a: Profile, b: Profile | null | undefined): string {
  if (!b) return `${a.prenom ?? ''} ${a.nom ?? ''}`.trim()
  return nomGroupeDuo(null, a.prenom ?? '', b.prenom ?? '')
}
