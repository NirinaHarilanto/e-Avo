/* Extension `.js` à l'import : ce module est désormais partagé avec les fonctions serveur
   (api/_lib/google.ts), compilées en `module: nodenext` par tsconfig.api.json — même convention
   que contrats.ts et templatesEmail.ts. */
import type { Database } from '../types/database.types.js'

type VideoSession = Database['public']['Tables']['video_sessions']['Row']

/* Interface unique de visioconférence, appelée partout où un lien « Rejoindre » est affiché.
   Trois fournisseurs coexistent :

   - `jitsi` : le fournisseur actuel. Choisi le 2026-10-07 parce que Google Meet, lorsque la
     réunion est hébergée par un compte Gmail gratuit (celui de l'établissement), REFUSE l'accès
     à quiconque n'est pas connecté à un compte Google. Or une partie des élèves de HOC n'en ont
     pas. Jitsi n'exige aucun compte : le lien s'ouvre dans le navigateur, point. `room_ref`
     contient le lien complet.
   - `google_meet` : ancien fournisseur, conservé pour les séances créées avant la bascule et
     dont le lien n'a pas été régénéré. Le lien reste valide pour qui a un compte Google.
   - `stub` : aucune visio réelle n'a pu être créée. Le lien reste factice, les séances déjà
     créées ainsi le gardent jusqu'à ce qu'un admin le régénère depuis la page Séances. */

export const DOMAINE_JITSI = 'https://meet.jit.si'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'
const LONGUEUR_SALLE = 24

/* Le nom de salle EST le secret : sur l'instance publique Jitsi, quiconque connaît l'URL entre.
   D'où un identifiant tiré au sort, et non un nom lisible du type « hoc-cours-anglais-mardi » qui
   se devinerait. 24 lettres parmi 26 font environ 112 bits d'imprévisibilité — du même ordre qu'un
   UUID, et bien au-delà du code à 10 caractères sur lequel reposait un lien Meet.

   Que des lettres, aucun chiffre : Jitsi affiche le nom de la salle en gros sur son écran
   d'accueil, en le découpant à chaque passage lettre/chiffre. Un UUID y donnait
   « Hoc 1 A 9 B 3822 5 A 91 4489 », illisible ; des lettres seules restent un mot unique. */
export function creerLienJitsi(): string {
  const octets = new Uint8Array(LONGUEUR_SALLE * 2)
  crypto.getRandomValues(octets)
  let salle = ''
  for (const octet of octets) {
    // 234 = 9 × 26 : au-delà, l'octet est écarté plutôt que replié par un modulo, qui rendrait
    // les premières lettres de l'alphabet plus probables que les dernières.
    if (octet >= 234) continue
    salle += ALPHABET[octet % 26]
    if (salle.length === LONGUEUR_SALLE) break
  }
  // Réserve épuisée (improbable : il faudrait que plus de la moitié des 48 octets soient écartés).
  while (salle.length < LONGUEUR_SALLE) salle += ALPHABET[Math.floor(Math.random() * 26)]
  return `${DOMAINE_JITSI}/hoc${salle}`
}

export function getJoinUrl(videoSession: Pick<VideoSession, 'room_ref' | 'provider'>): string {
  if ((videoSession.provider === 'jitsi' || videoSession.provider === 'google_meet') && videoSession.room_ref) {
    return videoSession.room_ref
  }
  return `https://meet.hari-online-club.example/salle/${videoSession.room_ref}`
}

export function estLienReel(videoSession: Pick<VideoSession, 'room_ref' | 'provider'>): boolean {
  return (videoSession.provider === 'jitsi' || videoSession.provider === 'google_meet') && Boolean(videoSession.room_ref)
}

export function getRecordingUrl(videoSession: Pick<VideoSession, 'enregistrement_url'>): string | null {
  return videoSession.enregistrement_url
}
