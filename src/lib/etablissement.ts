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

/* Nom de l'établissement tel qu'il doit APPARAÎTRE aux participants d'une réunion — demande
   client du 2026-10-31 : « quand les utilisateurs cliquent sur les liens Google Meet et Jitsi,
   le nom et la photo de Harinjo apparaissent comme organisateur ; est-il possible d'afficher
   "Hari Online Club" et le logo à la place ? »

   L'identité de l'ORGANISATEUR, elle, ne se change pas depuis l'application : Google Calendar
   refuse d'écrire `organizer` (c'est la garantie qu'un événement ne peut pas être signé au nom
   de quelqu'un d'autre), et Meet affiche le nom et la photo du compte Google qui héberge. Seul
   le compte Google lui-même peut les changer, depuis la console Workspace.
   Ce qui RELÈVE de l'application, c'est le TITRE de la réunion : Meet l'affiche en haut de
   l'écran et Jitsi le reprend dans l'invitation. Il porte donc le nom de l'établissement, en
   tête pour survivre à la troncature des titres longs. */
export const NOM_ETABLISSEMENT = 'Hari Online Club'

/* Fuseau de référence de l'établissement, à Antananarivo. Les écrans d'administration
   affichent toujours les horaires dedans, jamais dans celui du navigateur (demande client du
   2026-09-21) : un admin en déplacement doit continuer à lire les heures telles que l'équipe
   les vit sur place. Côté visiteur, c'est l'inverse — voir `fuseauDuVisiteur` dans
   lib/creneaux.ts. Doit rester aligné sur `reservation_parametres.fuseau` (migration 0042). */
export const FUSEAU_ETABLISSEMENT = 'Indian/Antananarivo'

/* Le jour tel qu'il est à Antananarivo, au format `YYYY-MM-DD` attendu par une colonne `date`
   de Postgres.
   À utiliser pour TOUTE date métier écrite en base ou comparée à « aujourd'hui » (date de
   paiement, date d'envoi d'un contrat, échéance en retard…). `new Date().toISOString()` convertit
   d'abord en UTC : à Madagascar (UTC+3), minuit local le 20/10 devient 21h UTC le 19/10, et la
   date enregistrée recule d'un jour entre minuit et 3 h du matin. Passer par le fuseau de
   l'établissement règle du même coup le cas d'un admin en déplacement, qui doit écrire la date
   que l'équipe vit sur place et non celle de son propre fuseau.
   `fr-CA` est la locale qui rend exactement `YYYY-MM-DD`. */
export function jourDansFuseauEtablissement(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU_ETABLISSEMENT }).format(instant)
}

/* Date et heure d'un instant telles qu'elles se lisent à Antananarivo. */
export function formaterDansFuseauEtablissement(
  instant: string | Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'full', timeStyle: 'short' },
): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_ETABLISSEMENT, ...options }).format(
    instant instanceof Date ? instant : new Date(instant),
  )
}
