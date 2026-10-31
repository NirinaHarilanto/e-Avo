/// <reference types="node" />
import type { createClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types.js'
import { corpsEnHtml, preparerEmail } from '../../src/lib/templatesEmail.js'
import { envoyerEmail } from './email.js'

type ServiceClient = ReturnType<typeof createClient<Database>>

/**
 * Envoi d'un e-mail à partir d'un modèle enregistré (0091), côté serveur.
 *
 * Même chemin pour l'envoi manuel (l'admin clique « Utiliser ») et pour les six envois
 * AUTOMATIQUES décidés le 2026-10-01 : un seul endroit où le modèle est lu, substitué, mis en HTML
 * et envoyé. Conséquence voulue : quand l'admin corrige un modèle depuis son écran, les envois
 * automatiques utilisent aussitôt le texte corrigé — il n'y a pas une version « de code » et une
 * version « de base » qui divergent.
 *
 * Les constantes de la maison (`email_variables`, 0093 : lien de réservation, Orange Money…) sont
 * injectées d'office et complétées par les valeurs propres au destinataire. Une valeur manquante
 * fait tomber la ligne de liste qui la porte (voir src/lib/templatesEmail.ts) : un envoi
 * automatique ne peut pas partir avec un « {{lien_drive}} » en clair.
 */
export async function envoyerDepuisModele(
  serviceClient: ServiceClient,
  params: {
    etablissementId: string
    /* Référence du document source (« 1.2 », « 4.5 »…), stable même si l'admin renomme le modèle. */
    reference: string
    destinataires: string[]
    copies?: string[]
    valeurs: Record<string, string | null | undefined>
    piecesJointes?: { nom: string; contenuBase64: string }[]
  },
): Promise<{ envoye: boolean; erreur?: string; manquantes?: string[] }> {
  const { data: modele } = await serviceClient
    .from('email_templates')
    .select('objet, corps, actif, piece_jointe_document_id')
    .eq('etablissement_id', params.etablissementId)
    .eq('reference', params.reference)
    .maybeSingle()

  /* Modèle absent ou désactivé : l'admin l'a peut-être supprimé ou mis de côté volontairement.
     On ne le remplace par rien — un e-mail automatique qui part avec un texte de secours que
     personne n'a relu serait pire que pas d'e-mail du tout. L'appelant, lui, continue : aucun
     envoi d'e-mail ne doit faire échouer l'action métier qui l'accompagne (même principe que
     `envoyerEmail`, inerte sans clé Resend). */
  if (!modele || !modele.actif) {
    return { envoye: false, erreur: `Modèle ${params.reference} introuvable ou désactivé.` }
  }

  const constantes = await chargerConstantes(serviceClient, params.etablissementId)
  const prepare = preparerEmail(modele, { ...constantes, ...params.valeurs })

  /* Coordonnées du Profil HOC, ajoutées en pied de TOUS les messages (demande client du
     2026-10-19) : un modèle que l'admin réécrit depuis son écran ne doit pas pouvoir perdre le
     moyen de nous joindre, c'est donc l'envoi qui les pose, pas le texte. */
  const { data: etablissement } = await serviceClient
    .from('etablissements')
    .select('telephone, email')
    .eq('id', params.etablissementId)
    .maybeSingle()

  /* Pièce jointe attachée au MODÈLE (0152) : la procédure HOC pour le modèle 2.1, qui l'annonce
     dans son texte depuis 0091 sans qu'elle ait jamais été jointe. Elle s'ajoute à celles que
     l'appelant fournit déjà, elle ne les remplace pas. */
  const duModele = await pieceJointeDuModele(serviceClient, modele.piece_jointe_document_id)

  return {
    ...(await envoyerEmail({
      destinataire: params.destinataires,
      copies: params.copies,
      sujet: prepare.objet,
      html: corpsEnHtml(prepare.corps),
      piecesJointes: [...(params.piecesJointes ?? []), ...(duModele ? [duModele] : [])],
      contact: etablissement ?? undefined,
    })),
    manquantes: prepare.manquantes,
  }
}

/**
 * Le fichier attaché à un modèle, téléchargé depuis le bucket privé `documents` et encodé en
 * base64 pour Resend.
 *
 * Rend `null` à la moindre difficulté — document supprimé, objet absent du bucket, lecture
 * refusée — plutôt que de lever : le message part alors sans sa pièce jointe. Un envoi
 * silencieusement empêché par un fichier manquant serait pire que le message seul, et
 * l'administration voit tout de suite qu'il manque quelque chose.
 */
export async function pieceJointeDuModele(
  serviceClient: ServiceClient,
  documentId: string | null | undefined,
): Promise<{ nom: string; contenuBase64: string } | null> {
  if (!documentId) return null
  const { data: document } = await serviceClient
    .from('documents')
    .select('nom_original, storage_path')
    .eq('id', documentId)
    .maybeSingle()
  if (!document) return null

  const { data: fichier, error } = await serviceClient.storage.from('documents').download(document.storage_path)
  if (error || !fichier) return null

  const octets = new Uint8Array(await fichier.arrayBuffer())
  /* Encodage par tranches : `String.fromCharCode(...octets)` dépasse la taille maximale d'appel
     de fonction au-delà de quelques dizaines de milliers d'octets, et une procédure PDF en fait
     plus de cent mille. */
  let binaire = ''
  const TRANCHE = 8192
  for (let i = 0; i < octets.length; i += TRANCHE) {
    binaire += String.fromCharCode(...octets.subarray(i, i + TRANCHE))
  }
  return { nom: document.nom_original, contenuBase64: btoa(binaire) }
}

export async function chargerConstantes(
  serviceClient: ServiceClient,
  etablissementId: string,
): Promise<Record<string, string>> {
  const { data } = await serviceClient
    .from('email_variables')
    .select('cle, valeur')
    .eq('etablissement_id', etablissementId)
  const constantes: Record<string, string> = {}
  for (const v of data ?? []) {
    if (v.valeur?.trim()) constantes[v.cle] = v.valeur.trim()
  }
  return constantes
}

/* Formatage des valeurs injectées dans les modèles : les e-mails partent à des apprenants, pas à
   des développeurs — une date ISO ou un montant brut y seraient illisibles. Fuseau de
   l'établissement, comme partout ailleurs dans l'application (voir src/lib/etablissement.ts). */
export function dateLisible(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Indian/Antananarivo',
  })
}

export function dateHeureLisible(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Indian/Antananarivo',
  })
}

export function montantLisible(montant: number | null | undefined, devise = 'Ar'): string {
  if (montant === null || montant === undefined) return ''
  return `${montant.toLocaleString('fr-FR')} ${devise}`
}
