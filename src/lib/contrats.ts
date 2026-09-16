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
  | 'whatsapp'
  | 'adresse'
  | 'ville'
  | 'date_naissance'
  | 'lieu_naissance'
  | 'age'
  | 'taux_horaire'
  | 'etablissement_nom'
  | 'etablissement_specialite'
  | 'date_du_jour'
  | 'annee'
  | 'langue_programme'
  | 'type_programme_label'
  | 'heures_programme'
  | 'montant_programme'
  | 'date_debut_programme'
  | 'date_echeance_programme'
  | 'rythme_programme'
  | 'langues_enseignees'
  | 'nombre_eleves_actifs'
  | 'heures_enseignees'

/* Valeur de `source` qui signifie « ne rien déduire, demander la saisie » — à distinguer de
   l'absence de `source`, qui laisse la déduction automatique opérer. */
export const SOURCE_MANUELLE = 'manuel'

export const SOURCES_VARIABLE: { valeur: SourceVariable; label: string; groupe: string }[] = [
  { valeur: 'nom_complet', label: 'Prénom et nom', groupe: 'Personne concernée' },
  { valeur: 'prenom', label: 'Prénom', groupe: 'Personne concernée' },
  { valeur: 'nom', label: 'Nom', groupe: 'Personne concernée' },
  { valeur: 'email', label: 'E-mail', groupe: 'Personne concernée' },
  { valeur: 'telephone', label: 'Téléphone', groupe: 'Personne concernée' },
  { valeur: 'whatsapp', label: 'WhatsApp', groupe: 'Personne concernée' },
  { valeur: 'adresse', label: 'Adresse', groupe: 'Personne concernée' },
  { valeur: 'ville', label: 'Ville', groupe: 'Personne concernée' },
  { valeur: 'taux_horaire', label: 'Taux horaire', groupe: 'Personne concernée' },
  { valeur: 'date_naissance', label: 'Date de naissance', groupe: 'Naissance' },
  { valeur: 'lieu_naissance', label: 'Lieu de naissance', groupe: 'Naissance' },
  { valeur: 'age', label: 'Âge', groupe: 'Naissance' },
  { valeur: 'langue_programme', label: 'Langue visée / suivie', groupe: 'Programme (étudiant)' },
  { valeur: 'type_programme_label', label: 'Type de programme', groupe: 'Programme (étudiant)' },
  { valeur: 'heures_programme', label: "Nombre d'heures du programme", groupe: 'Programme (étudiant)' },
  { valeur: 'montant_programme', label: 'Montant du forfait', groupe: 'Programme (étudiant)' },
  { valeur: 'date_debut_programme', label: 'Date de début du programme', groupe: 'Programme (étudiant)' },
  { valeur: 'date_echeance_programme', label: 'Échéance du programme', groupe: 'Programme (étudiant)' },
  { valeur: 'rythme_programme', label: 'Rythme hebdomadaire convenu', groupe: 'Programme (étudiant)' },
  { valeur: 'langues_enseignees', label: 'Langue(s) enseignée(s)', groupe: 'Activité (professeur)' },
  { valeur: 'nombre_eleves_actifs', label: "Nombre d'élèves actifs", groupe: 'Activité (professeur)' },
  { valeur: 'heures_enseignees', label: 'Heures enseignées à ce jour', groupe: 'Activité (professeur)' },
  { valeur: 'etablissement_nom', label: "Nom de l'établissement", groupe: 'Établissement' },
  { valeur: 'etablissement_specialite', label: "Spécialité de l'établissement", groupe: 'Établissement' },
  { valeur: 'date_du_jour', label: 'Date du jour', groupe: 'Date' },
  { valeur: 'annee', label: 'Année en cours', groupe: 'Date' },
]

export function libelleSource(source: string): string | undefined {
  return SOURCES_VARIABLE.find((s) => s.valeur === source)?.label
}

const LABELS_TYPE_PROGRAMME = { individuel: 'Individuel', duo: 'Duo', collectif: 'Collectif' } as const

export function libelleTypeProgramme(type: keyof typeof LABELS_TYPE_PROGRAMME): string {
  return LABELS_TYPE_PROGRAMME[type]
}

