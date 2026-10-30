/* Conversion des rendez-vous prospects et événements admin (rendez_vous / evenements_admin) en
   EvenementAgenda affichables. Extrait de RendezVousAdmin.tsx pour être réutilisé partout où
   « l'agenda de l'admin » doit apparaître ailleurs que sur sa propre page — la fenêtre de
   planification d'un appel diagnostic (PlanifierAppelDiagnosticModale) et le filtre multi-
   personnes de Séances & visio (demande client du 2026-09-21). */

import type { RendezVousAvecProspect } from '../hooks/useRendezVous'
import type { EvenementAdminAvecParticipants } from '../hooks/useEvenementsAdmin'
import type { SeanceAdmin } from '../hooks/useSeancesAdmin'
import type { EvenementAgenda } from './agenda'
import type { StatutPrestationExterne, TypePrestationExterne } from '../types/database.types'
import { LIBELLE_TYPE_PRESTATION } from './prestationsExternes'

/* Statut d'une séance qui n'a pas eu lieu comme prévu — demande client du 2026-10-11 : ces
   occurrences doivent disparaître des agendas calendaires (grille hebdomadaire), pas seulement
   s'y griser. Reste un simple prédicat, réutilisé pour FILTRER les listes avant conversion plutôt
   que de retoucher versEvenementSeance/versEvenementAdmin/versEvenementProspect elles-mêmes, qui
   restent correctes et continuent de servir les vues « liste »/historique (ex. la vue globale de
   Séances & visio), où la trace d'une annulation doit au contraire rester visible. */
export function seanceSansEffet(statut: string): boolean {
  return statut === 'annulee' || statut === 'reportee'
}

/* Les identifiants des deux tables sont chacun des UUID indépendants : rien n'empêche qu'ils
   coïncident un jour par hasard. Un préfixe sur l'id de l'EvenementAgenda lève toute ambiguïté
   au moment de rouvrir la bonne fiche au clic, plutôt que de chercher le même id dans les deux
   tableaux. */
export const PREFIXE_PROSPECT = 'rdv:'
export const PREFIXE_EVENEMENT = 'evt:'
/* Agenda Google personnel superposé en lecture seule (0098) — jamais ouvert en pop-up HOC au
   clic, voir estEvenementGooglePersonnel ci-dessous. */
export const PREFIXE_GOOGLE_PERSONNEL = 'gcal:'
/* Séance de cours. Pas de préfixe dans « Séances & visio », où l'id nu est attendu par les écrans
   existants ; il n'est posé que là où les séances cohabitent avec les rendez-vous et les
   événements admin, c'est-à-dire dans l'agenda de l'espace admin. */
export const PREFIXE_SEANCE = 'seance:'

export function estEvenementSeance(id: string | null | undefined): boolean {
  return !!id && id.startsWith(PREFIXE_SEANCE)
}

export function idSeanceDepuisEvenement(id: string): string {
  return id.startsWith(PREFIXE_SEANCE) ? id.slice(PREFIXE_SEANCE.length) : id
}

/* Prestation hors cursus — corporate ou chat & chill (0131). Elle occupe un créneau de l'agenda
   du professeur au même titre qu'une séance, mais ouvre sa propre fiche au clic : elle n'a ni
   élève, ni présence à émarger, ni compte rendu. */
export const PREFIXE_PRESTATION = 'prestation:'

export function estEvenementPrestation(id: string | null | undefined): boolean {
  return !!id && id.startsWith(PREFIXE_PRESTATION)
}

export function idPrestationDepuisEvenement(id: string): string {
  return id.startsWith(PREFIXE_PRESTATION) ? id.slice(PREFIXE_PRESTATION.length) : id
}

/* Une prestation hors cursus dans une grille d'agenda : teal, un ton encore libre dans la
   légende — bleu/or/violet désignent déjà individuel/duo/collectif, et les réutiliser ferait
   passer un cours corporate pour un cours d'élève.

   Remontée ici depuis CalendrierProfesseur.tsx le 2026-10-20 : l'agenda de l'administration
   (Séances & visio) ignorait complètement ces prestations, si bien qu'un cours corporate visible
   dans l'agenda du professeur n'existait nulle part côté admin — « pourquoi les deux agendas ne
   sont pas synchronisés ». Une seule conversion pour les deux écrans, donc une seule façon
   d'afficher la même prestation. */
export function versEvenementPrestation(prestation: {
  id: string
  debut: string
  duree_minutes: number
  client: string
  type: TypePrestationExterne
  statut: StatutPrestationExterne
}): EvenementAgenda {
  return {
    id: `${PREFIXE_PRESTATION}${prestation.id}`,
    debut: prestation.debut,
    dureeMinutes: prestation.duree_minutes,
    titre: prestation.client,
    sousTitre: `${LIBELLE_TYPE_PRESTATION[prestation.type]} · ${prestation.duree_minutes} min`,
    ton: prestation.statut === 'annulee' ? 'neutre' : 'teal',
    attenue: prestation.statut === 'annulee',
    statut: prestation.statut === 'annulee' ? 'Annulée' : prestation.statut === 'terminee' ? 'Terminée' : undefined,
  }
}

/* Couleurs tournantes par professeur, pour qu'une semaine chargée se lise d'un coup d'œil. */
const TONS_PROFESSEUR = ['bleu', 'or', 'teal', 'violet'] as const

