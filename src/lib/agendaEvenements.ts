/* Conversion des rendez-vous prospects et événements admin (rendez_vous / evenements_admin) en
   EvenementAgenda affichables. Extrait de RendezVousAdmin.tsx pour être réutilisé partout où
   « l'agenda de l'admin » doit apparaître ailleurs que sur sa propre page — la fenêtre de
   planification d'un appel diagnostic (PlanifierAppelDiagnosticModale) et le filtre multi-
   personnes de Séances & visio (demande client du 2026-09-21). */

import type { RendezVousAvecProspect } from '../hooks/useRendezVous'
import type { EvenementAdminAvecParticipants } from '../hooks/useEvenementsAdmin'
import type { EvenementAgenda } from './agenda'

/* Les identifiants des deux tables sont chacun des UUID indépendants : rien n'empêche qu'ils
   coïncident un jour par hasard. Un préfixe sur l'id de l'EvenementAgenda lève toute ambiguïté
   au moment de rouvrir la bonne fiche au clic, plutôt que de chercher le même id dans les deux
   tableaux. */
export const PREFIXE_PROSPECT = 'rdv:'
export const PREFIXE_EVENEMENT = 'evt:'
/* Agenda Google personnel superposé en lecture seule (0098) — jamais ouvert en pop-up HOC au
   clic, voir estEvenementGooglePersonnel ci-dessous. */
export const PREFIXE_GOOGLE_PERSONNEL = 'gcal:'

/* Demande client du 2026-09-29 : « quand c'est l'admin qui invite un étudiant ou un professeur,
   il faut mentionner "Admin HOC" dans la liste des participants ». Un label institutionnel
   plutôt que le nom personnel de l'admin qui a cliqué « Créer » — ni le composant d'édition ni
   la personne invitée n'ont besoin de savoir PRÉCISÉMENT lequel des admins de l'établissement
   est à l'origine du rendez-vous. */
export const LIBELLE_ADMIN = 'Admin HOC'

/* Couleur = catégorie de participants, pas statut — demande client du 2026-09-16 : « jaune pour
   les prospects, bleu pour les étudiants, vert pour les professeurs, violet pour mixte étudiants
   et professeurs ». Le statut (à valider / annulé) reste lisible via `attenue` et `marqueur`,
   déjà pris en charge par AgendaHebdo, sans avoir besoin d'une cinquième teinte. */
const LIBELLE_STATUT_RDV: Record<RendezVousAvecProspect['statut'], string> = {
  en_attente: 'À valider',
  confirme: 'Confirmé',
  refuse: 'Refusé',
  annule: 'Annulé',
}

export function versEvenementProspect(rdv: RendezVousAvecProspect): EvenementAgenda {
  const prospect = rdv.prospects
  /* Un prospect converti en étudiant change de catégorie : son rendez-vous passe du jaune (prospect)
     au bleu (étudiant) — demande client du 2026-09-29, « Sandra est passée de prospect à étudiant,
     donc l'agenda devrait se mettre à jour ». Le statut vient de la même requête que le rendez-vous
     (voir useRendezVous), donc de la donnée courante et non d'une copie figée. */
  const converti = prospect?.statut === 'etudiant'
  const nomProspect = prospect ? `${prospect.prenom} ${prospect.nom}` : 'Prospect supprimé'
  return {
    id: PREFIXE_PROSPECT + rdv.id,
    debut: rdv.debut,
    dureeMinutes: rdv.duree_minutes,
    titre: nomProspect,
    sousTitre: `Appel diagnostic${converti ? ' · Étudiant' : ''}${prospect?.langue_visee ? ` · ${prospect.langue_visee}` : ''}`,
    ton: converti ? 'bleu' : 'or',
    attenue: rdv.statut === 'refuse' || rdv.statut === 'annule',
    statut: LIBELLE_STATUT_RDV[rdv.statut],
  }
}

/* La couleur ne dépend pas de la distinction obligatoire/optionnel (une seconde dimension,
   propre à Outlook, qui n'a rien à voir avec la catégorie de participants) — seulement du rôle
   de l'ensemble des personnes conviées, obligatoires et optionnelles confondues. */
export function tousLesParticipants(evenement: EvenementAdminAvecParticipants) {
  return [...evenement.obligatoires, ...evenement.optionnels]
}

export function versEvenementAdmin(evenement: EvenementAdminAvecParticipants): EvenementAgenda {
  const participants = tousLesParticipants(evenement)
  const aDesEtudiants = participants.some((p) => p.role === 'etudiant')
  const aDesProfesseurs = participants.some((p) => p.role === 'professeur')
  // « Admin HOC » en tête dès que l'admin est à l'origine du rendez-vous — voir LIBELLE_ADMIN.
  const noms = [...(evenement.creeParAdmin ? [LIBELLE_ADMIN] : []), ...participants.map((p) => `${p.prenom} ${p.nom}`)].join(', ')
  return {
    id: PREFIXE_EVENEMENT + evenement.id,
    debut: evenement.debut,
    dureeMinutes: evenement.duree_minutes,
    titre: evenement.titre,
    sousTitre: noms || undefined,
    ton: aDesEtudiants && aDesProfesseurs ? 'violet' : aDesProfesseurs ? 'teal' : 'bleu',
    attenue: evenement.annule,
  }
}

export function typeEvenementAdmin(evenement: EvenementAdminAvecParticipants): string {
  const participants = tousLesParticipants(evenement)
  const aDesEtudiants = participants.some((p) => p.role === 'etudiant')
  const aDesProfesseurs = participants.some((p) => p.role === 'professeur')
  if (aDesEtudiants && aDesProfesseurs) return 'Mixte — étudiants et professeurs'
  if (aDesProfesseurs) return 'Professeurs'
  return 'Étudiants'
}

/* Tous les rendez-vous prospects et événements admin actifs (utilisés partout où « l'agenda de
   l'admin » doit être visualisé dans son ensemble) — le rendez-vous d'un prospect donné en
   priorité pour que l'appelant puisse le repérer distinctement. */
export function agendaAdminComplet(
  rendezVous: RendezVousAvecProspect[],
  evenementsAdmin: EvenementAdminAvecParticipants[],
): EvenementAgenda[] {
  return [...rendezVous.map(versEvenementProspect), ...evenementsAdmin.map(versEvenementAdmin)]
}

/* Agenda Google personnel (0098) converti au même format que le reste de l'agenda HOC — ton
   neutre et discret, jamais confondu visuellement avec un cours ou un rendez-vous réel de HOC. */
export function versEvenementGooglePersonnel(evenement: { id: string; titre: string; debut: string; fin: string }): EvenementAgenda {
  const dureeMinutes = Math.max(15, (new Date(evenement.fin).getTime() - new Date(evenement.debut).getTime()) / 60_000)
  return {
    id: PREFIXE_GOOGLE_PERSONNEL + evenement.id,
    debut: evenement.debut,
    dureeMinutes,
    titre: evenement.titre,
    sousTitre: 'Agenda Google personnel',
    ton: 'neutre',
  }
}

export function estEvenementGooglePersonnel(id: string | null | undefined): boolean {
  return !!id && id.startsWith(PREFIXE_GOOGLE_PERSONNEL)
}
