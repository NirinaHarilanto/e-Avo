import { supabase } from './supabaseClient'
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

   Pas de cache de résultat : seuls les appels SIMULTANÉS sont fusionnés, comme le fait
   `executerPartagee` dans useCacheRequete.ts. Un rafraîchissement ultérieur refait donc bien un
   appel réseau, et aucune donnée périmée ne peut être servie. */
let enVol: Promise<Profile[]> | null = null

async function requeter(): Promise<Profile[]> {
  /* `.then()` sur une requête Supabase rend un `PromiseLike`, pas une vraie `Promise` : l'envelopper
     dans une fonction `async` évite ce piège, déjà rencontré sur ce projet. */
  const { data, error } = await supabase.from('profiles').select('*')
  if (error) throw new Error(error.message)
  return data ?? []
}

export function chargerProfilsEtablissement(): Promise<Profile[]> {
  if (enVol) return enVol
  // Libérée dès la réponse reçue : les appels suivants repartiront bien en réseau.
  const promesse = requeter().finally(() => {
    if (enVol === promesse) enVol = null
  })
  enVol = promesse
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
