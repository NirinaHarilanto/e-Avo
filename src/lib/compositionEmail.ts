/* Ouverture d'un message préparé dans la messagerie de l'administration, plutôt qu'un envoi
   automatique par Resend — demande client du 2026-10-11, pour les modèles d'e-mail de l'espace
   admin UNIQUEMENT (les e-mails transactionnels : mot de passe oublié, confirmations de
   rendez-vous, relances automatiques… continuent de partir par Resend, voir api/_lib/email.ts).

   Ce que ça change : l'application ne POSTE plus le message, elle le PRÉPARE. L'admin le relit
   dans Gmail et c'est lui qui clique « Envoyer ». Le message part donc réellement de la boîte de
   l'établissement, avec son historique de conversation et ses réponses au même endroit.

   Trois conséquences assumées, inhérentes au procédé et non contournables par du code :
   - aucune pièce jointe ne peut être pré-attachée (les navigateurs l'interdisent pour toute URL,
     `mailto:` comprise) : l'admin la joint lui-même dans Gmail ;
   - le corps est du TEXTE BRUT — ce qui tombe bien, les modèles sont déjà écrits ainsi
     (intertitres en majuscules, listes à tirets, signature) et se lisent tels quels ;
   - l'application ne peut pas savoir si l'admin a effectivement cliqué « Envoyer » : le journal
     retient « préparé », jamais « envoyé » (voir le statut `prepare`, migration 0117). */

/* Au-delà, le navigateur ou Gmail peut refuser l'URL — Chrome accepte environ 32 000 caractères,
   mais les proxys et les autres navigateurs sont moins généreux. Seuil prudent : les modèles les
   plus longs de l'application font ~1 700 caractères, soit ~4 500 une fois encodés, on garde donc
   une marge confortable tout en attrapant un corps collé démesurément long. */
export const LONGUEUR_MAX_LIEN = 8000

export interface MessagePrepare {
  /* Compte Gmail depuis lequel composer : `authuser` vise ce compte précis quand plusieurs
     sessions Google sont ouvertes dans le navigateur, au lieu de tomber sur la première venue. */
  expediteur: string
  destinataires: string[]
  copies?: string[]
  objet: string
  corps: string
}

/**
 * Lien d'ouverture d'un brouillon dans l'interface web de Gmail.
 *
 * `view=cm` ouvre le composeur, `fs=1` en plein écran. Tout est encodé par `URLSearchParams`, qui
 * gère les accents, les sauts de ligne et les caractères réservés — un `encodeURIComponent`
 * manuel oublierait l'un ou l'autre et couperait le message en silence.
 */
export function lienCompositionGmail(message: MessagePrepare): string {
  const parametres = new URLSearchParams({
    view: 'cm',
    fs: '1',
    authuser: message.expediteur,
    to: message.destinataires.join(','),
    su: message.objet,
    body: message.corps,
  })
  /* Ajouté seulement s'il y a des copies : un `cc=` vide fait afficher à Gmail un champ Cc ouvert
     et vide, que l'admin doit refermer à la main. */
  if (message.copies && message.copies.length > 0) {
    parametres.set('cc', message.copies.join(','))
  }
  return `https://mail.google.com/mail/?${parametres.toString()}`
}
