import { supabase } from './supabaseClient'

/**
 * Jeton d'accès FRAIS, à demander au moment de l'appel API — et non celui figé dans le
 * `ProfileContext`.
 *
 * Le jeton Supabase expire au bout d'une heure. `useAuth` écoute bien `onAuthStateChange` et
 * remplace la session à chaque renouvellement, mais ce renouvellement n'a pas toujours eu lieu
 * quand l'admin clique : un onglet laissé en arrière-plan voit ses minuteurs bridés par le
 * navigateur, et une machine sortie de veille reprend avec un jeton déjà périmé. L'écran envoyait
 * alors l'ancien jeton, que le serveur refusait par un « Jeton invalide. » incompréhensible pour
 * qui vient de cliquer sur un bouton (signalé par le client le 2026-10-31, à la validation d'un
 * TimeSheet).
 *
 * `getSession()` relit la session et la renouvelle elle-même quand elle a expiré (voir
 * `__loadSession` dans @supabase/auth-js) : attendre son résultat avant d'appeler l'API suffit
 * donc à ne plus jamais présenter un jeton périmé. Elle peut en revanche ÉCHOUER — le verrou
 * `navigator.locks` qu'elle prend peut rester coincé après une veille, incident déjà rencontré le
 * 2026-10-11 — d'où le `catch` : on rend alors `null`, et l'appelant invite à se reconnecter
 * plutôt que de laisser partir une requête vouée au 401.
 */
export async function jetonAcces(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

/** Message unique pour le cas « plus de session utilisable », à afficher tel quel à l'écran. */
export const MESSAGE_SESSION_EXPIREE = 'Votre session a expiré. Reconnectez-vous, puis recommencez.'
