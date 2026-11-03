/* Moteur de récurrence partagé par les deux façons de créer un événement répétitif dans HOC —
   demande client du 2026-10-12 : « il faut que l'affichage et les options de récurrence
   ressemblent à l'agenda de Gmail visuellement ». Plus riche que l'ancienne liste figée à 5
   choix (REPETITIONS, FicheEvenementGoogle.tsx) : fréquence + intervalle + jours de la semaine +
   condition de fin (jamais / à une date / après N occurrences), comme le sélecteur « Personnalisé »
   de Google Agenda.

   Deux usages, un seul moteur :
   - `genererOccurrences` calcule des dates CONCRÈTES, pour les séances de cours (lignes `sessions`
     HOC-natives, créées une par une via /planifier-seances-prevision — voir 0123, `serie_id`).
   - `versRRule` calcule la règle iCalendar que Google Agenda attend, pour un rendez-vous « autre »
     dont la récurrence est entièrement déléguée à Google (aucune date stockée côté HOC). */

export type FrequenceRecurrence = 'jour' | 'semaine' | 'mois' | 'an'

export interface FinRecurrence {
  type: 'jamais' | 'le' | 'apres'
  /* Date (YYYY-MM-DD) incluse dans la récurrence — uniquement pour `type === 'le'`. */
  date?: string
  /* Nombre total d'occurrences, point de départ compris — uniquement pour `type === 'apres'`. */
  occurrences?: number
}

export interface RegleRecurrence {
  frequence: FrequenceRecurrence
  /* Tous les combien — 1 = chaque jour/semaine/mois/an, 2 = un jour/une semaine/un mois/un an sur deux… */
  intervalle: number
  /* 0 = dimanche … 6 = samedi, comme Date.prototype.getDay(). Uniquement pour frequence === 'semaine' ;
     un ou plusieurs jours cochés (ex. lundi + mercredi + vendredi). */
  joursSemaine?: number[]
  /* Heure propre à chaque jour coché, au format « HH:MM » — demande client du 2026-11-03 : « il
     faut pouvoir définir les jours de la semaine du lundi au dimanche et un créneau à définir à
     côté de chaque jour ». Un cours peut être à 10h le lundi et 14h le mercredi, ce qu'une heure
     unique héritée du point de départ ne savait pas exprimer : il fallait créer deux séries.
     Un jour absent de cette table garde l'heure du point de départ, l'ancien comportement. */
  heuresParJour?: Record<number, string>
  fin: FinRecurrence
}

/* Même garde-fou que `MAX_OCCURRENCES` dans planifier-seances-prevision.ts (~3 ans à 2
   séances/semaine) : une récurrence « jamais » doit tout de même s'arrêter quelque part. */
export const LIMITE_OCCURRENCES_DEFAUT = 156

function ajouterIntervalle(date: Date, regle: RegleRecurrence): Date {
  const suivante = new Date(date)
  switch (regle.frequence) {
    case 'jour':
      suivante.setDate(suivante.getDate() + regle.intervalle)
      break
    case 'semaine':
      suivante.setDate(suivante.getDate() + 7 * regle.intervalle)
      break
    case 'mois':
      suivante.setMonth(suivante.getMonth() + regle.intervalle)
      break
    case 'an':
      suivante.setFullYear(suivante.getFullYear() + regle.intervalle)
      break
  }
  return suivante
}

/* Le jour `jourCible` de la même semaine calendaire que `reference` (dimanche-samedi) — peut
   tomber avant OU après `reference` selon `jourCible`, c'est voulu : un créneau « lundi » choisi
   un mercredi doit quand même remonter au lundi de cette semaine-là pour que le calcul des
   semaines suivantes reste aligné, l'appelant filtre ensuite ce qui précède le vrai point de
   départ. */
function dateDuJourDansLaSemaine(reference: Date, jourCible: number): Date {
  const resultat = new Date(reference)
  resultat.setDate(resultat.getDate() + (jourCible - resultat.getDay()))
  return resultat
}

