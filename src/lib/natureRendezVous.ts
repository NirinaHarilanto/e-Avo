/* Natures de réservation, demande client du 2026-09-23 (point 3, puis étendu au professeur le
   même jour) : une séance de cours crée une vraie `sessions`, dont la clôture retire l'heure du
   forfait de l'élève et la crédite au professeur ; tout le reste crée un `evenements_admin`, qui
   n'a aucun effet sur les compteurs d'heures. Extrait de RendezVousAdmin.tsx pour être partagé avec
   CalendrierProfesseur.tsx : « exactement comme dans l'espace admin » ne doit pas dériver en deux
   définitions qui divergent au fil du temps.

   S'y ajoutent le 2026-10-19 les deux prestations hors cursus — corporate et chat & chill
   (0131) : « dans l'espace professeur, pour chaque séance de cours lors de sa création, il faut
   rajouter les options Cours corporate et cours chat & chill ». Elles créent une
   `prestations_externes` : aucun élève, aucun forfait entamé, mais une heure créditée au
   professeur à la clôture, facturée au taux correspondant de sa fiche.
   Réservées à l'espace professeur : l'agenda de l'administration planifie des rendez-vous
   d'établissement, pas les prestations d'un professeur — celles-ci se créent depuis sa fiche
   (voir PrestationsExternes.tsx) ou depuis son propre agenda. */
export type NatureRendezVous = 'seance_cours' | 'autre' | 'corporate' | 'chat_chill'

export interface DescriptionNature {
  valeur: NatureRendezVous
  titre: string
  detail: string
}

export const NATURES_RENDEZ_VOUS: DescriptionNature[] = [
  {
    valeur: 'seance_cours',
    titre: 'Une séance de cours',
    detail: 'L’heure est déduite du forfait des élèves et comptée au professeur.',
  },
  {
    valeur: 'autre',
    titre: 'Autre',
    detail: 'Réunion, point de suivi, entretien… sans effet sur les forfaits d’heures.',
  },
]

/* Les natures offertes au professeur : les deux ci-dessus, plus ses prestations externes. */
export const NATURES_PROFESSEUR: DescriptionNature[] = [
  ...NATURES_RENDEZ_VOUS,
  {
    valeur: 'corporate',
    titre: 'Un cours corporate',
    detail: 'Prestation pour une entreprise, hors cursus HOC. Facturée à votre taux corporate.',
  },
  {
    valeur: 'chat_chill',
    titre: 'Un cours chat & chill',
    detail: 'Séance de conversation hors cursus HOC. Facturée à votre taux chat & chill.',
  },
]

/* Les deux natures qui créent une prestation externe plutôt qu'une séance ou un événement. */
export function estPrestationExterne(nature: NatureRendezVous): nature is 'corporate' | 'chat_chill' {
  return nature === 'corporate' || nature === 'chat_chill'
}