function calculerAge(dateNaissance: string): number {
  const naissance = new Date(dateNaissance)
  const aujourdhui = new Date()
  let age = aujourdhui.getFullYear() - naissance.getFullYear()
  const anniversairePasAtteint =
    aujourdhui.getMonth() < naissance.getMonth() ||
    (aujourdhui.getMonth() === naissance.getMonth() && aujourdhui.getDate() < naissance.getDate())
  if (anniversairePasAtteint) age -= 1
  return age
}

/* Ce que le profil du destinataire seul ne porte pas : dérivé de son dossier pédagogique
   (forfait/vague/affectation pour un étudiant, élèves actifs/affectations pour un professeur).
   Calculé une fois dans LancerApprobationContrat.tsx à partir des hooks déjà existants
   (useDossierEtudiant / useProfesseurDetailAdmin) — cette fonction ne fait qu'exposer les champs
   que `resoudreSource` sait lire. */
export interface ContexteProgramme {
  langueProgramme?: string | null
  typeProgrammeLabel?: string | null
  heuresProgramme?: number | null
  montantProgramme?: number | null
  dateDebutProgramme?: string | null
  dateEcheanceProgramme?: string | null
  rythmeProgramme?: string | null
  languesEnseignees?: string[]
  nombreElevesActifs?: number | null
  heuresEnseignees?: number | null
}

/* Résout une source vers la valeur réelle ; `null` quand la donnée n'est pas renseignée sur la
   fiche ou le dossier (téléphone vide, pas encore de forfait…) — la variable retombe alors sur
   une saisie manuelle plutôt que d'insérer une chaîne vide dans le contrat. Le taux horaire est
   rendu sans symbole monétaire : les établissements ne facturent pas tous dans la même devise,
   c'est au texte du modèle de porter l'unité. */
