import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { jourDansFuseauEtablissement } from '../../src/lib/etablissement.js'
import { nomVagueSeul } from '../../src/lib/cohortes.js'
import { dateLisible } from './templatesEmail.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

/* Ce qu'il faut savoir pour composer une relance, rassemblé une seule fois.
 *
 * Extrait des routes d'envoi le 2026-11-21, quand l'administration a demandé à RELIRE le message
 * avant qu'il ne parte (« est-ce que l'on peut un deuxième pop-up sur lequel se trouve le mail à
 * envoyer au prospect et éventuellement possibilité de modifier le contenu »). L'aperçu et
 * l'envoi doivent alors produire exactement le même texte : les laisser rassembler leurs valeurs
 * chacun de leur côté, c'est garantir qu'ils finiront par diverger, et qu'on affichera un message
 * tout en en envoyant un autre.
 */

export type MotifProspect = 'forfait_a_choisir' | 'absence_diagnostic' | 'paiement_a_regler'

export const MOTIFS_PROSPECT: MotifProspect[] = ['forfait_a_choisir', 'absence_diagnostic', 'paiement_a_regler']

export const REFERENCE_MODELE: Record<MotifProspect, string> = {
  forfait_a_choisir: '1.2',
  absence_diagnostic: '1.3',
  /* Ajouté le 2026-10-19 (migration 0133) : le prospect a passé son diagnostic ET choisi sa
     formule, il ne manque que le règlement pour qu'il devienne étudiant. Le modèle 1.2 ne
     convenait plus à ce stade — il explique les chemins possibles à quelqu'un qui n'a encore rien
     tranché, alors qu'ici tout l'est. */
  paiement_a_regler: '1.4',
}

/**
 * Le libellé d'une formule tel qu'il se lit dans un e-mail.
 *
 * Les tarifs de HOC portent déjà leur volume dans leur TITRE — « 50h », « 20h », « 1h » : les
 * dix-huit en base sont ainsi, seuls les trois tarifs collectifs (Beginner, Intermediate,
 * Advanced) n'ont pas d'heures. Recoller le nombre derrière le titre donnait donc
 * « 50h — 50 h » dans le message envoyé au prospect, vu à l'écran le 2026-11-21 en relisant une
 * relance de règlement.
 *
 * Le volume n'est ajouté que lorsqu'il manque vraiment, ce qui laisse la porte ouverte à un
 * tarif futur nommé autrement (« Formule intensive », par exemple) sans réécrire ceci.
 */
export function libelleFormule(tarif: { titre: string; heures: number | null }): string {
  const titre = tarif.titre.trim()
  if (!tarif.heures) return titre
  const dejaDitDansLeTitre = new RegExp(`(^|[^0-9])${tarif.heures}\\s*h`, 'i').test(titre)
  return dejaDitDansLeTitre ? titre : `${titre} — ${tarif.heures} h`
}

export interface ContexteRelance {
  /* Le destinataire, pour l'afficher à l'écran avant l'envoi — relire un message sans savoir à
     qui il part ne protège qu'à moitié. */
  email: string
  reference: string
  valeurs: Record<string, string | undefined>
}

/** Le motif demandé, ramené à une valeur connue. L'ancien appel du pipeline n'en envoyait aucun,
 *  et c'est bien la relance d'origine qu'il visait. */
export function motifProspect(valeur: string | undefined): MotifProspect {
  return MOTIFS_PROSPECT.includes(valeur as MotifProspect) ? (valeur as MotifProspect) : 'forfait_a_choisir'
}

/**
 * Prospect : destinataire, modèle applicable et valeurs à substituer.
 *
 * Rend `null` si le prospect n'existe pas ou relève d'un autre établissement — l'appelant répond
 * alors 404, comme avant.
 */
export async function contexteRelanceProspect(
  serviceClient: ServiceClient,
  etablissementId: string,
  prospectId: string,
  motif: MotifProspect,
): Promise<(ContexteRelance & { prospectId: string }) | null> {
  const { data: prospect } = await serviceClient
    .from('prospects')
    .select('id, etablissement_id, prenom, email, statut, type_programme, tarif_choisi_id')
    .eq('id', prospectId)
    .maybeSingle()
  if (!prospect || prospect.etablissement_id !== etablissementId) return null

  /* La prochaine vague alimente les variables de la partie collectif ; si aucune n'est
     programmée, les lignes concernées tombent d'elles-mêmes (voir preparerEmail). */
  const { data: prochaineVague } = await serviceClient
    .from('cohorts')
    .select('nom, date_debut, date_fin')
    .eq('etablissement_id', etablissementId)
    .gte('date_fin', jourDansFuseauEtablissement())
    .order('date_debut')
    .limit(1)
    .maybeSingle()

  /* Formule retenue et somme attendue, pour la relance de règlement (1.4) : le message doit
     rappeler précisément ce que la personne a choisi, sinon « réglez vos frais » ne lui dit pas
     de quoi il s'agit. */
  const { data: tarifChoisi } = prospect.tarif_choisi_id
    ? await serviceClient.from('tarifs').select('titre, prix, unite, heures').eq('id', prospect.tarif_choisi_id).maybeSingle()
    : { data: null }

  return {
    prospectId: prospect.id,
    email: prospect.email,
    reference: REFERENCE_MODELE[motif],
    valeurs: {
      prenom: prospect.prenom,
      /* Les modèles écrivent déjà le mot autour de la variable (« la vague {{numero_vague}}
         démarre le… », migration 0091) : y injecter « Vague Novembre » tel qu'il est nommé en
         base donnerait « la vague Vague Novembre démarre ». */
      numero_vague: nomVagueSeul(prochaineVague?.nom) || undefined,
      date_debut_vague: dateLisible(prochaineVague?.date_debut),
      date_fin_vague: dateLisible(prochaineVague?.date_fin),
      formule_choisie: tarifChoisi ? libelleFormule(tarifChoisi) : undefined,
      montant_a_regler: tarifChoisi?.prix ? `${Number(tarifChoisi.prix).toLocaleString('fr-FR')} ${tarifChoisi.unite || 'Ar'}` : undefined,
    },
  }
}

/**
 * Étudiant en pause : modèle « 4.7 Reprise après une pause » (0130).
 *
 * Rend `null` si l'élève est introuvable ou d'un autre établissement, et une `erreur` lisible
 * s'il n'a pas d'adresse — le distinguer importe, l'appelant répond 404 dans un cas et 400 dans
 * l'autre.
 */
export async function contexteRelanceEtudiant(
  serviceClient: ServiceClient,
  etablissementId: string,
  studentId: string,
): Promise<{ contexte: (ContexteRelance & { studentId: string }) | null; erreur?: string }> {
  const { data: eleve } = await serviceClient
    .from('profiles')
    .select('id, role, etablissement_id, prenom, email, status')
    .eq('id', studentId)
    .maybeSingle()
  if (!eleve || eleve.etablissement_id !== etablissementId || eleve.role !== 'etudiant') return { contexte: null }
  if (!eleve.email) return { contexte: null, erreur: "Cet étudiant n'a pas d'adresse e-mail enregistrée." }

  return {
    contexte: { studentId: eleve.id, email: eleve.email, reference: '4.7', valeurs: { prenom: eleve.prenom ?? undefined } },
  }
}
