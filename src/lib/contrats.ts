import type { Database, VariableTemplate } from '../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Etablissement = Database['public']['Tables']['etablissements']['Row']

/* Substitution de variables `{{cle}}` dans un modèle de contrat — texte simple, pas de
   librairie de templating (cohérent avec l'absence de dépendances externes du projet). Une
   variable non renseignée reste affichée telle quelle (`{{cle}}`) plutôt que de disparaître
   silencieusement, pour que l'admin remarque l'oubli avant d'enregistrer le contrat généré. */
export function substituerVariables(gabarit: string, valeurs: Record<string, string>): string {
  return gabarit.replace(/\{\{(\w+)\}\}/g, (correspondance, cle: string) => valeurs[cle] ?? correspondance)
}

export function extraireVariables(gabarit: string): string[] {
  const trouvees = new Set<string>()
  for (const correspondance of gabarit.matchAll(/\{\{(\w+)\}\}/g)) {
    trouvees.add(correspondance[1])
  }
  return [...trouvees]
}

export type SourceVariable =
  | 'prenom'
  | 'nom'
  | 'nom_complet'
  | 'email'
  | 'telephone'
  | 'adresse'
  | 'taux_horaire'
  | 'etablissement_nom'
  | 'etablissement_specialite'
  | 'date_du_jour'
  | 'annee'

/* Valeur de `source` qui signifie « ne rien déduire, demander la saisie » — à distinguer de
   l'absence de `source`, qui laisse la déduction automatique opérer. */
export const SOURCE_MANUELLE = 'manuel'

export const SOURCES_VARIABLE: { valeur: SourceVariable; label: string; groupe: string }[] = [
  { valeur: 'nom_complet', label: 'Prénom et nom', groupe: 'Personne concernée' },
  { valeur: 'prenom', label: 'Prénom', groupe: 'Personne concernée' },
  { valeur: 'nom', label: 'Nom', groupe: 'Personne concernée' },
  { valeur: 'email', label: 'E-mail', groupe: 'Personne concernée' },
  { valeur: 'telephone', label: 'Téléphone', groupe: 'Personne concernée' },
  { valeur: 'adresse', label: 'Adresse', groupe: 'Personne concernée' },
  { valeur: 'taux_horaire', label: 'Taux horaire', groupe: 'Personne concernée' },
  { valeur: 'etablissement_nom', label: "Nom de l'établissement", groupe: 'Établissement' },
  { valeur: 'etablissement_specialite', label: "Spécialité de l'établissement", groupe: 'Établissement' },
  { valeur: 'date_du_jour', label: 'Date du jour', groupe: 'Date' },
  { valeur: 'annee', label: 'Année en cours', groupe: 'Date' },
]

export function libelleSource(source: string): string | undefined {
  return SOURCES_VARIABLE.find((s) => s.valeur === source)?.label
}

/* Résout une source vers la valeur réelle ; `null` quand la donnée n'est pas renseignée sur la
   fiche (téléphone vide, par exemple) — la variable retombe alors sur une saisie manuelle plutôt
   que d'insérer une chaîne vide dans le contrat. Le taux horaire est rendu sans symbole
   monétaire : les établissements ne facturent pas tous dans la même devise, c'est au texte du
   modèle de porter l'unité. */
export function resoudreSource(source: string, destinataire: Profile, etablissement: Etablissement | null): string | null {
  switch (source as SourceVariable) {
    case 'prenom':
      return destinataire.prenom
    case 'nom':
      return destinataire.nom
    case 'nom_complet':
      return [destinataire.prenom, destinataire.nom].filter(Boolean).join(' ') || null
    case 'email':
      return destinataire.email
    case 'telephone':
      return destinataire.telephone
    case 'adresse':
      return destinataire.adresse
    case 'taux_horaire':
      return destinataire.taux_horaire === null ? null : String(destinataire.taux_horaire)
    case 'etablissement_nom':
      return etablissement?.nom ?? null
    case 'etablissement_specialite':
      return etablissement?.specialite ?? null
    case 'date_du_jour':
      return new Date().toLocaleDateString('fr-FR')
    case 'annee':
      return String(new Date().getFullYear())
    default:
      return null
  }
}

/* Compare libellés et clés sur une base commune : minuscules, accents retirés, séparateurs
   (underscores, apostrophes, ponctuation) ramenés à des espaces. Le retrait des accents doit
   précéder le nettoyage, sinon « étudiant » décomposé donnerait « e tudiant ». */
function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/* Une variable qui désigne quelqu'un d'autre que la partie au contrat (médiateur, représentant
   légal, garant…) ne doit surtout pas hériter des données du destinataire : « Nom du médiateur »
   recevrait le nom de l'étudiant. Ces mots coupent donc toute déduction personnelle. */
const MOTS_TIERS = ['mediateur', 'representant', 'represente', 'legal', 'tuteur', 'parent', 'garant', 'temoin', 'urgence', 'banque', 'assurance', 'mineur']
const MOTS_ETABLISSEMENT = ['etablissement', 'ecole', 'centre', 'organisme', 'prestataire', 'societe', 'entreprise', 'club']
const MOTS_PERSONNE = ['etudiant', 'etudiante', 'eleve', 'apprenant', 'stagiaire', 'professeur', 'prof', 'enseignant', 'formateur', 'destinataire', 'signataire', 'client']
const CLES_NUES = ['nom', 'prenom', 'nom complet', 'email', 'e mail', 'telephone', 'adresse', 'taux horaire']

