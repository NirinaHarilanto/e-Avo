/* Regroupement des messages d'un envoi groupé — demande client du 2026-10-19, capture à l'appui :
   « quand on envoie un message groupé, il faut que le mail reste groupé, exactement comme
   Outlook, pas explosé visuellement message par message ». Un message envoyé à cinq élèves
   remplissait cinq lignes identiques dans « Envoyés », au point de noyer les autres envois.

   La base, elle, a raison de garder une ligne par destinataire (`messages`, 0090) : c'est ce qui
   donne à chacun son propre état lu/non lu et sa propre réponse. Le regroupement est donc une
   affaire d'AFFICHAGE, pas de schéma — rien à migrer, et les envois déjà en base se regroupent
   aussi, ce qu'une colonne ajoutée aujourd'hui n'aurait pas fait.

   La clé de regroupement est ce qu'un même geste d'envoi produit à l'identique : le même
   expéditeur, le même objet, le même corps, à la même seconde. Deux envois distincts qui
   coïncideraient sur les quatre seraient, de fait, le même message envoyé deux fois. */

export interface MessageGroupable {
  id: string
  expediteur_profile_id: string
  destinataire_profile_id: string
  objet: string
  corps: string
  created_at: string
  lu: boolean
}

export interface EnvoiGroupe<M extends MessageGroupable> {
  /* Le message le plus représentatif du groupe (le premier reçu dans l'ordre d'affichage) :
     porte l'objet, le corps et la date communs. Son `id` sert de clé de liste et d'identifiant
     d'ouverture. */
  principal: M
  /* Toutes les lignes du groupe, une par destinataire — ce sont elles qu'il faut marquer lues ou
     supprimer, jamais la seule ligne principale. */
  messages: M[]
}

function cleEnvoi(m: MessageGroupable): string {
  // La seconde suffit : un envoi groupé écrit ses lignes dans la même transaction.
  return [m.expediteur_profile_id, m.objet, m.corps, m.created_at.slice(0, 19)].join('\u0000')
}

/* Regroupe en préservant l'ordre d'arrivée : la liste est déjà triée par date décroissante, le
   groupe prend donc la place de son message le plus récent. */
export function grouperEnvois<M extends MessageGroupable>(messages: M[]): EnvoiGroupe<M>[] {
  const parCle = new Map<string, EnvoiGroupe<M>>()
  for (const message of messages) {
    const cle = cleEnvoi(message)
    const groupe = parCle.get(cle)
    if (groupe) groupe.messages.push(message)
    else parCle.set(cle, { principal: message, messages: [message] })
  }
  return [...parCle.values()]
}

/* « À Marie, Jean et 3 autres » — l'énumération complète devient illisible au-delà de quelques
   noms, mais le nombre total doit rester lisible d'un coup d'œil. */
export function libelleDestinataires(noms: string[], maximum = 3): string {
  if (noms.length === 0) return 'Personne'
  if (noms.length <= maximum) {
    if (noms.length === 1) return noms[0]
    return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`
  }
  const restants = noms.length - maximum
  return `${noms.slice(0, maximum).join(', ')} et ${restants} autre${restants > 1 ? 's' : ''}`
}
