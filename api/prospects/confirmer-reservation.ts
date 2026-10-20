export const config = { runtime: 'edge' }

// DÉSACTIVÉE le 2026-10-20 (revue de sécurité). Route publique de l'ancien parcours Calendly :
// quand un prospect répondait « oui » à « avez-vous pu réserver un créneau ? », elle passait son
// statut à `diagnostic_planifie`. Plus aucun écran ne l'appelle depuis que l'agenda interne a
// remplacé Calendly, et elle laissait un visiteur anonyme repasser N'IMPORTE QUEL prospect — y
// compris un dossier déjà converti en étudiant — en « diagnostic planifié ». Le fichier peut être
// supprimé ; il est gardé pour que l'URL réponde clairement 410 plutôt qu'une 404 ambiguë.
export default async function handler(): Promise<Response> {
  return Response.json({ error: 'Cette route n’existe plus.' }, { status: 410 })
}
