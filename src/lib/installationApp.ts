/* Installation de HOC sur le téléphone — demande client du 2026-11-23 : « quand un utilisateur
   (admin, professeur et étudiant) arrive dans son espace personnel en UTILISANT son téléphone,
   on doit pouvoir installer l'application HOC sur le téléphone [...] Le bouton installer doit
   s'afficher uniquement lorsque l'utilisateur utilise UNIQUEMENT son téléphone ET lorsqu'il est
   dans son espace personnel. »

   Deux chemins d'installation, parce que les deux familles de téléphones ne fonctionnent pas de
   la même façon :

   - ANDROID / CHROME annonce `beforeinstallprompt` quand il juge l'application installable. On
     retient cet événement pour le déclencher au clic : le navigateur ouvre alors sa propre
     fenêtre d'installation.
   - iOS / SAFARI n'a pas cet événement et n'en aura pas. L'installation y passe par le menu
     Partager, geste que personne ne devine : on montre donc la marche à suivre.

   L'événement arrive souvent AVANT que React n'ait fini de monter. On l'écoute dès le
   chargement du module, et on garde la dernière occurrence de côté — un composant qui
   s'abonnerait plus tard l'aurait manquée. */

/* Pas dans la bibliothèque standard de TypeScript : l'événement n'est pas normalisé, seuls les
   navigateurs Chromium l'émettent. */
interface EvenementInstallation extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let evenementRetenu: EvenementInstallation | null = null
const abonnes = new Set<() => void>()

function prevenirLesAbonnes() {
  for (const abonne of abonnes) abonne()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (evenement) => {
    /* Sans cela, Chrome affiche sa propre bannière, à l'endroit et au moment qu'il choisit. Le
       client veut un bouton, dans l'espace personnel : on reprend la main. */
    evenement.preventDefault()
    evenementRetenu = evenement as EvenementInstallation
    prevenirLesAbonnes()
  })

  /* Installée depuis notre bouton ou depuis le menu du navigateur : dans les deux cas l'offre
     n'a plus lieu d'être. */
  window.addEventListener('appinstalled', () => {
    evenementRetenu = null
    prevenirLesAbonnes()
  })
}

/** Un téléphone, et pas un ordinateur à écran tactile ni une tablette.
 *
 *  Trois conditions réunies, car aucune ne suffit seule : un portable tactile satisfait
 *  `pointer: coarse`, une fenêtre de navigateur réduite satisfait la largeur, et un simulateur
 *  satisfait l'agent utilisateur. */
export function estUnTelephone(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  const pointeurGrossier = window.matchMedia('(pointer: coarse)').matches
  const sansSurvol = window.matchMedia('(hover: none)').matches
  /* 820 px : au-dessus commencent les tablettes, que la demande n'inclut pas. On mesure le côté
     le plus COURT pour qu'un téléphone tenu à l'horizontale reste un téléphone. */
  const petitEcran = Math.min(window.innerWidth, window.innerHeight) <= 820
  return pointeurGrossier && sansSurvol && petitEcran
}

/** L'application tourne-t-elle déjà comme une application installée ? */
export function dejaInstallee(): boolean {
  if (typeof window === 'undefined') return false
  const enMode = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  // Safari iOS ne connaît pas `display-mode` et expose ce drapeau à la place.
  const safariIOS = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return enMode || safariIOS
}

/** Safari sur iPhone, où l'installation passe obligatoirement par le menu Partager. */
export function estSafariIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iPhone|iPod/.test(ua) || (/iPad/.test(ua) && 'ontouchend' in document)
  // Chrome et Firefox sur iOS embarquent le moteur de Safari mais pas son menu d'installation.
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return iOS && safari
}

/** L'invite d'installation est-elle disponible maintenant ? */
export function invitationDisponible(): boolean {
  return evenementRetenu !== null
}

/** Prévient à chaque changement de disponibilité. Rend la fonction de désabonnement. */
export function surChangementInvitation(abonne: () => void): () => void {
  abonnes.add(abonne)
  return () => abonnes.delete(abonne)
}

/**
 * Ouvre la fenêtre d'installation du navigateur.
 *
 * Rend `true` si l'utilisateur a accepté. L'événement retenu n'est utilisable QU'UNE FOIS : on
 * l'oublie quoi qu'il arrive, sans quoi un second clic échouerait silencieusement.
 */
export async function proposerInstallation(): Promise<boolean> {
  const evenement = evenementRetenu
  if (!evenement) return false
  evenementRetenu = null
  prevenirLesAbonnes()
  try {
    await evenement.prompt()
    const { outcome } = await evenement.userChoice
    return outcome === 'accepted'
  } catch {
    /* Fenêtre refusée par le navigateur (déjà ouverte ailleurs, geste jugé non utilisateur) :
       rien à signaler, l'offre reparaîtra au prochain `beforeinstallprompt`. */
    return false
  }
}

/**
 * Enregistre l'agent de service, sans lequel aucun navigateur ne juge l'application
 * installable. Il ne met rien en cache — voir public/sw.js pour la raison.
 *
 * Échoue en silence : un agent refusé (navigation privée, réglage d'entreprise) ne doit priver
 * personne de l'application elle-même, seulement de la proposition d'installation.
 */
export function enregistrerAgentDeService(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