export function tonDuProfesseur(professeurIds: string[], id: string | undefined): EvenementAgenda['ton'] {
  const index = id ? professeurIds.indexOf(id) : -1
  return index === -1 ? 'neutre' : TONS_PROFESSEUR[index % TONS_PROFESSEUR.length]
}

/* Séance de cours affichée dans un agenda d'administration.
   Partagée par « Séances & visio » et par « Agenda » depuis le 2026-10-09 : la seconde ne montrait
   que les rendez-vous et les événements admin, jamais les cours — deux pages censées donner la
   même semaine en montraient chacune une moitié. */
export function versEvenementSeance(
  seance: SeanceAdmin,
  nomsEleves: string[],
  professeurIds: string[],
  options: { prefixe?: boolean } = {},
): EvenementAgenda {
  // 'reportee' (0085) traitée comme 'annulee' à l'affichage : dans les deux cas, cette occurrence
  // n'a pas eu lieu comme prévu — le statut exact reste lisible via `statut`.
  const sansEffet = seance.session.statut === 'annulee' || seance.session.statut === 'reportee'
  return {
    id: (options.prefixe ? PREFIXE_SEANCE : '') + seance.session.id,
    debut: seance.session.debut,
    dureeMinutes: seance.session.duree_minutes,
    titre: seance.professeur ? `${seance.professeur.prenom} ${seance.professeur.nom}` : 'Professeur inconnu',
    sousTitre: nomsEleves.join(', ') || 'Aucun élève inscrit',
    ton: sansEffet ? 'neutre' : tonDuProfesseur(professeurIds, seance.professeur?.id),
    attenue: sansEffet,
    statut: seance.session.statut === 'reportee' ? 'Reportée' : seance.session.statut === 'annulee' ? 'Annulée' : undefined,
  }
}

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
    sousTitre: `Appel diagnostic${converti ? ' · Étudiant' : ''}`,
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

/* Tous les rendez-vous prospects et événements admin ACTIFS (utilisés partout où « l'agenda de
   l'admin » doit être visualisé dans son ensemble, y compris la grille de choix de créneau de
   PlanifierAppelDiagnosticModale) — le rendez-vous d'un prospect donné en priorité pour que
   l'appelant puisse le repérer distinctement.
   Un rendez-vous refusé/annulé ou un événement annulé est exclu d'emblée (demande client du
   2026-10-11, « retirer visuellement le rendez-vous des agendas concernés ») : il ne doit plus
   apparaître dans aucune grille calendaire, et un créneau qu'il occupait doit redevenir
   visuellement libre lors de la planification d'un nouveau rendez-vous. */
export function agendaAdminComplet(
  rendezVous: RendezVousAvecProspect[],
  evenementsAdmin: EvenementAdminAvecParticipants[],
): EvenementAgenda[] {
  return [
    ...rendezVous.filter((rdv) => rdv.statut !== 'refuse' && rdv.statut !== 'annule').map(versEvenementProspect),
    ...evenementsAdmin.filter((e) => !e.annule).map(versEvenementAdmin),
  ]
}

/* Événement lu dans un agenda Google et superposé à l'agenda HOC : soit l'agenda personnel de la
   personne connectée (0098, toujours en lecture seule), soit — pour un administrateur qui n'en a
   connecté aucun — celui de l'établissement, qu'il peut alors modifier depuis HOC. */
export interface InviteGoogle {
  email: string
  nom: string | null
  reponse: string
  organisateur: boolean
  optionnel: boolean
}

export interface EvenementGoogle {
  id: string
  titre: string
  debut: string
  fin: string
  description: string | null
  lieu: string | null
  invites: InviteGoogle[]
  organisateur: { email: string; nom: string | null } | null
  rappels: number[]
  recurrence: string | null
  couleur: string | null
  lienGoogle: string | null
  recurrent: boolean
  serieId: string | null
  modifiable: boolean
}

/* Converti au même format que le reste de l'agenda HOC — ton neutre et discret, jamais confondu
   visuellement avec un cours ou un rendez-vous réel de HOC. */
export function versEvenementGooglePersonnel(evenement: EvenementGoogle): EvenementAgenda {
  const dureeMinutes = Math.max(15, (new Date(evenement.fin).getTime() - new Date(evenement.debut).getTime()) / 60_000)
  return {
    id: PREFIXE_GOOGLE_PERSONNEL + evenement.id,
    debut: evenement.debut,
    dureeMinutes,
    titre: evenement.titre,
    sousTitre: 'Agenda Google',
    ton: 'neutre',
    /* L'événement garde la couleur qu'il a dans Google Agenda : c'est par elle que le client
       reconnaît ses catégories d'un coup d'œil, et la perdre reviendrait à aplatir tout son
       agenda sur une seule teinte. */
    couleurFond: evenement.couleur ?? undefined,
  }
}

/* Retire le préfixe ajouté ci-dessus : l'identifiant nu est celui que Google attend. */
export function idGoogleDepuisEvenement(id: string): string {
  return id.startsWith(PREFIXE_GOOGLE_PERSONNEL) ? id.slice(PREFIXE_GOOGLE_PERSONNEL.length) : id
}

export function estEvenementGooglePersonnel(id: string | null | undefined): boolean {
  return !!id && id.startsWith(PREFIXE_GOOGLE_PERSONNEL)
}