export function resoudreSource(
  source: string,
  destinataire: Profile,
  etablissement: Etablissement | null,
  contexte?: ContexteProgramme,
): string | null {
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
    case 'whatsapp':
      return destinataire.whatsapp
    case 'adresse':
      return destinataire.adresse
    case 'ville':
      return destinataire.ville
    case 'date_naissance':
      return destinataire.date_naissance ? new Date(destinataire.date_naissance).toLocaleDateString('fr-FR') : null
    case 'lieu_naissance':
      return destinataire.lieu_naissance
    case 'age':
      return destinataire.date_naissance ? String(calculerAge(destinataire.date_naissance)) : null
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
    case 'langue_programme':
      return contexte?.langueProgramme ?? null
    case 'type_programme_label':
      return contexte?.typeProgrammeLabel ?? null
    case 'heures_programme':
      return contexte?.heuresProgramme != null ? String(contexte.heuresProgramme) : null
    /* Seul montant de l'app rendu avec son unité : « 1 200 000 » seul dans un contrat se lirait
       aussi bien en ariary qu'en euros, alors que le reste des sources (taux horaire, heures)
       s'insère dans une phrase qui porte déjà l'unité. */
    case 'montant_programme':
      return contexte?.montantProgramme != null ? `${contexte.montantProgramme.toLocaleString('fr-FR')} Ar` : null
    case 'date_debut_programme':
      return contexte?.dateDebutProgramme ? new Date(contexte.dateDebutProgramme).toLocaleDateString('fr-FR') : null
    case 'date_echeance_programme':
      return contexte?.dateEcheanceProgramme ? new Date(contexte.dateEcheanceProgramme).toLocaleDateString('fr-FR') : null
    case 'rythme_programme':
      return contexte?.rythmeProgramme ?? null
    case 'langues_enseignees':
      return contexte?.languesEnseignees && contexte.languesEnseignees.length > 0 ? contexte.languesEnseignees.join(', ') : null
    case 'nombre_eleves_actifs':
      return contexte?.nombreElevesActifs != null ? String(contexte.nombreElevesActifs) : null
    case 'heures_enseignees':
      return contexte?.heuresEnseignees != null ? String(Math.round(contexte.heuresEnseignees)) : null
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
   recevrait le nom de l'étudiant. Ces mots coupent donc toute déduction personnelle — sauf
   « mineur », traité à part dans `preparerVariables` (clause déduite de l'âge, pas un simple
   champ recopié). */
const MOTS_TIERS = ['mediateur', 'representant', 'represente', 'legal', 'tuteur', 'parent', 'garant', 'temoin', 'urgence', 'banque', 'assurance', 'mineur']
const MOTS_ETABLISSEMENT = ['etablissement', 'ecole', 'centre', 'organisme', 'prestataire', 'societe', 'entreprise', 'club']
const MOTS_PERSONNE = ['etudiant', 'etudiante', 'eleve', 'apprenant', 'stagiaire', 'professeur', 'prof', 'enseignant', 'formateur', 'destinataire', 'signataire', 'client']
const CLES_NUES = ['nom', 'prenom', 'nom complet', 'email', 'e mail', 'telephone', 'whatsapp', 'adresse', 'ville', 'taux horaire', 'date naissance', 'lieu naissance', 'age']

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

  // Champs de programme : il n'y a qu'un programme en jeu par contrat (celui de la personne
  // choisie), donc pas d'ambiguïté de tiers à filtrer ici, contrairement aux champs d'identité
  // plus bas. Vérifiés avant toute autre règle pour ne jamais tomber dans le blocage
  // MOTS_TIERS/MOTS_ETABLISSEMENT (aucun chevauchement de vocabulaire prévu, mais l'ordre
  // explicite documente l'intention).
  if (/langues?.*enseignees?|enseignees?.*langues?/.test(texte)) return 'langues_enseignees'
  if (/heures?.*enseignees?|enseignees?.*heures?/.test(texte)) return 'heures_enseignees'
  if (/nombre.*eleves?|effectif.*eleves?/.test(texte)) return 'nombre_eleves_actifs'
  if (/prix total|montant total|montant.*(forfait|programme|contrat)|prix.*(forfait|programme)|^prix$|^montant$/.test(texte)) return 'montant_programme'
  if (/heures?.*programme|nombre.*heures?|volume.*heures?|forfait.*heures?/.test(texte)) return 'heures_programme'
  if (/type.*programme/.test(texte)) return 'type_programme_label'
  if (/rythme.*hebdo/.test(texte)) return 'rythme_programme'
  if (/date.*debut.*(cours|programme)|debut.*programme/.test(texte)) return 'date_debut_programme'
  if (/echeance.*programme|date.*echeance|date.*fin.*programme/.test(texte)) return 'date_echeance_programme'
  if (/langue.*visee|langue.*suivie|^langue$|langue etudiee|langue apprise/.test(texte)) return 'langue_programme'

  if (/(date|fait)[a-z ]*(signature|jour)|signature[a-z ]*date/.test(texte)) return 'date_du_jour'
  if (mots.includes('annee') && !mots.includes('scolaire')) return 'annee'

  /* « Prestataire » est ambigu : dans un contrat étudiant, c'est l'établissement qui rend le
     service — mais dans le modèle professeur (« Convention de prestation de services »), c'est
     le PROFESSEUR lui-même qui est « le Prestataire », en tant qu'indépendant. Un champ comme
     {{nom_prestataire}}, étiqueté « Nom complet du professeur », se voyait donc rempli avec le
     nom de l'établissement au lieu de celui du professeur — bug signalé par le client le
     2026-09-16. Dès que le libellé nomme explicitement la personne concernée (professeur,
     étudiant, élève…), cette désignation l'emporte sur le mot « prestataire »/« société »/etc.,
     qui n'est alors qu'une façon de la nommer, pas l'établissement. */
  const nommeLaPersonne = MOTS_PERSONNE.some((m) => mots.includes(m))
  if (MOTS_ETABLISSEMENT.some((m) => mots.includes(m)) && !nommeLaPersonne) {
    if (mots.includes('specialite')) return 'etablissement_specialite'
    if (mots.includes('nom') || mots.includes('denomination')) return 'etablissement_nom'
    return undefined
  }

  if (MOTS_TIERS.some((m) => mots.includes(m))) return undefined

  const champ: SourceVariable | undefined = /nom complet|nom et prenom|prenom et nom/.test(texte)
    ? 'nom_complet'
    : /date.*naissance|naissance.*date/.test(texte)
      ? 'date_naissance'
      : /lieu.*naissance/.test(texte)
        ? 'lieu_naissance'
        : mots.includes('prenom')
          ? 'prenom'
          : mots.includes('nom')
            ? 'nom'
            : mots.includes('whatsapp')
              ? 'whatsapp'
              : mots.includes('email') || mots.includes('mail') || mots.includes('courriel')
                ? 'email'
                : mots.includes('telephone') || mots.includes('tel') || mots.includes('portable') || mots.includes('mobile')
                  ? 'telephone'
                  : mots.includes('ville') && !mots.includes('signature')
                    ? 'ville'
                    : mots.includes('adresse') || mots.includes('domicile') || mots.includes('residence')
                      ? 'adresse'
                      : mots.includes('age')
                        ? 'age'
                        : /(taux|tarif) horaire/.test(texte)
                          ? 'taux_horaire'
                          : undefined

  if (!champ) return undefined

  // Une donnée personnelle n'est reprise que si le libellé désigne bien la partie au contrat,
  // ou si la clé est le champ nu (`{{nom}}`, `{{adresse}}`), qui ne peut désigner qu'elle.
  return nommeLaPersonne || CLES_NUES.includes(normaliser(cle)) ? champ : undefined
}