/* Déduit l'origine d'une variable à partir de sa clé et de son libellé. C'est ce qui rend le
   pré-remplissage immédiat sur les modèles existants, dont aucune variable ne porte de `source`
   enregistrée : sans cette déduction, il faudrait rouvrir et re-paramétrer chaque modèle avant
   qu'un seul champ se remplisse. L'admin garde la main — une `source` explicite enregistrée sur
   le modèle l'emporte toujours (voir `preparerVariables`). */
export function deduireSource(cle: string, label: string): SourceVariable | undefined {
  const texte = `${normaliser(cle)} ${normaliser(label)}`.trim()
  const mots = texte.split(' ')

  // Un libellé long est une clause entière (« Si l'étudiant est mineur, coller : … »), pas un
  // champ : y repérer un mot-clé ne dit rien de ce qu'il faut y mettre.
  if (mots.length > 14) return undefined

  if (/(date|fait)[a-z ]*(signature|jour)|signature[a-z ]*date/.test(texte)) return 'date_du_jour'
  if (mots.includes('annee') && !mots.includes('scolaire')) return 'annee'

  if (MOTS_ETABLISSEMENT.some((m) => mots.includes(m))) {
    if (mots.includes('specialite')) return 'etablissement_specialite'
    if (mots.includes('nom') || mots.includes('denomination')) return 'etablissement_nom'
    return undefined
  }

  if (MOTS_TIERS.some((m) => mots.includes(m))) return undefined

  const champ: SourceVariable | undefined = /nom complet|nom et prenom|prenom et nom/.test(texte)
    ? 'nom_complet'
    : mots.includes('prenom')
      ? 'prenom'
      : mots.includes('nom')
        ? 'nom'
        : mots.includes('email') || mots.includes('mail') || mots.includes('courriel')
          ? 'email'
          : mots.includes('telephone') || mots.includes('tel') || mots.includes('portable') || mots.includes('mobile')
            ? 'telephone'
            : mots.includes('adresse') || mots.includes('domicile') || mots.includes('residence')
              ? 'adresse'
              : /(taux|tarif) horaire/.test(texte)
                ? 'taux_horaire'
                : undefined

  if (!champ) return undefined

  // Une donnée personnelle n'est reprise que si le libellé désigne bien la partie au contrat,
  // ou si la clé est le champ nu (`{{nom}}`, `{{adresse}}`), qui ne peut désigner qu'elle.
  return MOTS_PERSONNE.some((m) => mots.includes(m)) || CLES_NUES.includes(normaliser(cle)) ? champ : undefined
}

/* Valeurs courantes des clauses qu'aucune fiche ne peut renseigner : proposées pré-remplies au
   lancement, et modifiables contrat par contrat. */
const DEFAUTS_COURANTS: { motif: RegExp; valeur: string }[] = [
  { motif: /modalites? de paiement|paiement.*modalites?/, valeur: "Paiement comptant à l'inscription, ou selon l'échéancier convenu avec l'établissement." },
  { motif: /delai.*report|report.*seance/, valeur: '24' },
  { motif: /retenue|penalite/, valeur: '10 %' },
  { motif: /rythme hebdo/, valeur: '2 h / semaine' },
  { motif: /type de programme/, valeur: 'Individuel' },
  { motif: /langue visee/, valeur: 'Français' },
]

export function deduireValeurDefaut(cle: string, label: string): string | undefined {
  const texte = `${normaliser(cle)} ${normaliser(label)}`.trim()
  return DEFAUTS_COURANTS.find((d) => d.motif.test(texte))?.valeur
}

export interface VariableResolue {
  cle: string
  label: string
  /* Valeur reprise d'une fiche : le champ n'est alors pas demandé à l'admin. */
  valeurAuto?: string
  /* Origine ayant produit `valeurAuto`, pour l'afficher dans le récapitulatif. */
  source?: string
  /* Proposition modifiable pour les variables restées en saisie manuelle. */
  defaut?: string
}

/* Point d'entrée unique du pré-remplissage : pour chaque variable réellement présente dans le
   texte du modèle, décide si elle se remplit seule ou reste à saisir. L'ordre de priorité est
   toujours le même — `source` enregistrée sur le modèle, puis déduction depuis le libellé. */
export function preparerVariables(
  corpsTemplate: string,
  variablesModele: VariableTemplate[],
  destinataire: Profile | null,
  etablissement: Etablissement | null,
): VariableResolue[] {
  return extraireVariables(corpsTemplate).map((cle) => {
    const declaree = variablesModele.find((v) => v.cle === cle)
    const label = declaree?.label || cle
    const source = declaree?.source || deduireSource(cle, label)

    if (destinataire && source && source !== SOURCE_MANUELLE) {
      const valeurAuto = resoudreSource(source, destinataire, etablissement)
      if (valeurAuto !== null) return { cle, label, valeurAuto, source }
    }

    return { cle, label, defaut: declaree?.valeur_defaut ?? deduireValeurDefaut(cle, label) }
  })
}
