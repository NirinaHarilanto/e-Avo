/* Deux natures de réservation, demande client du 2026-09-23 (point 3, puis étendu au professeur le
   même jour) : une séance de cours crée une vraie `sessions`, dont la clôture retire l'heure du
   forfait de l'élève et la crédite au professeur ; tout le reste crée un `evenements_admin`, qui
   n'a aucun effet sur les compteurs d'heures. Extrait de RendezVousAdmin.tsx pour être partagé avec
   CalendrierProfesseur.tsx : « exactement comme dans l'espace admin » ne doit pas dériver en deux
   définitions qui divergent au fil du temps. */
export type NatureRendezVous = 'seance_cours' | 'autre'

export const NATURES_RENDEZ_VOUS: { valeur: NatureRendezVous; titre: string; detail: string }[] = [
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
