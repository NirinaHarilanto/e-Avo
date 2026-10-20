/* Extension `.js` : ce module est desormais aussi compile par tsconfig.api.json (resolution
   `node16`, qui l'exige), depuis que src/lib/templatesEmail.ts le reutilise cote serveur. */
import type { Database, VariableTemplate } from '../types/database.types.js'

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
  /* Second membre d'un binôme DUO (0066, demande client du 2026-09-23 : « mettre étudiant 1 avec
     ses informations et étudiant 2 avec ses informations, dans le même contrat »). Un contrat
     étudiant DUO résout ces sources depuis le second profil transmis à `preparerVariables`, en
     plus du premier via les sources ci-dessus — jamais utilisées pour un contrat professeur ou un
     étudiant individuel, où aucun second destinataire n'existe. */
  | 'prenom_2'
  | 'nom_2'
  | 'nom_complet_2'
  | 'email_2'
  | 'telephone_2'
  | 'whatsapp_2'
  | 'adresse_2'
  | 'ville_2'
  | 'date_naissance_2'
  | 'lieu_naissance_2'
  | 'age_2'
  | 'etablissement_nom'
  | 'etablissement_specialite'
  /* Section « Profil HOC » (0097, demande client du 2026-10-05) : identité administrative de
     l'établissement, réutilisable dans les modèles de contrat au même titre que le nom/la
     spécialité. Le CIN de la directrice n'y figure PAS — donnée personnelle sensible, jamais
     destinée à apparaître sur un document remis à un élève (voir la migration). */
  | 'etablissement_directrice'
  | 'etablissement_adresse'
  | 'etablissement_telephone'
  | 'etablissement_email'
  | 'etablissement_site_web'
  | 'etablissement_nif'
  | 'etablissement_stat'
  | 'etablissement_forme_juridique'
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
  { valeur: 'nom_complet_2', label: 'Prénom et nom (étudiant 2)', groupe: 'Second membre du duo' },
  { valeur: 'prenom_2', label: 'Prénom (étudiant 2)', groupe: 'Second membre du duo' },
  { valeur: 'nom_2', label: 'Nom (étudiant 2)', groupe: 'Second membre du duo' },
  { valeur: 'email_2', label: 'E-mail (étudiant 2)', groupe: 'Second membre du duo' },
  { valeur: 'telephone_2', label: 'Téléphone (étudiant 2)', groupe: 'Second membre du duo' },
  { valeur: 'whatsapp_2', label: 'WhatsApp (étudiant 2)', groupe: 'Second membre du duo' },
  { valeur: 'adresse_2', label: 'Adresse (étudiant 2)', groupe: 'Second membre du duo' },
  { valeur: 'ville_2', label: 'Ville (étudiant 2)', groupe: 'Second membre du duo' },
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
  { valeur: 'etablissement_directrice', label: "Nom de la directrice", groupe: 'Établissement' },
  { valeur: 'etablissement_adresse', label: "Adresse de l'établissement", groupe: 'Établissement' },
  { valeur: 'etablissement_telephone', label: "Téléphone de l'établissement", groupe: 'Établissement' },
  { valeur: 'etablissement_email', label: "E-mail de l'établissement", groupe: 'Établissement' },
  { valeur: 'etablissement_site_web', label: "Site web de l'établissement", groupe: 'Établissement' },
  { valeur: 'etablissement_nif', label: 'NIF', groupe: 'Établissement' },
  { valeur: 'etablissement_stat', label: 'STAT', groupe: 'Établissement' },
  { valeur: 'etablissement_forme_juridique', label: "Forme juridique de l'établissement", groupe: 'Établissement' },
  { valeur: 'date_du_jour', label: 'Date du jour', groupe: 'Date' },
  { valeur: 'annee', label: 'Année en cours', groupe: 'Date' },
]

/* Retirées du sélecteur (la fiche ne porte plus ces champs depuis le 2026-09-29). Demande client
   du 2026-09-30, plus radicale encore : « on en aura pas besoin » — un modèle qui les utilise
   toujours (comme celui déjà en place, avec ses `{{date_naissance_etudiant}}`/`{{lieu_naissance}}`
   dans le corps du texte) ne doit plus jamais les présenter à l'admin comme « reste à saisir »
   NI les faire apparaître dans le contrat généré. `resoudreSource` (plus bas) les résout donc
   désormais toujours en chaîne vide, jamais en `null` — voir son commentaire. */
