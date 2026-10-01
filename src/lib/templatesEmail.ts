/* Préparation d'un e-mail à partir d'un modèle (0091) — demande client du 2026-10-01.
   Le moteur de substitution des contrats (`substituerVariables`, lib/contrats.ts) remplace
   aveuglément `{{cle}}` par ce qu'on lui donne, chaîne vide comprise. Pour un contrat relu avant
   signature, c'est le bon comportement. Pour un e-mail, non : une valeur manquante laisse soit un
   `{{lien_drive}}` en clair, soit une ligne mutilée (« - Dossier Drive : »). D'où ce module, qui
   ajoute les deux règles propres à l'e-mail : la ligne de liste dont la valeur manque TOMBE, et ce
   qui reste non résolu est signalé à l'appelant au lieu d'être masqué. */

/* Extension `.js` sur cet import relatif : ce module est aussi compilé par tsconfig.api.json
   (résolution `node16`), qui l'exige — même convention que les autres modules de `src/lib`
   partagés avec les fonctions API (voir classesCollectif.ts, creneaux.ts). */
import { extraireVariables, substituerVariables } from './contrats.js'

export interface PreparationEmail {
  objet: string
  corps: string
  /* Variables encore sans valeur après substitution, hors lignes supprimées — ce que l'admin doit
     compléter dans l'aperçu, et ce qui interdit un envoi automatique. */
  manquantes: string[]
  /* Lignes retirées faute de valeur, pour pouvoir le dire à l'écran plutôt que de laisser
     l'admin découvrir un paragraphe disparu. */
  lignesRetirees: string[]
}

/* Une ligne est « une ligne de liste » quand elle commence par un tiret : c'est la forme que
   prennent, dans les 22 modèles, tous les accès optionnels (« - Dossier Drive (leçons et
   exercices) : {{lien_drive}} »). La retirer entière garde un e-mail lisible ; la garder vide
   donnerait une ligne qui promet un lien absent. */
const LIGNE_DE_LISTE = /^\s*-\s/

/* Variable seule sur sa ligne, éventuellement précédée d'un libellé : c'est le cas où la ligne
   n'a plus de raison d'être si la valeur manque. Une variable au milieu d'une phrase ne fait
   jamais tomber la phrase — on préfère un trou visible à une phrase amputée de son sens. */
function ligneNeVitQueParSesVariables(ligne: string, manquantes: Set<string>): boolean {
  const variables = extraireVariables(ligne)
  if (variables.length === 0) return false
  if (!variables.every((v) => manquantes.has(v))) return false
  // Ce qui resterait de la ligne une fois les variables ôtées : un libellé, de la ponctuation.
  const reste = ligne.replace(/\{\{[a-z0-9_]+\}\}/gi, '').trim()
  return LIGNE_DE_LISTE.test(ligne) || reste.length === 0 || /[:–-]\s*$/.test(reste)
}

/* Substitue en retirant les lignes de liste devenues creuses. `valeurs` ne contient QUE les
   valeurs réellement connues : une clé absente ou vide compte comme manquante, c'est ce qui
   déclenche la règle de ligne. */
export function preparerEmail(
  modele: { objet: string; corps: string },
  valeurs: Record<string, string | null | undefined>,
): PreparationEmail {
  const connues: Record<string, string> = {}
  for (const [cle, valeur] of Object.entries(valeurs)) {
    const propre = (valeur ?? '').trim()
    if (propre) connues[cle] = propre
  }

  const toutes = [...new Set([...extraireVariables(modele.objet), ...extraireVariables(modele.corps)])]
  const manquantes = new Set(toutes.filter((v) => !connues[v]))

  const lignesRetirees: string[] = []
  const lignesGardees: string[] = []
  for (const ligne of modele.corps.split('\n')) {
    if (ligneNeVitQueParSesVariables(ligne, manquantes)) {
      lignesRetirees.push(ligne.trim())
      continue
    }
    lignesGardees.push(ligne)
  }

  /* `substituerVariables` reçoit les variables manquantes en chaîne vide : dans le texte restant,
     elles sont au milieu d'une phrase, et un gabarit nu (« {{montant}} ») serait pire qu'un blanc
     — l'appelant les a de toute façon dans `manquantes` pour les signaler. */
  const pourSubstitution = { ...connues }
  for (const v of manquantes) pourSubstitution[v] = ''

  const corps = lignesGardees
    .join('\n')
    // Trois sauts de ligne ou plus : trace d'une ligne retirée au milieu d'un bloc.
    .replace(/\n{3,}/g, '\n\n')
  const restantes = toutes.filter((v) => manquantes.has(v) && (corps.includes(`{{${v}}}`) || modele.objet.includes(`{{${v}}}`)))

  return {
    objet: substituerVariables(modele.objet, pourSubstitution),
    corps: substituerVariables(corps, pourSubstitution),
    manquantes: restantes,
    lignesRetirees,
  }
}

/* Corps texte → HTML d'e-mail. Les modèles du document sont écrits en texte brut (sauts de ligne,
   listes à tirets, intertitres en majuscules) : les clients de messagerie ignorant les feuilles de
   style externes, tout est posé en style inline, comme les gabarits de api/_lib/email.ts. */
export function corpsEnHtml(corps: string): string {
  const echappe = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return corps
    .split('\n')
    .map((ligne) => {
      const texte = echappe(ligne)
      if (!ligne.trim()) return '<div style="height:12px"></div>'
      // Intertitre : ligne entièrement en majuscules (« VOTRE FORMATION », « À RETENIR »).
      if (/^[A-ZÀ-Ý0-9ŒÆ'’ ,–-]{4,}$/.test(ligne.trim()) && !LIGNE_DE_LISTE.test(ligne)) {
        return `<div style="font-weight:700;letter-spacing:.4px;margin:18px 0 6px;color:#4A306D">${texte}</div>`
      }
      if (LIGNE_DE_LISTE.test(ligne)) {
        return `<div style="margin:2px 0 2px 14px">${texte}</div>`
      }
      return `<div style="margin:4px 0">${texte}</div>`
    })
    .join('\n')
}
