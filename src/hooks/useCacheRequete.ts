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

   Volontairement minimal : pas d'expiration, pas de déduplication de requêtes concurrentes pour
   une même clé. Deux garanties restent nécessaires dès qu'une INSTANCE DÉJÀ MONTÉE change de
   clé — ce qui arrive dès qu'un id d'URL change sans remonter le composant (React Router ne
   remonte pas un élément de route quand seul `useParams()` change), par exemple en cliquant un
   autre étudiant dans une liste maître-détail :
   1. ne pas continuer d'afficher la donnée de l'ancienne clé sous la nouvelle le temps que la
      requête réponde (on montrerait le dossier d'une autre personne sous le mauvais nom) ;
   2. ne pas laisser une requête devenue obsolète (l'admin a déjà cliqué sur quelqu'un d'autre
      entre-temps) écraser, en répondant en retard, le résultat déjà affiché de la clé actuelle. */
export function useCacheRequete<T>(cle: string | null | undefined, requete: () => Promise<T>) {
  const [cleTraitee, setCleTraitee] = useState(cle)
  const dejaEnCache = cle != null && cache.has(cle)
  const [valeur, setValeur] = useState<T | undefined>(() => (dejaEnCache ? (cache.get(cle as string) as T) : undefined))
  const [loading, setLoading] = useState(cle != null && !dejaEnCache)
  const [erreur, setErreur] = useState<string | null>(null)

  /* Garantie 1, ci-dessus — ajusté pendant le rendu (pattern React « Adjusting state when a
     prop changes »), pas dans un effet : un effet s'exécute après la peinture, ce qui
     laisserait passer un rendu affichant la mauvaise donnée. */
  if (cle !== cleTraitee) {
    setCleTraitee(cle)
    setValeur(dejaEnCache ? (cache.get(cle as string) as T) : undefined)
    setLoading(cle != null && !dejaEnCache)
    setErreur(null)
  }

  /* La fonction `requete` est recréée à chaque rendu (elle ferme souvent sur des props) ; la
     passer telle quelle en dépendance de l'effet redéclencherait la requête à chaque rendu.
     Une ref la garde à jour sans faire de l'identité de fonction une dépendance — mise à jour
     dans un effet plutôt que pendant le rendu, où muter une ref est déconseillé (React ne
     garantit alors plus qu'un rendu jeté avant commit n'ait aucun effet de bord). */
  const requeteRef = useRef(requete)
  useEffect(() => {
    requeteRef.current = requete
  })

  /* Garantie 2, ci-dessus. Mise à jour dans un effet (donc après tout rendu jeté), toujours
     avant qu'une promesse déjà en vol ne puisse se résoudre : la résolution d'une promesse est
     mise en file de micro-tâches, exécutée seulement une fois React revenu à la boucle
     d'événements — donc après le flush synchrone des effets du rendu qui vient de committer. */
  const cleActuelleRef = useRef(cle)
  useEffect(() => {
    cleActuelleRef.current = cle
  }, [cle])

  const executer = useCallback(async () => {
    const cleDeCetAppel = cle
    if (cleDeCetAppel == null) return
    setErreur(null)
    try {
      const resultat = await requeteRef.current()
      if (cleActuelleRef.current !== cleDeCetAppel) return
      cache.set(cleDeCetAppel, resultat)
      setValeur(resultat)
      setLoading(false)
    } catch (e) {
      if (cleActuelleRef.current !== cleDeCetAppel) return
      setErreur(e instanceof Error ? e.message : 'Une erreur est survenue.')
      setLoading(false)
    }
  }, [cle])

  useEffect(() => {
    executer()
  }, [executer])

  return { valeur, loading, erreur, recharger: executer }
}
