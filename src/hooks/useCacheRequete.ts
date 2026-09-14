import { useCallback, useEffect, useRef, useState } from 'react'

/* Cache mémoire partagé par tous les hooks de données de l'app, à la durée de vie de l'onglet
   (jamais persisté, jamais partagé entre onglets — vidé à l'actualisation du navigateur).
   React Router démonte et remonte le composant de chaque page à chaque navigation (voir le
   commentaire de ProfileContext.tsx) : sans ce cache, chaque hook repartait de zéro à chaque
   retour sur une page déjà visitée, d'où l'écran de chargement systématique que l'utilisateur
   signalait. Avec, la première visite reste aussi lente qu'avant (rien à montrer), mais toute
   visite suivante affiche instantanément la dernière donnée connue pendant qu'une requête de
   rafraîchissement tourne en silence — le principe « stale-while-revalidate ». */
const cache = new Map<string, unknown>()

/* Exécute `requete` et tient à jour un état `{valeur, loading, erreur}` sous clé `cle`,
   réutilisable par la quasi-totalité des hooks `useXxx` de l'app (liste ou dossier chargé au
   montage, avec un `recharger()` appelé après une mutation). `cle` à `null`/`undefined`
   suspend la requête — utile tant qu'un id de route n'est pas encore connu.

   Volontairement minimal : pas d'expiration, pas d'invalidation croisée entre clés, pas de
   déduplication de requêtes concurrentes. Le stock de hooks de l'app n'en a pas besoin — chacun
   n'a qu'un seul consommateur actif à la fois, et `recharger()` (appelé après chaque mutation)
   écrase déjà la valeur en cache avec la donnée fraîche. */
export function useCacheRequete<T>(cle: string | null | undefined, requete: () => Promise<T>) {
  const dejaEnCache = cle != null && cache.has(cle)
  const [valeur, setValeur] = useState<T | undefined>(() => (dejaEnCache ? (cache.get(cle as string) as T) : undefined))
  const [loading, setLoading] = useState(cle != null && !dejaEnCache)
  const [erreur, setErreur] = useState<string | null>(null)

  /* La fonction `requete` est recréée à chaque rendu (elle ferme souvent sur des props) ; la
     passer telle quelle en dépendance de l'effet redéclencherait la requête à chaque rendu.
     Une ref la garde à jour sans faire de l'identité de fonction une dépendance — mise à jour
     dans un effet plutôt que pendant le rendu, où muter une ref est déconseillé (React ne
     garantit alors plus qu'un rendu jeté avant commit n'ait aucun effet de bord). */
  const requeteRef = useRef(requete)
  useEffect(() => {
    requeteRef.current = requete
  })

  const executer = useCallback(async () => {
    if (cle == null) return
    setErreur(null)
    try {
      const resultat = await requeteRef.current()
      cache.set(cle, resultat)
      setValeur(resultat)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }, [cle])

  useEffect(() => {
    executer()
  }, [executer])

  return { valeur, loading, erreur, recharger: executer }
}
