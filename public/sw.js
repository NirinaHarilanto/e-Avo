/* Agent de service de Hari Online Club — volontairement INERTE.
 *
 * Il n'existe que pour une raison : les navigateurs n'autorisent l'installation d'une
 * application que si la page en déclare un. Il ne met RIEN en cache et se contente de laisser
 * passer les requêtes au réseau.
 *
 * Ce choix est délibéré. Un agent de service qui met en cache sert, par construction, une
 * version figée de l'application — et ce dépôt a déjà payé ce prix : des onglets restés sur une
 * version précédente affichaient un écran d'erreur à chaque déploiement, le temps que leurs
 * fragments de code disparaissent du serveur (voir src/lib/rechargementVersion.ts). Ajouter un
 * cache ici transformerait cet incident passager en état permanent, et sur un téléphone, où
 * l'application reste ouverte des semaines, personne ne reverrait jamais une mise à jour.
 *
 * Le jour où le fonctionnement hors ligne sera demandé, il faudra le construire autrement :
 * cache versionné, purge à l'activation, et une stratégie « réseau d'abord » pour le document
 * HTML. Tant que ce n'est pas le besoin, ne rien mettre en cache est la seule option sûre.
 */

self.addEventListener('install', () => {
  // Pas d'attente : cette version remplace aussitôt la précédente, puisqu'il n'y a rien à migrer.
  self.skipWaiting()
})

self.addEventListener('activate', (evenement) => {
  /* Reprend la main sur les onglets déjà ouverts. Sans cela, un onglet lancé avant la toute
     première installation resterait sans agent jusqu'à son prochain rechargement, et le
     navigateur continuerait d'y refuser l'installation. */
  evenement.waitUntil(self.clients.claim())
})

/* Un gestionnaire `fetch` est exigé pour que l'application soit jugée installable. Celui-ci ne
   répond pas : ne pas appeler `respondWith` laisse le navigateur faire sa requête normalement,
   ce qui est exactement l'effet recherché. */
self.addEventListener('fetch', () => {})