const SOURCES_RETIREES: Record<string, string> = {
  date_naissance: 'Date de naissance',
  lieu_naissance: 'Lieu de naissance',
  age: 'Âge',
  date_naissance_2: 'Date de naissance (étudiant 2)',
  lieu_naissance_2: 'Lieu de naissance (étudiant 2)',
  age_2: 'Âge (étudiant 2)',
}

export function libelleSource(source: string): string | undefined {
  return SOURCES_VARIABLE.find((s) => s.valeur === source)?.label ?? SOURCES_RETIREES[source]
}

/* Champs d'identité propres à UNE personne — par opposition aux champs de programme, de date ou
   d'établissement, partagés par construction. Deux usages :
   - un contrat DUO les porte pour les DEUX membres même quand le modèle n'a jamais été pensé
     pour ça (voir `preparerVariables`, repli automatique) ;
   - l'aperçu d'un contrat de classe collective les affiche sous le nom de chaque élève plutôt
     qu'une fois pour tous (LancerApprobationContrat.tsx, 2026-10-19) — s'y fier plutôt qu'à
     l'égalité des valeurs évite de ranger en « commun » un téléphone vide chez tout le monde.
   Exclut `taux_horaire` : propre au professeur, jamais à un élève. */
export const SOURCES_IDENTITE_PERSONNE = new Set<SourceVariable>([
  'prenom',
  'nom',
  'nom_complet',
  'email',
  'telephone',
  'whatsapp',
  'adresse',
  'ville',
  'date_naissance',
  'lieu_naissance',
  'age',
])

const LABELS_TYPE_PROGRAMME = { individuel: 'Individuel', duo: 'Duo', collectif: 'Collectif' } as const

