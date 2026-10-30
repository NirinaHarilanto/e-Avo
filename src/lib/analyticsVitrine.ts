/* Google Analytics 4 — branché le 2026-10-30 à la demande du client (brief SEO, point 3 :
   « pouvoir suivre les visites, les recherches Google et les demandes de réservation »).
   Identifiant de mesure fourni par le client, propriété de son propre compte Google (même
   exigence que Search Console : HOC garde la maîtrise, voir src/lib/seoVitrine.ts).

   SCOPE DÉLIBÉRÉMENT ÉTROIT. Chargé uniquement sur les PAGES PUBLIQUES (les neuf de
   `PAGES_VITRINE`, plus `/e/:slug` qui affiche la même vitrine sous l'identifiant de
   l'établissement) — jamais sur `/connexion`, et jamais dans les espaces admin, professeur ou
   élève. Le brief ne demande de suivre que le site public, pas l'usage de la plateforme par des
   comptes déjà authentifiés, et c'est aussi la lecture la plus respectueuse : rien ne justifie
   de suivre un professeur qui consulte son planning. Si l'utilisateur ne visite jamais de page
   publique dans la session (lien direct vers `/admin/...`), le script ne se charge jamais du
   tout.

   AUCUN SCRIPT INLINE. `window.dataLayer`/`gtag` sont définis ici, dans le bundle de
   l'application lui-même (servi depuis 'self') — la Content-Security-Policy du site
   (vercel.json) n'autorise que `script-src 'self' https://www.googletagmanager.com`, sans
   `'unsafe-inline'` : l'ajouter aurait affaibli la protection contre l'injection de script pour
   TOUTE l'application, bien au-delà de ce que demande Analytics. Le script externe de Google est
   injecté dynamiquement (`document.createElement('script')`), ce que `script-src` autorise déjà
   pour son domaine. */

export const ID_MESURE_GA4 = 'G-RGTVK45WFE'

/* Les neuf adresses publiques (mêmes que `PAGES_VITRINE`, src/lib/seoVitrine.ts — pas réimporté
   directement pour ne pas coupler ce module, chargé au premier rendu du navigateur, à celui
   utilisé par la configuration de build sous Node) et `/e/:slug`, qui affiche la même vitrine
   pour un autre établissement que le slug principal désignerait. */
const PAGES_PUBLIQUES = new Set([
  '/',
  '/cours',
  '/professeurs',
  '/temoignages',
  '/events',
  '/a-propos',
  '/rejoignez-nous',
  '/confidentialite',
  '/conditions-utilisation',
])

export function estPageSuiviAnalytics(pathname: string): boolean {
  return PAGES_PUBLIQUES.has(pathname) || pathname.startsWith('/e/')
}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

let scriptCharge = false

/* Charge gtag.js une seule fois par session de navigation, puis envoie la page vue courante.
   `send_page_view: false` au premier `config` : dans une application à page unique, Google
   compterait sinon deux fois la première page (une fois automatiquement au chargement du script,
   une fois par l'appel explicite ci-dessous) — toutes les pages vues, y compris la première,
   passent par le même chemin, explicite, qui connaît le VRAI chemin React Router plutôt que
   celui lu au tout premier chargement du script. */
export function signalerPageVue(pathname: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (!estPageSuiviAnalytics(pathname)) return

  if (!scriptCharge) {
    scriptCharge = true
    window.dataLayer = window.dataLayer ?? []
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args)
    }
    window.gtag('js', new Date())
    window.gtag('config', ID_MESURE_GA4, { send_page_view: false })

    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${ID_MESURE_GA4}`
    document.head.appendChild(script)
  }

  window.gtag?.('event', 'page_view', {
    page_path: pathname,
    page_location: window.location.href,
    page_title: document.title,
  })
}
