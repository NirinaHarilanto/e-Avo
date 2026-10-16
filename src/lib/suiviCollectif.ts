/* Suivi du parcours collectif — demande client du 2026-10-11 : « dans l'espace admin, section
   cours collectifs, on devrait avoir un monitoring de tous les prospects et étudiants liés au
   cours collectif avec leurs status d'étapes où ils en sont et les détails les concernant
   (Prospect ou déjà étudiant, inscrit à quelle session orale, pour quelle vague, quelle classe,
   quel niveau d'anglais via le test de positionnement, quel niveau d'anglais final attribué par
   l'admin) ».

   L'information est éclatée sur six tables, reliées de deux manières différentes selon l'étape :
   un CANDIDAT n'existe que comme `prospects` + son inscription au test, tandis qu'un ÉTUDIANT a
   en plus un `profiles` et une inscription à la vague (`cohort_enrollments`). Le pont entre les
   deux mondes est `profiles.prospect_id`, posé à la conversion.

   D'où l'assemblage ici, en fonction pure : aucune requête, aucune horloge, des tableaux bruts en
   entrée et une ligne par personne en sortie — testable sans base, comme classesCollectif.ts. */

import { categorieDepuisNiveauEstime, LABEL_NIVEAU_CLASSE } from './classesCollectif.js'
import type { NiveauClasse, ProspectStatut } from '../types/database.types.js'

export interface ProspectSuivi {
  id: string
  prenom: string | null
  nom: string | null
  email: string | null
  statut: ProspectStatut
  type_programme: string | null
}

export interface InscriptionSuivi {
  prospect_id: string
  creneau_id: string
  niveau_estime: string | null
  niveau_final: string | null
  score: number
  total: number
  created_at: string
}

export interface CreneauSuivi {
  id: string
  debut: string
  cohort_id: string
}

export interface ProfilSuivi {
  id: string
  prospect_id: string | null
  prenom: string | null
  nom: string | null
  email: string | null
  /* `'suspended'` : compte supprimé par l'admin (api/admin/supprimer-utilisateur.ts) — un
     soft-delete qui laisse la ligne `profiles` en place (l'historique financier en a besoin) mais
     retire la personne de toute liste active, dans toute l'application (`useEtudiants()` filtre
     déjà sur ce même statut). Le suivi doit obéir à la même règle. */
  status: string
}

export interface InscriptionVagueSuivi {
  student_id: string
  cohort_id: string
  cohort_class_id: string | null
}

export interface ClasseSuivi {
  id: string
  nom: string | null
  niveau: NiveauClasse
}

export interface PaiementSuivi {
  prospect_id: string | null
  student_id: string | null
  montant: number | string
  montant_regle: number | string
}

export interface LigneSuiviCollectif {
  /* L'identifiant du prospect : stable avant ET après la conversion, contrairement au profil qui
     n'existe qu'ensuite. */
  prospectId: string
  profilId: string | null
  nom: string
  email: string | null
  etape: ProspectStatut
  /* Début de la session de test oral à laquelle la personne s'est inscrite, ISO. */
  sessionOrale: string | null
  vagueId: string | null
  /* Classe effectivement rejointe — connue seulement une fois l'élève converti ET affecté. */
  classe: string | null
  niveauTest: string | null
  niveauFinal: string | null
  /* Ce que les frais d'inscription ont donné : rien enregistré, attendu, ou réglé. */
  frais: 'aucun' | 'attendu' | 'regle'
  montantFrais: number
}

export const LIBELLE_ETAPE_COLLECTIF: Record<ProspectStatut, string> = {
  prospect: 'Prospect',
  diagnostic_planifie: 'Test oral planifié',
  diagnostic_fait: 'Test oral passé',
  etudiant: 'Étudiant',
}

/* Ordre du parcours, pour trier la colonne « Étape » du tableau de suivi dans son sens naturel
   (candidature → étudiant) plutôt que l'ordre alphabétique de son libellé, qui le mélangerait. */
const ORDRE_ETAPE_COLLECTIF: ProspectStatut[] = ['prospect', 'diagnostic_planifie', 'diagnostic_fait', 'etudiant']

export function rangEtapeCollectif(etape: ProspectStatut): number {
  return ORDRE_ETAPE_COLLECTIF.indexOf(etape)
}