export function libelleTypeProgramme(type: keyof typeof LABELS_TYPE_PROGRAMME): string {
  return LABELS_TYPE_PROGRAMME[type]
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
  destinataireSecondaire?: Profile | null,
): string | null {
  // Sources du second membre du duo (0066) : résolues depuis le profil secondaire, jamais celui
  // du destinataire principal — `null` si le contrat n'en a pas (professeur, étudiant seul).
  if (destinataireSecondaire && (source as SourceVariable).endsWith('_2')) {
    const sourcePrincipale = (source as string).slice(0, -2)
    return resoudreSource(sourcePrincipale, destinataireSecondaire, etablissement, contexte)
  }
  if (!destinataireSecondaire && (source as SourceVariable).endsWith('_2')) return null

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
    /* Chaîne vide, jamais `null` (0086, demande client du 2026-09-30 : « enlève les zones date
       de naissance et lieu de naissance... on en aura pas besoin ») — `null` signifierait
       « non résolu », ce qui rouvrirait un champ à saisir manuellement (voir preparerVariables) ;
       la fiche ne recueille plus ces informations, mais un modèle qui porte encore
       `{{date_naissance_etudiant}}`/`{{lieu_naissance}}` dans son texte ne doit plus jamais les
       demander à l'admin ni les faire apparaître dans le contrat généré, même pour un profil
       qui aurait gardé une ancienne valeur. */
    case 'date_naissance':
    case 'lieu_naissance':
    case 'age':
      return ''
    case 'taux_horaire':
      // Le taux horaire d'un contrat professeur reste « le » taux individuel (0126) : un contrat
      // n'a jamais eu vocation à citer les 3 taux séparément, seul le premier existait à sa
      // conception — les variables manuelles `taux_horaire_individuel`/`taux_horaire_collectif`
      // de 0103 restent le seul endroit où un contrat détaille les 3, saisies à la main.
      return destinataire.taux_horaire_individuel === null ? null : String(destinataire.taux_horaire_individuel)
    case 'etablissement_nom':
      return etablissement?.nom ?? null
    case 'etablissement_specialite':
      return etablissement?.specialite ?? null
    case 'etablissement_directrice':
      return etablissement?.directrice ?? null
    case 'etablissement_adresse':
      return etablissement?.adresse ?? null
    case 'etablissement_telephone':
      return etablissement?.telephone ?? null
    case 'etablissement_email':
      return etablissement?.email ?? null
    case 'etablissement_site_web':
      return etablissement?.site_web ?? null
    case 'etablissement_nif':
      return etablissement?.nif ?? null
    case 'etablissement_stat':
      return etablissement?.stat ?? null
    case 'etablissement_forme_juridique':
      return etablissement?.forme_juridique ?? null
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
    if (mots.includes('directrice') || mots.includes('directeur') || mots.includes('direction')) return 'etablissement_directrice'
    if (mots.includes('adresse')) return 'etablissement_adresse'
    if (mots.includes('telephone') || mots.includes('tel')) return 'etablissement_telephone'
    if (mots.includes('email') || mots.includes('mail')) return 'etablissement_email'
    if (/site ?web/.test(texte) || mots.includes('site')) return 'etablissement_site_web'
    if (mots.includes('nif')) return 'etablissement_nif'
    if (mots.includes('stat')) return 'etablissement_stat'
    if (mots.includes('forme') && mots.includes('juridique')) return 'etablissement_forme_juridique'
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
  if (!(nommeLaPersonne || CLES_NUES.includes(normaliser(cle)))) return undefined

  /* Second membre d'un binôme DUO (0066) : « Nom de l'étudiant 2 », « Email (second membre) »…
     — le marqueur l'emporte sur le champ nu détecté ci-dessus. `taux_horaire` n'a pas de variante
     _2 (seul un professeur en a un, jamais concerné par un contrat duo). */
  const marqueurSecondMembre = mots.includes('2') || /deuxieme|second(e|aire)?\b/.test(texte)
  if (marqueurSecondMembre && champ !== 'taux_horaire') return `${champ}_2` as SourceVariable

  return champ
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

/* Suggestion (éditable) collée quand l'étudiant est mineur (case cochée, voir `estClauseMineur`
   sur VariableResolue) : le nom du représentant légal n'est connu d'aucune fiche, une révision
   humaine reste nécessaire sur une mention à portée juridique. */
export const MENTION_MINEUR_DEFAUT =
  'Représenté(e) par [Nom du représentant légal], en qualité de représentant légal, qui consent à la présente inscription et s’engage solidairement à son exécution.'

export interface VariableResolue {
  cle: string
  label: string
  /* Valeur reprise d'une fiche/du dossier : le champ n'est alors pas demandé à l'admin. Pour un
     contrat DUO, c'est TOUJOURS la valeur du seul destinataire principal — jamais fusionnée avec
     celle du second membre (voir `valeurAutoSecondaire` et `substituerVariablesDuo`). */
  valeurAuto?: string
  /* Valeur du second membre du DUO pour ce même champ, présente uniquement quand (a) le modèle
     n'a lui-même déclaré aucun champ `_2` (voir `joindreLesDeuxMembres` plus bas) et (b) sa
     valeur diffère de celle du principal. Sert à `substituerVariablesDuo` pour dupliquer, dans le
     corps généré, le paragraphe concerné avec les informations de chacun l'une sous l'autre —
     demande client du 2026-09-23 : « Nom de la première personne, suivi des informations lui
     concernant (on va à la ligne) Nom de la deuxième personne, suivi des informations lui
     concernant ». Un simple séparateur « & » dans la même phrase (essayé d'abord) rendait le
     texte à la fois illisible et grammaticalement faux (« né(e) le date1 & date2 »). */
  valeurAutoSecondaire?: string
  /* Origine ayant produit `valeurAuto`, pour l'afficher dans le récapitulatif. */
  source?: string
  /* Proposition modifiable pour les variables restées en saisie manuelle. */
  defaut?: string
  /* Clause de minorité (0087, demande client du 2026-09-30) : signale à l'appelant d'afficher une
     case à cocher « Mineur » plutôt qu'un champ de texte libre — la fiche ne recueille plus la
     date de naissance (0086), donc plus aucun moyen de déduire automatiquement si l'élève est
     mineur ; l'admin tranche lui-même. Coché : la clause (voir `defaut`, à compléter avec le nom
     du représentant légal) est insérée dans le contrat. Décoché (par défaut) : rien n'est inséré.
     Voir LancerApprobationContrat.tsx pour le rendu. */
  estClauseMineur?: boolean
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
  /* Second membre d'un binôme DUO (0066) — voir les sources `*_2` plus haut. `undefined`/`null`
     pour tout contrat sans second destinataire (professeur, étudiant individuel). */
  destinataireSecondaire?: Profile | null,
): VariableResolue[] {
  const cles = extraireVariables(corpsTemplate)

  function resoudreSourceDeCle(cle: string): SourceVariable | undefined {
    const declaree = variablesModele.find((v) => v.cle === cle)
    return (declaree?.source as SourceVariable | undefined) || deduireSource(cle, declaree?.label || cle)
  }

  /* Un modèle qui ne déclare JAMAIS de champ « second membre » explicite (`*_2`) n'a
     vraisemblablement pas été pensé pour le DUO — sans repli, le contrat généré ne porterait
     alors les informations que du destinataire principal, alors que le second signataire est
     tout autant partie au contrat. Demande client du 2026-09-23 : « les informations des deux
     personnes formant le DUO [doivent être] intégrées dans le contrat généré ». À l'inverse, un
     modèle qui déclare déjà au moins un champ `_2` a été conçu consciemment pour afficher les
     deux personnes côte à côte (ex. un tableau à deux colonnes) : on respecte ce choix explicite
     plutôt que de doubler aussi les champs de base, ce qui produirait une redondance. */
  const modeleDejaPenseurPourLeDuo = cles.some((cle) => resoudreSourceDeCle(cle)?.endsWith('_2'))
  const joindreLesDeuxMembres = !!destinataireSecondaire && !modeleDejaPenseurPourLeDuo

  return cles.map((cle) => {
    const declaree = variablesModele.find((v) => v.cle === cle)
    const label = declaree?.label || cle

    /* Clause de minorité (0087, demande client du 2026-09-30 : « remettre la clause de minorité
       à sa place... mets une checkbox, oui ou non devant l'intitulé »). Ni `valeurAuto` (la
       variable ne se remplit pas seule : décocher/cocher est un choix de l'admin, pas une
       déduction) ni `defaut` employé comme valeur de repli automatique — seulement une
       suggestion que `estClauseMineur` indique à l'appelant d'afficher derrière une case à
       cocher. Voir son commentaire dans `VariableResolue`. */
    if (!declaree?.source && /\bmineur\b/.test(normaliser(`${cle} ${label}`))) {
      return { cle, label, estClauseMineur: true, defaut: MENTION_MINEUR_DEFAUT }
    }

    const source = declaree?.source || deduireSource(cle, label)
    if (destinataire && source && source !== SOURCE_MANUELLE) {
      const valeurAuto = resoudreSource(source, destinataire, etablissement, contexte, destinataireSecondaire)
      if (valeurAuto !== null) {
        if (joindreLesDeuxMembres && SOURCES_IDENTITE_PERSONNE.has(source as SourceVariable)) {
          const valeurSecondaire = resoudreSource(source, destinataireSecondaire!, etablissement, contexte)
          if (valeurSecondaire !== null && valeurSecondaire !== valeurAuto) {
            return { cle, label, valeurAuto, valeurAutoSecondaire: valeurSecondaire, source }
          }
        }
        return { cle, label, valeurAuto, source }
      }
    }

    /* `source` est transmise MÊME ici, alors que la variable reste à saisir : c'est justement ce
       qui permet à l'appelant de reporter la saisie manuelle sur la fiche (voir
       `completsAReporterSurProfil` plus bas) — une variable dont la source est « adresse » et qui
       atterrit ici signifie précisément que `profiles.adresse` était vide au moment du contrat. */
    return { cle, label, source, defaut: declaree?.valeur_defaut ?? deduireValeurDefaut(cle, label) }
  })
}

/* ---------------------------------------------------------------------------------------------
   Report d'une information personnelle saisie À LA MAIN sur un contrat vers la fiche de la
   personne — demande client du 2026-10-10 : « j'ai renseigné des informations personnelles
   complémentaires lors de la création du contrat [...] ces informations devraient être
   enregistrées dans toute l'application et apparaître dans les informations personnelles du
   professeur [...] automatiquement ». Constaté en base sur un contrat réel : `adresse_prestataire`
   (source `adresse`) avait été tapée à la main parce que `profiles.adresse` était vide à ce
   moment-là — la valeur n'existait plus ensuite que dans `contracts.variables_valeurs`, jamais
   reportée sur la fiche.
   --------------------------------------------------------------------------------------------- */

/* Sources qui correspondent à une colonne modifiable de `profiles`, et son nom — seules celles-ci
   peuvent être reportées automatiquement. Volontairement restreint aux champs qu'
   `InformationsPersonnelles.tsx` traite déjà comme optionnels/complétables :
   - `email` est ABSENT à dessein : c'est l'identifiant de connexion (auth.users), le modifier ici
     le désynchroniserait du vrai login, sans rien changer à ce dernier (même raison que dans
     InformationsPersonnelles.tsx, qui l'affiche en lecture seule).
   - `prenom`/`nom` sont ABSENTS à dessein : une saisie de contrat n'est jamais passée par la
     vérification d'homonymie que fait ce panneau (`memeNom`), le report automatique d'un nom mal
     tapé pourrait créer un doublon silencieux. Un nom erroné se corrige depuis la fiche.
   - `nom_complet` est ABSENT : composite (prénom + nom), rien ne garantit de pouvoir le
     décomposer fiablement en ses deux colonnes d'origine. */
export const SOURCES_VERS_PROFIL: Partial<Record<SourceVariable, 'telephone' | 'whatsapp' | 'adresse' | 'ville' | 'taux_horaire_individuel'>> = {
  telephone: 'telephone',
  whatsapp: 'whatsapp',
  adresse: 'adresse',
  ville: 'ville',
  taux_horaire: 'taux_horaire_individuel',
}

export type ChampsProfilAReporter = Partial<Pick<Profile, 'telephone' | 'whatsapp' | 'adresse' | 'ville' | 'taux_horaire_individuel'>>

/* Isole, parmi les variables RESTÉES À SAISIR (`valeurAuto === undefined`, donc la fiche ne
   portait pas encore la valeur), celles que l'admin a effectivement renseignées et dont la
   `source` correspond à une colonne de `profiles` — pour le destinataire principal ET, si le
   contrat est un DUO, pour le second membre (sources `*_2`, voir `resoudreSource`).
   Pure et testée séparément : ni accès réseau ni effet de bord, l'appelant décide quoi faire du
   résultat (écrire en base, ou rien si les deux objets sont vides). */
export function completsAReporterSurProfil(
  variables: VariableResolue[],
  complements: Record<string, string>,
): { destinataire: ChampsProfilAReporter; destinataireSecondaire: ChampsProfilAReporter } {
  const destinataire: ChampsProfilAReporter = {}
  const destinataireSecondaire: ChampsProfilAReporter = {}

  for (const variable of variables) {
    if (variable.valeurAuto !== undefined || !variable.source || variable.estClauseMineur) continue
    const valeur = complements[variable.cle]?.trim()
    if (!valeur) continue

    const estSecondMembre = variable.source.endsWith('_2')
    const sourceDeBase = (estSecondMembre ? variable.source.slice(0, -2) : variable.source) as SourceVariable
    const colonne = SOURCES_VERS_PROFIL[sourceDeBase]
    if (!colonne) continue

    const cible = estSecondMembre ? destinataireSecondaire : destinataire
    if (colonne === 'taux_horaire_individuel') {
      const nombre = Number(valeur.replace(/[^\d.,-]/g, '').replace(',', '.'))
      if (Number.isFinite(nombre)) cible.taux_horaire_individuel = nombre
    } else {
      cible[colonne] = valeur
    }
  }

  return { destinataire, destinataireSecondaire }
}

/* Génère le corps d'un contrat DUO en dupliquant, paragraphe par paragraphe, ceux qui portent au
   moins un champ d'identité concerné par `valeursSecondaires` (voir `valeurAutoSecondaire`
   ci-dessus) : une première version substituée avec les valeurs du principal, une seconde avec
   celles du second membre, l'une sous l'autre. Les paragraphes sont délimités par une ligne vide,
   convention déjà suivie par tous les modèles existants pour séparer leurs clauses.
   `(?:\r\n|\r|\n)` plutôt que `\n` seul : les modèles saisis/collés depuis un éditeur Windows
   (Word, Bloc-notes) utilisent `\r\n`, jamais reconnu par `\n{2,}` puisqu'un `\r` s'intercale
   entre les deux retours à la ligne — bug constaté le 2026-09-23 sur le modèle réel de
   l'établissement : faute de séparateur reconnu, TOUT le corps était traité comme un seul
   paragraphe et donc dupliqué en entier (le contrat entier deux fois de suite, avec les
   informations du second membre invisibles car loin après la première copie complète, hors du
   cadre défilant de l'aperçu) plutôt que la seule clause d'identité concernée.
   Sans second membre à intégrer (`valeursSecondaires` vide — étudiant seul, professeur, ou
   modèle déjà conçu pour le DUO avec ses propres champs `_2`), se comporte exactement comme
   `substituerVariables`. */
export function substituerVariablesDuo(
  corpsTemplate: string,
  valeurs: Record<string, string>,
  valeursSecondaires: Record<string, string>,
): string {
  if (Object.keys(valeursSecondaires).length === 0) return substituerVariables(corpsTemplate, valeurs)

  return corpsTemplate
    .split(/(?:\r\n|\r|\n){2,}/)
    .map((paragraphe) => {
      const concerneParLeDuo = extraireVariables(paragraphe).some((cle) => cle in valeursSecondaires)
      if (!concerneParLeDuo) return substituerVariables(paragraphe, valeurs)
      const premierMembre = substituerVariables(paragraphe, valeurs)
      const secondMembre = substituerVariables(paragraphe, { ...valeurs, ...valeursSecondaires })
      return `${premierMembre}\n${secondMembre}`
    })
    .join('\n\n')
}

/* ---------------------------------------------------------------------------------------------
   Champs d'identité d'un contrat DUO, un par membre — demande client du 2026-10-20, capture à
   l'appui : « pour les groupes d'étudiants, chaque étudiant a leur propre adresse, donc il faut
   mettre l'adresse de chaque étudiant dans les champs automatiques ou mettre adresse de l'étudiant
   1, adresse de l'étudiant 2 ». Jusque-là, un champ d'identité qu'aucun des deux profils ne
   portait (adresse vide chez les deux) restait une SEULE case à saisir dans
   LancerApprobationContrat.tsx — ce qui y était tapé partait ensuite pour les DEUX membres
   (`valeursSecondaires` ne le recevait jamais, faute de valeur automatique côté principal pour
   amorcer la comparaison dans `preparerVariables`). Mêmes trou et même principe de correction que
   `clesCommunesAuxEleves` pour les classes collectives : un champ propre à une personne ne peut
   pas se saisir une seule fois pour plusieurs.
   --------------------------------------------------------------------------------------------- */
export interface ChampIdentiteDuo {
  cle: string
  label: string
  source: SourceVariable
  /* `null` quand la fiche de ce membre ne porte pas (encore) la donnée — à distinguer de
     `undefined`, réservé aux valeurs composées (voir `valeursChampsIdentiteDuo`). */
  valeurPrincipale: string | null
  valeurSecondaire: string | null
  defaut?: string
}

/* Liste les champs d'identité à afficher UN PAR MEMBRE plutôt qu'une fois pour le duo entier.
   Reprend la même détection que `preparerVariables` (un modèle qui déclare déjà au moins un champ
   `_2` a été pensé pour le duo, on ne le double pas davantage) à partir du résultat déjà calculé
   par `preparerVariables` plutôt que de la refaire : chaque variable porte encore sa `source`
   même quand elle n'a pas pu se résoudre seule (voir le commentaire de `preparerVariables`). */
export function champsIdentiteDuo(
  variables: VariableResolue[],
  destinataire: Profile,
  destinataireSecondaire: Profile | null,
  etablissement: Etablissement | null,
): ChampIdentiteDuo[] {
  if (!destinataireSecondaire) return []
  const modeleDejaPenseurPourLeDuo = variables.some((v) => v.source?.endsWith('_2'))
  if (modeleDejaPenseurPourLeDuo) return []
  return variables
    .filter((v): v is VariableResolue & { source: SourceVariable } => !!v.source && SOURCES_IDENTITE_PERSONNE.has(v.source as SourceVariable) && !v.estClauseMineur)
    .map((v) => ({
      cle: v.cle,
      label: v.label,
      source: v.source,
      valeurPrincipale: resoudreSource(v.source, destinataire, etablissement),
      valeurSecondaire: resoudreSource(v.source, destinataireSecondaire, etablissement),
      defaut: v.defaut,
    }))
}

/* Valeurs à substituer pour ces champs scindés — même cascade que pour un champ ordinaire
   (saisie > fiche > défaut courant, voir `preparerVariables`/LancerApprobationContrat.tsx), mais
   appliquée séparément à chaque membre. `valeursSecondaires` ne reçoit un champ que si sa valeur
   diffère VRAIMENT de celle du principal — même règle que `preparerVariables` pour ne pas dupliquer
   un paragraphe entier quand les deux étudiants partagent par exemple la même adresse. */
export function valeursChampsIdentiteDuo(
  champs: ChampIdentiteDuo[],
  complementsPrincipal: Record<string, string>,
  complementsSecondaire: Record<string, string>,
): { valeurs: Record<string, string>; valeursSecondaires: Record<string, string> } {
  const valeurs: Record<string, string> = {}
  const valeursSecondaires: Record<string, string> = {}
  for (const champ of champs) {
    const principale = complementsPrincipal[champ.cle] ?? champ.valeurPrincipale ?? champ.defaut
    const secondaire = complementsSecondaire[champ.cle] ?? champ.valeurSecondaire ?? champ.defaut
    if (principale !== undefined) valeurs[champ.cle] = principale
    if (secondaire !== undefined && secondaire !== principale) valeursSecondaires[champ.cle] = secondaire
  }
  return { valeurs, valeursSecondaires }
}

/* Pendant de `completsAReporterSurProfil`, mais pour le SECOND membre d'un duo quand le champ
   n'est pas un `_2` explicite du modèle (voir `champsIdentiteDuo` ci-dessus) : sa clé est alors la
   MÊME que celle du principal (`champ.cle`), `completsAReporterSurProfil` ne peut donc distinguer
   qui a tapé quoi — il continue de couvrir le principal sans y changer une ligne (sa valeur vit
   dans le même `complements` que les autres champs manuels de l'écran), ceci ne couvre que ce qui
   a été tapé dans le second champ, propre à cette liste. */
export function completsSecondaireAReporter(
  champs: ChampIdentiteDuo[],
  complementsSecondaire: Record<string, string>,
): ChampsProfilAReporter {
  const cible: ChampsProfilAReporter = {}
  for (const champ of champs) {
    if (champ.valeurSecondaire !== null) continue
    const valeur = complementsSecondaire[champ.cle]?.trim()
    if (!valeur) continue
    const colonne = SOURCES_VERS_PROFIL[champ.source]
    // `taux_horaire` n'est jamais un champ d'identité (voir SOURCES_IDENTITE_PERSONNE) : cette
    // branche n'est donc en pratique jamais atteinte, gardée seulement pour que le type de
    // `colonne` reste celui, plus large, de `SOURCES_VERS_PROFIL`.
    if (colonne && colonne !== 'taux_horaire_individuel') cible[colonne] = valeur
  }
  return cible
}

/* Clés communes à TOUS les élèves d'une classe collective, pour l'aperçu d'un lancement de
   contrats groupé (LancerApprobationContrat.tsx) — demande client du 2026-10-19 : le bloc des
   champs remplis automatiquement ne montrait que le premier élève, alors qu'un contrat part pour
   chacun. Les informations de chaque élève sont désormais listées sous son nom, et ce qui ne
   varie pas (établissement, vague, date du jour) reste affiché une seule fois en tête — le
   répéter sous chaque nom noierait justement ce qui les distingue.

   Deux conditions pour qu'une clé soit « commune », et la seconde n'est pas redondante : un
   champ d'identité que personne n'a renseigné (téléphone vide chez les quatre) a bien la même
   valeur partout, mais le ranger en « commun » laisserait croire que les élèves partagent un
   téléphone. Sa source le trahit, donc on s'y fie d'abord. */
export function clesCommunesAuxEleves(variablesParEleve: VariableResolue[][]): Set<string> {
  const [premier, ...autres] = variablesParEleve
  if (!premier) return new Set()
  return new Set(
    premier
      .filter((v) => !v.source || !SOURCES_IDENTITE_PERSONNE.has(v.source as SourceVariable))
      .filter((v) => autres.every((eleve) => eleve.find((x) => x.cle === v.cle)?.valeurAuto === v.valeurAuto))
      .map((v) => v.cle),
  )
}
