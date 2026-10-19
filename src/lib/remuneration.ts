/* Calcul de la rémunération d'un professeur selon le type de chaque séance — demande client du
   2026-10-12 : « un taux horaire pour chaque type de cours : individuel, collectif et DUO [...]
   facturé en fonction de la séance faite ». Volontairement pur (aucune requête, aucune horloge) :
   c'est la pièce qui décide combien un professeur touche, elle doit être vérifiable par des
   tests, et elle tourne aussi bien côté serveur (api/professeur/soumettre-timesheet.ts,
   api/admin/traiter-timesheet.ts, api/admin/payer-professeur.ts) que côté client (estimation
   avant envoi). */

/* 'corporate' et 'chat_chill' (0131, 2026-10-19) ne viennent pas d'une séance HOC mais d'une
   prestation externe, sans élève ni forfait — seul leur crédit d'heures rejoint le registre
   commun, pour être facturé sur le même TimeSheet que le reste. */
export type TypeFacturation = 'individuel' | 'collectif' | 'duo' | 'corporate' | 'chat_chill'

export const LIBELLE_TYPE_FACTURATION: Record<TypeFacturation, string> = {
  individuel: 'Individuel',
  duo: 'Duo',
  collectif: 'Collectif',
  corporate: 'Corporate',
  chat_chill: 'Chat & chill',
}

export interface TauxProfesseur {
  taux_horaire_individuel: number | null
  taux_horaire_duo: number | null
  taux_horaire_collectif: number | null
  /* Optionnels : les appels qui ne traitent que des séances HOC (écrans antérieurs à 0131) ne
     les passent pas, et une ligne corporate serait alors signalée comme « taux manquant » plutôt
     que facturée en silence au taux individuel. */
  taux_horaire_corporate?: number | null
  taux_horaire_chat_chill?: number | null
}

/* Les valeurs que `hour_ledger.type_facturation` peut porter, pour reconnaître une chaîne venue
   de la base sans se fier à un `as` — un type inconnu (base plus récente que le code) retombe
   ainsi sur « individuel » au lieu de produire un taux fantôme. */
const TYPES_CONNUS: readonly TypeFacturation[] = ['individuel', 'collectif', 'duo', 'corporate', 'chat_chill']

export function typeFacturationOuDefaut(valeur: string | null | undefined): TypeFacturation {
  return TYPES_CONNUS.includes(valeur as TypeFacturation) ? (valeur as TypeFacturation) : 'individuel'
}

/* Une écriture hour_ledger antérieure au 2026-10-12 n'a pas de `type_facturation` (colonne
   inexistante avant) : elle retombe sur « individuel », seul taux qui existait alors — exactement
   ce qu'elle facturait déjà avant ce chantier, donc aucune rémunération déjà versée ne change
   rétroactivement de valeur. */
export function tauxPourType(taux: TauxProfesseur, type: TypeFacturation | string | null | undefined): number | null {
  if (type === 'collectif') return taux.taux_horaire_collectif
  if (type === 'duo') return taux.taux_horaire_duo
  if (type === 'corporate') return taux.taux_horaire_corporate ?? null
  if (type === 'chat_chill') return taux.taux_horaire_chat_chill ?? null
  return taux.taux_horaire_individuel
}

export interface EcritureFacturable {
  heures: number
  type_facturation: string | null
}

export interface LigneRemuneration<T extends EcritureFacturable = EcritureFacturable> {
  ligne: T
  type: TypeFacturation
  taux: number | null
  montant: number | null
}

export interface ResultatRemuneration<T extends EcritureFacturable = EcritureFacturable> {
  lignes: LigneRemuneration<T>[]
  /* Un seul arrondi, sur le total — pas un arrondi par ligne répété sur des dizaines de séances,
     qui dériverait (ex. 0,33 h à 10 000 Ar/h arrondie séparément 33 fois plutôt qu'une fois). */
  montant: number
  heures: number
  /* Types réellement rencontrés dont le taux n'est pas renseigné sur la fiche du professeur —
     l'appelant doit refuser de facturer tant que cette liste n'est pas vide. */
  manque: TypeFacturation[]
}

export function calculerRemuneration<T extends EcritureFacturable>(ecritures: T[], taux: TauxProfesseur): ResultatRemuneration<T> {
  const manque = new Set<TypeFacturation>()
  let montantBrut = 0
  let heures = 0

  const lignes = ecritures.map((ligne) => {
    const type = typeFacturationOuDefaut(ligne.type_facturation)
    const t = tauxPourType(taux, type)
    heures += ligne.heures
    if (t == null) {
      manque.add(type)
    } else {
      montantBrut += ligne.heures * t
    }
    return { ligne, type, taux: t, montant: t != null ? Math.round(ligne.heures * t * 100) / 100 : null }
  })

  return { lignes, montant: Math.round(montantBrut * 100) / 100, heures: Math.round(heures * 100) / 100, manque: [...manque] }
}