function genererOccurrencesHebdomadaires(
  regle: RegleRecurrence & { joursSemaine: number[] },
  debut: Date,
  limiteDate: Date | null,
  limiteCompte: number | null,
  limite: number,
): Date[] {
  const jours = [...new Set(regle.joursSemaine)].sort((a, b) => a - b)
  const occurrences: Date[] = []
  let semaineCursor = new Date(debut)

  while (occurrences.length < limite) {
    for (const jour of jours) {
      const candidate = dateDuJourDansLaSemaine(semaineCursor, jour)
      /* L'heure du jour quand elle est définie, sinon celle du point de départ : c'est ce qui
         permet « lundi 10h, mercredi 14h » en une seule série (2026-11-03). */
      const heureDuJour = regle.heuresParJour?.[jour]
      if (heureDuJour) {
        const [h, m] = heureDuJour.split(':').map(Number)
        candidate.setHours(h, m, 0, 0)
      } else {
        candidate.setHours(debut.getHours(), debut.getMinutes(), debut.getSeconds(), 0)
      }
      if (candidate.getTime() < debut.getTime()) continue
      if (limiteDate && candidate.getTime() > limiteDate.getTime()) return occurrences
      occurrences.push(candidate)
      if (limiteCompte && occurrences.length >= limiteCompte) return occurrences
      if (occurrences.length >= limite) return occurrences
    }
    semaineCursor = ajouterIntervalle(semaineCursor, regle)
  }
  return occurrences
}

/**
 * Calcule les dates concrètes d'une récurrence, `debut` compris. Fonction pure : aucune horloge
 * système, aucune dépendance au fuseau du serveur — tout se lit sur les champs locaux de `Date`,
 * comme le reste des écrans d'agenda de ce projet.
 */
export function genererOccurrences(regle: RegleRecurrence, debut: Date, limite = LIMITE_OCCURRENCES_DEFAUT): Date[] {
  const limiteDate = regle.fin.type === 'le' && regle.fin.date ? new Date(`${regle.fin.date}T23:59:59`) : null
  const limiteCompte = regle.fin.type === 'apres' && regle.fin.occurrences ? regle.fin.occurrences : null

  if (regle.frequence === 'semaine' && regle.joursSemaine && regle.joursSemaine.length > 0) {
    return genererOccurrencesHebdomadaires({ ...regle, joursSemaine: regle.joursSemaine }, debut, limiteDate, limiteCompte, limite)
  }

  const occurrences: Date[] = []
  let courante = new Date(debut)
  while (occurrences.length < limite) {
    if (limiteDate && courante.getTime() > limiteDate.getTime()) break
    occurrences.push(new Date(courante))
    if (limiteCompte && occurrences.length >= limiteCompte) break
    courante = ajouterIntervalle(courante, regle)
  }
  return occurrences
}

