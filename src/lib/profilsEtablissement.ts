import { supabase } from './supabaseClient'
import { surMutation } from './synchro'
import type { Database } from '../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

/* Chargement unique de TOUS les profils de l'établissement (optimisation du 2026-10-13).

   Plusieurs écrans avaient besoin de profils qu'ils ne pouvaient nommer qu'après avoir reçu
   d'autres données — les élèves d'une liste de paiements, puis leurs partenaires de binôme, puis
   les partenaires dans l'autre sens. Chaque étape attendait la précédente, et sur la page
   Paiements cela faisait quatre allers-retours successifs rien que pour des profils. Or un
   aller-retour coûte ici 330 ms au mieux (base en Europe, utilisateurs à Madagascar) : la cascade
   pesait plus lourd que tout le reste de la page.

   Un établissement compte quelques dizaines de profils : les charger tous d'un coup transfère
   moins de 20 Ko et permet de tout résoudre en mémoire, sans jamais attendre.

   Les profils SUPPRIMÉS (`status = 'suspended'`) sont inclus volontairement : il faut encore
   pouvoir afficher le nom du professeur d'une séance passée ou d'un paiement, même si son compte
   n'existe plus. C'est à l'appelant de filtrer selon ce qu'il montre.

   Le résultat n'est gardé que TRÈS brièvement (DUREE_CACHE_MS) : assez pour qu'un même écran, qui
   démarre ses requêtes par paquets successifs, n'en redemande pas trois fois en une seconde ; trop
   peu pour qu'un utilisateur revienne sur un écran et y retrouve une ancienne valeur. Et surtout,
   la moindre écriture — la nôtre comme celle d'un autre espace — le vide immédiatement
   (`surMutation`, voir synchro.ts). Un affichage faux est bien plus coûteux qu'un aller-retour. */
const DUREE_CACHE_MS = 5_000
let enVol: Promise<Profile[]> | null = null
let expireLe = 0

surMutation(() => {
  enVol = null
  expireLe = 0
})

async function requeter(): Promise<Profile[]> {
  /* `.then()` sur une requête Supabase rend un `PromiseLike`, pas une vraie `Promise` : l'envelopper
     dans une fonction `async` évite ce piège, déjà rencontré sur ce projet. */
  const { data, error } = await supabase.from('profiles').select('*')
  if (error) throw new Error(error.message)
  return data ?? []
}

export function chargerProfilsEtablissement(): Promise<Profile[]> {
  // Tant qu'elle est en vol, toujours la partager ; une fois résolue, seulement le temps du cache.
  if (enVol && (expireLe === 0 || Date.now() < expireLe)) return enVol
  const promesse = requeter()
  promesse.then(
    () => {
      if (enVol === promesse) expireLe = Date.now() + DUREE_CACHE_MS
    },
    // Un échec ne se met jamais en cache : l'appel suivant doit pouvoir retenter aussitôt.
    () => {
      if (enVol === promesse) enVol = null
    },
  )
  enVol = promesse
  expireLe = 0
  return promesse
}

/* Partenaire de binôme DUO d'un élève, dans les deux sens. Le lien est ASYMÉTRIQUE (migration
   0054) : seul le membre secondaire porte `duo_partenaire_id`, le principal ne porte rien et ne se
   retrouve donc qu'en cherchant qui pointe VERS lui. Les deux requêtes que cela demandait sont
   remplacées par ces deux tables de correspondance, construites une fois. */
export function indexPartenairesDuo(profils: Profile[]) {
  const parId = new Map(profils.map((p) => [p.id, p]))
  const versPrincipal = new Map<string, Profile>()
  for (const p of profils) {
    if (p.duo_partenaire_id && p.status !== 'suspended') versPrincipal.set(p.duo_partenaire_id, p)
  }
  return (studentId: string): Profile | null => {
    const designe = parId.get(studentId)?.duo_partenaire_id
    if (designe) {
      const partenaire = parId.get(designe)
      return partenaire && partenaire.status !== 'suspended' ? partenaire : null
    }
    return versPrincipal.get(studentId) ?? null
  }
}
