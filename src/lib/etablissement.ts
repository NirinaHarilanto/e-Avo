/* L'application ne sert plus qu'un seul établissement, Hari Online Club (HOC) : sa page
   vitrine est la page d'accueil. Le slug reste celui enregistré en base depuis l'origine. */
export const SLUG_ETABLISSEMENT_PRINCIPAL = 'hari-online-course'

/* Adresse officielle de l'administration (boîte Google professionnelle du client, demande du
   2026-10-09 : elle remplace `harionlineclub.app@gmail.com` partout où l'application nomme
   l'établissement). Le domaine en `.com` diffère de celui du site (`harionlineclub.app`) : c'est
   bien le choix du client, pas une coquille.

   Les coordonnées affichées sur les documents (factures, devis, contrats) viennent de
   `etablissements.email`, modifiable depuis l'écran « Profil HOC » — cette constante ne sert
   qu'aux endroits sans accès à la base : textes d'erreur, page de réinitialisation, vitrine
   publique, et adresse de réponse des e-mails transactionnels. */
export const EMAIL_OFFICIEL_HOC = 'admin@harionlineclub.com'

/* Fuseau de référence de l'établissement, à Antananarivo. Les écrans d'administration
   affichent toujours les horaires dedans, jamais dans celui du navigateur (demande client du
   2026-09-21) : un admin en déplacement doit continuer à lire les heures telles que l'équipe
   les vit sur place. Côté visiteur, c'est l'inverse — voir `fuseauDuVisiteur` dans
   lib/creneaux.ts. Doit rester aligné sur `reservation_parametres.fuseau` (migration 0042). */
export const FUSEAU_ETABLISSEMENT = 'Indian/Antananarivo'

/* Date et heure d'un instant telles qu'elles se lisent à Antananarivo. */
export function formaterDansFuseauEtablissement(
  instant: string | Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'full', timeStyle: 'short' },
): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_ETABLISSEMENT, ...options }).format(
    instant instanceof Date ? instant : new Date(instant),
  )
}