/* Ordre du moins réglé au plus réglé — trier dessus fait remonter en premier ce qui mérite
   l'attention de l'admin : aucune ligne de frais avant un montant encore attendu, lui-même avant
   un montant déjà soldé. */
const ORDRE_FRAIS: LigneSuiviCollectif['frais'][] = ['aucun', 'attendu', 'regle']

export function rangFrais(frais: LigneSuiviCollectif['frais']): number {
  return ORDRE_FRAIS.indexOf(frais)
}

function nomComplet(prenom: string | null, nom: string | null): string {
  return `${prenom ?? ''} ${nom ?? ''}`.trim() || 'Sans nom'
}

/* `prospects.statut` ne revient jamais en arrière à la suppression d'un compte étudiant — voir
 * supprimer-utilisateur.ts, qui le documente explicitement : la ligne `prospects` sert aussi de
 * clé stable pour l'historique, donc `statut === 'etudiant'` reste vrai pour toujours, même une
 * fois le compte supprimé. Lire ce champ seul pour décider si quelqu'un est ENCORE étudiant est
 * donc toujours faux dans ce cas précis — capture client du 2026-10-11 pour ce même écran
 * (construireSuiviCollectif plus bas), puis à nouveau le 2026-10-16 pour l'onglet « Session orale »
 * (SessionsOraleAdmin.tsx), qui relisait `statut` directement sans passer par ici.
 *
 * Point UNIQUE pour cette distinction, à réutiliser par tout écran qui affiche « converti » /
 * « étudiant » à partir de `prospects.statut` — jamais la refaire au cas par cas, jamais l'oublier
 * non plus. */
export function idsProspectsEtudiantsActifs(
  prospects: { id: string; statut: ProspectStatut }[],
  profils: { prospect_id: string | null; status: string }[],
): Set<string> {
  const prospectIdsAvecProfilActif = new Set(
    profils.filter((p) => p.prospect_id && p.status !== 'suspended').map((p) => p.prospect_id as string),
  )
  return new Set(prospects.filter((p) => p.statut === 'etudiant' && prospectIdsAvecProfilActif.has(p.id)).map((p) => p.id))
}

/* Libellé d'une classe : son nom propre quand elle en a un (« CLASSE 1 »), préfixé de son niveau
   pour rester lisible hors contexte — « Beginner — CLASSE 1 ». */
export function libelleClasse(classe: ClasseSuivi | undefined): string | null {
  if (!classe) return null
  const niveau = LABEL_NIVEAU_CLASSE[classe.niveau]
  return classe.nom ? `${niveau} — ${classe.nom}` : niveau
}

/* Une ligne par personne liée au collectif, de la simple candidature à l'élève affecté.
   Les prospects d'un AUTRE programme sont écartés : un candidat individuel passe parfois par le
   même pipeline, il n'a rien à faire dans le suivi des cours collectifs. */