/* Valeurs courantes des clauses qu'aucune fiche/dossier ne peut renseigner : proposées
   pré-remplies au lancement, et modifiables contrat par contrat. Filet de repli pour les
   variables de programme quand le contexte (dossier) n'a pas résolu la source — ex. un contrat
   professeur, où « type de programme » n'a pas de sens. */
const DEFAUTS_COURANTS: { motif: RegExp; valeur: string }[] = [
  { motif: /modalites? de paiement|paiement.*modalites?/, valeur: "Paiement comptant à l'inscription, ou selon l'échéancier convenu avec l'établissement." },
  { motif: /delai.*report|report.*seance/, valeur: '24' },
  { motif: /retenue|penalite/, valeur: '10 %' },
]

export function deduireValeurDefaut(cle: string, label: string): string | undefined {
  const texte = `${normaliser(cle)} ${normaliser(label)}`.trim()
  return DEFAUTS_COURANTS.find((d) => d.motif.test(texte))?.valeur
}

/* Suggestion (éditable) collée quand l'étudiant est mineur : le nom du représentant légal n'est
   connu d'aucune fiche, une révision humaine reste nécessaire sur une mention à portée
   juridique — voir le traitement dédié dans `preparerVariables`. */
const MENTION_MINEUR_DEFAUT =
  'Représenté(e) par [Nom du représentant légal], en qualité de représentant légal, qui consent à la présente inscription et s’engage solidairement à son exécution.'

export interface VariableResolue {
  cle: string
  label: string
  /* Valeur reprise d'une fiche/du dossier : le champ n'est alors pas demandé à l'admin. */
  valeurAuto?: string
  /* Origine ayant produit `valeurAuto`, pour l'afficher dans le récapitulatif. */
  source?: string
  /* Proposition modifiable pour les variables restées en saisie manuelle. */
  defaut?: string
}

/* Point d'entrée unique du pré-remplissage : pour chaque variable réellement présente dans le
   texte du modèle, décide si elle se remplit seule ou reste à saisir. Ordre de priorité :
   1. `source` enregistrée explicitement sur le modèle ;
   2. cas spécial de la clause de minorité, déduite de l'âge (voir plus haut) ;
   3. déduction depuis le libellé, résolue avec la fiche + le dossier pédagogique (`contexte`). */
export function preparerVariables(
  corpsTemplate: string,
  variablesModele: VariableTemplate[],
  destinataire: Profile | null,
  etablissement: Etablissement | null,
  contexte?: ContexteProgramme,
): VariableResolue[] {
  return extraireVariables(corpsTemplate).map((cle) => {
    const declaree = variablesModele.find((v) => v.cle === cle)
    const label = declaree?.label || cle

    if (!declaree?.source && destinataire?.date_naissance && /\bmineur\b/.test(normaliser(`${cle} ${label}`))) {
      const majeur = calculerAge(destinataire.date_naissance) >= 18
      if (majeur) return { cle, label, valeurAuto: '', source: 'age' }
      return { cle, label, defaut: MENTION_MINEUR_DEFAUT }
    }

    const source = declaree?.source || deduireSource(cle, label)
    if (destinataire && source && source !== SOURCE_MANUELLE) {
      const valeurAuto = resoudreSource(source, destinataire, etablissement, contexte)
      if (valeurAuto !== null) return { cle, label, valeurAuto, source }
    }

    return { cle, label, defaut: declaree?.valeur_defaut ?? deduireValeurDefaut(cle, label) }
  })
}