const FREQ_ICAL: Record<FrequenceRecurrence, string> = { jour: 'DAILY', semaine: 'WEEKLY', mois: 'MONTHLY', an: 'YEARLY' }
const JOUR_ICAL: Record<number, string> = { 0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA' }

function versRRuleDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

/** Traduit une règle en RRULE iCalendar — ce que Google Agenda attend pour un événement récurrent. */
export function versRRule(regle: RegleRecurrence): string {
  const parties = [`FREQ=${FREQ_ICAL[regle.frequence]}`]
  if (regle.intervalle > 1) parties.push(`INTERVAL=${regle.intervalle}`)
  if (regle.frequence === 'semaine' && regle.joursSemaine && regle.joursSemaine.length > 0) {
    parties.push(`BYDAY=${[...regle.joursSemaine].sort((a, b) => a - b).map((j) => JOUR_ICAL[j]).join(',')}`)
  }
  if (regle.fin.type === 'apres' && regle.fin.occurrences) {
    parties.push(`COUNT=${regle.fin.occurrences}`)
  } else if (regle.fin.type === 'le' && regle.fin.date) {
    parties.push(`UNTIL=${versRRuleDate(new Date(`${regle.fin.date}T23:59:59`))}`)
  }
  return `RRULE:${parties.join(';')}`
}

const NOMS_JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

export interface OptionRecurrence {
  valeur: string
  libelle: string
  /* `null` pour « Ne se répète pas » ET pour « Personnalisé… », qui ouvre le constructeur au
     lieu de désigner directement une règle. */
  regle: RegleRecurrence | null
}

/* Date de fin proposée d'office à toute répétition : trois mois après le départ.
   Pourquoi PAS « jamais » comme avant — incident du 2026-11-03 : « Tous les jours » sans fin
   générait 156 séances d'un coup (le plafond `LIMITE_OCCURRENCES_DEFAUT`), et une réservation
   relancée quatre fois a laissé 107 séances fantômes dans le dossier d'une élève. Une répétition
   part donc désormais bornée, et c'est à l'utilisateur d'allonger s'il le veut. */
export function finParDefaut(debut: Date): FinRecurrence {
  const fin = new Date(debut)
  fin.setMonth(fin.getMonth() + 3)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { type: 'le', date: `${fin.getFullYear()}-${pad(fin.getMonth() + 1)}-${pad(fin.getDate())}` }
}

/* Préréglages façon Google Agenda, calculés à partir de la date/heure de début choisie — jamais
   un libellé générique (« ce jour-là »), toujours le vrai jour pour que l'admin lise exactement
   ce qu'il va créer avant même d'ouvrir quoi que ce soit. */
export function preselectionsRecurrence(debut: Date): OptionRecurrence[] {
  const jourSemaine = debut.getDay()
  const estJourOuvre = jourSemaine >= 1 && jourSemaine <= 5
  const fin = finParDefaut(debut)

  const options: OptionRecurrence[] = [
    { valeur: 'aucune', libelle: 'Ne se répète pas', regle: null },
    { valeur: 'jour', libelle: 'Tous les jours', regle: { frequence: 'jour', intervalle: 1, fin } },
    {
      valeur: 'semaine',
      libelle: `Toutes les semaines le ${NOMS_JOURS[jourSemaine]}`,
      regle: { frequence: 'semaine', intervalle: 1, joursSemaine: [jourSemaine], fin },
    },
  ]
  if (estJourOuvre) {
    options.push({
      valeur: 'semaine_ouvree',
      libelle: 'Tous les jours de la semaine (lun-ven)',
      regle: { frequence: 'semaine', intervalle: 1, joursSemaine: [1, 2, 3, 4, 5], fin },
    })
  }
  options.push(
    {
      valeur: 'mois',
      libelle: `Tous les mois le ${debut.getDate()}`,
      regle: { frequence: 'mois', intervalle: 1, fin },
    },
    {
      valeur: 'an',
      libelle: `Tous les ans le ${debut.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`,
      regle: { frequence: 'an', intervalle: 1, fin },
    },
    { valeur: 'personnalise', libelle: 'Personnalisé…', regle: null },
  )
  return options
}

export const LIBELLE_FREQUENCE_PERSONNALISEE: Record<FrequenceRecurrence, { singulier: string; pluriel: string }> = {
  jour: { singulier: 'jour', pluriel: 'jours' },
  semaine: { singulier: 'semaine', pluriel: 'semaines' },
  mois: { singulier: 'mois', pluriel: 'mois' },
  an: { singulier: 'an', pluriel: 'ans' },
}

export const LIBELLE_JOUR_COURT = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

/* Deux règles sont équivalentes si elles produiraient la même récurrence — sert au sélecteur
   (SelecteurRecurrence.tsx) à savoir si la règle courante correspond encore à l'un des
   préréglages, ou si elle doit retomber sur « Personnalisé… ». Compare les jours de semaine sans
   tenir compte de l'ordre : [1,3,5] et [5,1,3] désignent le même choix. */
export function regleEquivalente(a: RegleRecurrence, b: RegleRecurrence): boolean {
  if (a.frequence !== b.frequence || a.intervalle !== b.intervalle) return false
  const joursA = [...(a.joursSemaine ?? [])].sort((x, y) => x - y)
  const joursB = [...(b.joursSemaine ?? [])].sort((x, y) => x - y)
  if (joursA.length !== joursB.length || joursA.some((j, i) => j !== joursB[i])) return false
  /* Deux règles qui ne diffèrent que par l'heure d'un jour ne sont PAS la même : sans cette
     comparaison, « lundi 10h » et « lundi 14h » retomberaient tous deux sur le même préréglage,
     et le sélecteur effacerait l'heure saisie en se croyant sur un préréglage connu. */
  const heuresA = a.heuresParJour ?? {}
  const heuresB = b.heuresParJour ?? {}
  const clesHeures = [...new Set([...Object.keys(heuresA), ...Object.keys(heuresB)])]
  if (clesHeures.some((k) => heuresA[Number(k)] !== heuresB[Number(k)])) return false
  if (a.fin.type !== b.fin.type) return false
  if (a.fin.type === 'le' && a.fin.date !== b.fin.date) return false
  if (a.fin.type === 'apres' && a.fin.occurrences !== b.fin.occurrences) return false
  return true
}
