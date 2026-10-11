import { supabase } from './supabaseClient'

/* Signalement des erreurs survenues chez l'utilisateur (table `journal_erreurs`, migration 0121).
   Jusqu'ici l'application n'en capturait aucune : un plantage de rendu laissait une page blanche
   sans la moindre trace, et le blocage « Chargement… » après inactivité n'a été connu que parce
   que le client l'a signalé lui-même.

   Trois règles tiennent tout ce fichier, et chacune existe pour une raison précise :

   1. Ne JAMAIS relancer. Signaler une erreur est un geste de diagnostic, pas une fonctionnalité :
      si l'envoi échoue (réseau coupé, RLS, session expirée), on abandonne en silence. Une erreur
      levée ici serait captée par les gestionnaires globaux… qui rappelleraient cette fonction.
   2. Plafonner. Une boucle de rendu fautive peut lever des centaines d'erreurs par seconde ; sans
      plafond, le poste de l'utilisateur inonderait la base avec la même ligne.
   3. Dédupliquer. Le même message répété n'apprend rien de plus que le premier. */

const MAX_PAR_SESSION = 20
const FENETRE_DOUBLON_MS = 60_000

let envoyees = 0
const dernierEnvoiParMessage = new Map<string, number>()

/* Les piles d'appel minifiées sont longues et se répètent ; seules les premières lignes situent
   l'erreur. Tronqué aussi pour ne pas transformer le journal en dépotoir. */
function tronquer(valeur: string | undefined, max: number): string | null {
  if (!valeur) return null
  return valeur.length > max ? `${valeur.slice(0, max)}…` : valeur
}

export type SourceErreur = 'rendu' | 'promesse' | 'navigateur'

export async function signalerErreur(source: SourceErreur, erreur: unknown, pileComposant?: string): Promise<void> {
  try {
    if (envoyees >= MAX_PAR_SESSION) return

    const message = erreur instanceof Error ? erreur.message : String(erreur)
    if (!message) return

    const maintenant = Date.now()
    const dernier = dernierEnvoiParMessage.get(message)
    if (dernier && maintenant - dernier < FENETRE_DOUBLON_MS) return
    dernierEnvoiParMessage.set(message, maintenant)

    /* `getSession()` est lu depuis le stockage local, sans appel réseau — mais il peut rejeter
       (verrou `navigator.locks`, voir useAuth.ts). D'où le try/catch global : un journal
       d'erreurs qui échoue doit disparaître sans bruit, jamais aggraver la situation. */
    const { data } = await supabase.auth.getSession()
    const utilisateurId = data.session?.user.id ?? null
    if (!utilisateurId) return // Anonyme : la policy d'insertion exige une session.

    const { data: profil } = await supabase
      .from('profiles')
      .select('etablissement_id')
      .eq('id', utilisateurId)
      .single()
    if (!profil?.etablissement_id) return

    envoyees += 1
    await supabase.from('journal_erreurs').insert({
      etablissement_id: profil.etablissement_id,
      profile_id: utilisateurId,
      source,
      message: tronquer(message, 500) ?? 'Erreur sans message',
      // La pile du composant React situe bien mieux un plantage de rendu que la pile JS minifiée.
      pile: tronquer(pileComposant ?? (erreur instanceof Error ? erreur.stack : undefined), 2000),
      chemin: tronquer(window.location.pathname, 200),
      navigateur: tronquer(navigator.userAgent, 300),
    })
  } catch {
    /* Silence volontaire — voir la règle 1 ci-dessus. */
  }
}

/* Erreurs qui ne passent par aucun composant React : promesse rejetée sans `catch`, erreur de
   script. Posés une seule fois, au démarrage (main.tsx). */
export function installerCaptureErreurs(): void {
  window.addEventListener('unhandledrejection', (evenement) => {
    void signalerErreur('promesse', evenement.reason)
  })
  window.addEventListener('error', (evenement) => {
    void signalerErreur('navigateur', evenement.error ?? evenement.message)
  })
}