export function construireSuiviCollectif(donnees: {
  prospects: ProspectSuivi[]
  inscriptions: InscriptionSuivi[]
  creneaux: CreneauSuivi[]
  profils: ProfilSuivi[]
  inscriptionsVagues: InscriptionVagueSuivi[]
  classes: ClasseSuivi[]
  paiements: PaiementSuivi[]
}): LigneSuiviCollectif[] {
  const creneauParId = new Map(donnees.creneaux.map((c) => [c.id, c]))
  const classeParId = new Map(donnees.classes.map((c) => [c.id, c]))
  /* Un profil suspendu (compte supprimé) est exclu de cette table comme s'il n'existait pas :
     c'est à la fois ce qui fait disparaître un étudiant supprimé du suivi (voir le filtre plus
     bas) et ce qui évite de rattacher sa vague/classe/paiements à une ligne qui ne devrait plus
     apparaître. */
  const profilParProspect = new Map(
    donnees.profils.filter((p) => p.prospect_id && p.status !== 'suspended').map((p) => [p.prospect_id as string, p]),
  )
  const vagueParEtudiant = new Map(donnees.inscriptionsVagues.map((i) => [i.student_id, i]))

  /* La plus RÉCENTE inscription au test fait foi : un candidat qui a reporté son oral en a
     plusieurs, et c'est la dernière qui dit où il en est — même règle qu'à la conversion
     (api/admin/convert-prospect.ts). */
  const inscriptionParProspect = new Map<string, InscriptionSuivi>()
  for (const inscription of donnees.inscriptions) {
    const connue = inscriptionParProspect.get(inscription.prospect_id)
    if (!connue || inscription.created_at > connue.created_at) {
      inscriptionParProspect.set(inscription.prospect_id, inscription)
    }
  }

  const idsActifs = idsProspectsEtudiantsActifs(donnees.prospects, donnees.profils)

  return donnees.prospects
    .filter((p) => p.type_programme === 'collectif')
    /* Un candidat converti puis supprimé n'a plus de profil actif en face. Capture client du
       2026-10-11 : « ils devraient être également supprimés [...] des autres sections de toute
       l'application » — exactement ce que fait ce filtre, par cohérence avec `useEtudiants()`
       ailleurs dans l'app. Un prospect qui n'a jamais été converti n'a jamais eu de profil non
       plus : ce filtre ne le concerne pas, seul `statut === 'etudiant'` sans profil actif
       déclenche l'exclusion (voir `idsProspectsEtudiantsActifs` ci-dessus pour le détail). */
    .filter((p) => p.statut !== 'etudiant' || idsActifs.has(p.id))
    .map((prospect) => {
      const inscription = inscriptionParProspect.get(prospect.id)
      const creneau = inscription ? creneauParId.get(inscription.creneau_id) : undefined
      const profil = profilParProspect.get(prospect.id)
      const inscriptionVague = profil ? vagueParEtudiant.get(profil.id) : undefined
      const classe = inscriptionVague?.cohort_class_id ? classeParId.get(inscriptionVague.cohort_class_id) : undefined

      /* Identité résolue en priorité depuis le PROFIL une fois converti : c'est lui que l'admin
         modifie ensuite (panneau Informations personnelles, qui n'écrit jamais dans `prospects`).
         Capture client du 2026-10-11 : un prénom corrigé côté Étudiants restait invisible ici,
         le suivi affichant toujours l'instantané figé pris à la conversion. Repli sur le prospect
         tant qu'aucun profil n'existe encore (candidat pas converti) ou si un champ du profil est
         resté vide. */
      const prenom = profil?.prenom?.trim() || prospect.prenom
      const nom = profil?.nom?.trim() || prospect.nom
      const email = profil?.email?.trim() || prospect.email

      /* Les frais sont rattachés au prospect ET à l'étudiant (voir convert-prospect.ts) : les
         deux clés sont donc interrogées, et une même ligne ne doit être comptée qu'une fois. */
      const lignesFrais = donnees.paiements.filter(
        (p) => p.prospect_id === prospect.id || (profil && p.student_id === profil.id),
      )
      const montantFrais = lignesFrais.reduce((total, p) => total + Number(p.montant), 0)
      const regleFrais = lignesFrais.reduce((total, p) => total + Number(p.montant_regle), 0)

      /* La vague connue vient de l'inscription à la promotion quand l'élève est converti, et
         sinon du créneau de test choisi — qui porte déjà la vague visée. */
      const vagueId = inscriptionVague?.cohort_id ?? creneau?.cohort_id ?? null

      return {
        prospectId: prospect.id,
        profilId: profil?.id ?? null,
        nom: nomComplet(prenom, nom),
        email,
        etape: prospect.statut,
        sessionOrale: creneau?.debut ?? null,
        vagueId,
        classe: libelleClasse(classe),
        niveauTest: inscription?.niveau_estime ?? null,
        niveauFinal: inscription?.niveau_final ?? null,
        frais: lignesFrais.length === 0 ? 'aucun' : regleFrais >= montantFrais && montantFrais > 0 ? 'regle' : 'attendu',
        montantFrais,
      }
    })
}

/* Classe à laquelle la personne SERAIT affectée d'après son niveau, pour les candidats pas encore
   convertis — l'admin voit où ils atterriront avant de les convertir. */
export function classePrevue(ligne: LigneSuiviCollectif): string | null {
  const categorie = categorieDepuisNiveauEstime(ligne.niveauFinal ?? ligne.niveauTest)
  return categorie ? LABEL_NIVEAU_CLASSE[categorie] : null
}
