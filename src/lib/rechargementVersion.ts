/* Reprise après une mise en ligne — incident du 2026-11-08, capture à l'appui : l'écran « Cet
   écran n'a pas pu s'afficher » restait collé, et recharger la page n'y changeait rien. Le
   journal des erreurs (`journal_erreurs`, 0121) a nommé la cause en douze lignes identiques :

     Failed to fetch dynamically imported module:
     https://www.harionlineclub.app/assets/PipelineCRM-BetcFFlC.js   —   /admin/prospects

   Rien de cassé dans le code : chaque écran de l'application est chargé à la demande
   (`lazy(() => import(...))`), et le nom de son fichier contient une empreinte du contenu. Quand
   une version part en ligne, les fichiers de la précédente disparaissent de l'adresse publique.
   Un onglet resté ouvert garde pourtant en mémoire l'ancien index et demande donc, à la première
   navigation, un fichier qui n'existe plus. L'import échoue, React démonte l'écran, et le filet
   de sécurité s'affiche.

   Ce n'est pas un accident rare : cela guette CHAQUE utilisateur ayant un onglet ouvert à CHAQUE
   déploiement. La seule issue est de recharger pour récupérer le nouvel index — ce que ce module
   fait tout seul, au lieu de l'expliquer à quelqu'un qui n'a aucune raison de le deviner. */

/* Horodatage de la dernière tentative automatique. `sessionStorage` et non `localStorage` : la
   reprise concerne cet onglet-ci, pas les autres, et elle doit disparaître avec lui. */
const CLE_TENTATIVE = 'hoc:rechargement-version'

/* Le garde-fou qui empêche la boucle. Si le rechargement ne suffit pas — fichier réellement
   manquant, réseau coupé, cache intermédiaire qui ressert l'ancien index — une seconde tentative
   échouerait pareil, et la troisième aussi : l'utilisateur verrait la page clignoter
   indéfiniment sans jamais lire le message. Passé ce délai, on s'arrête et on explique. */
const DELAI_ENTRE_TENTATIVES_MS = 60_000

/* Messages des navigateurs quand un module chargé à la demande n'arrive pas. Ils diffèrent d'un
   moteur à l'autre, d'où la liste : Chromium, Firefox, Safari, plus l'échec de préchargement que
   Vite signale lui-même. */
const SIGNATURES = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'unable to preload css',
  'failed to load module script',
]

export function estErreurDeChargementDeModule(erreur: unknown): boolean {
  const message = erreur instanceof Error ? erreur.message : String(erreur ?? '')
  const minuscule = message.toLowerCase()
  return SIGNATURES.some((signature) => minuscule.includes(signature))
}

/**
 * Recharge la page pour récupérer la version en ligne, une fois au plus par minute.
 *
 * @returns `true` si un rechargement vient d'être lancé — l'appelant n'a alors rien d'autre à
 * faire ; `false` si on vient déjà d'essayer, auquel cas il faut AFFICHER quelque chose plutôt
 * que de recharger à nouveau.
 */
export function tenterRechargementApresMiseEnLigne(): boolean {
  try {
    const derniere = Number(sessionStorage.getItem(CLE_TENTATIVE) ?? 0)
    if (Number.isFinite(derniere) && Date.now() - derniere < DELAI_ENTRE_TENTATIVES_MS) return false
    sessionStorage.setItem(CLE_TENTATIVE, String(Date.now()))
  } catch {
    /* Stockage refusé (navigation privée, cookies bloqués) : sans mémoire d'une tentative
       précédente, recharger exposerait à la boucle que tout ce module cherche à éviter. On
       préfère afficher le message et laisser la main à l'utilisateur. */
    return false
  }
  window.location.reload()
  return true
}
