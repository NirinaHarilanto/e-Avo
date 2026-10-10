// Types écrits à la main en attendant la génération officielle depuis le schéma réel :
//   npx supabase gen types typescript --project-id <ref> > src/types/database.types.ts
// Reflètent le schéma des migrations 0001-0012 (voir supabase/migrations/).
// À régénérer et remplacer dès que l'accès direct au projet Supabase est disponible.

export type Role = 'etudiant' | 'professeur' | 'admin_etablissement'
export type ProfileStatus = 'pending' | 'approved' | 'suspended' | 'en_pause'
export type ProspectStatut = 'prospect' | 'diagnostic_planifie' | 'diagnostic_fait' | 'etudiant'
export type TypeProgrammeProspect = 'individuel' | 'duo' | 'collectif'
export type SessionType = 'individuel' | 'collectif'
// 'reportee' (0085) : absence à la clôture, séance reportée — distincte de 'annulee' (n'aura
// jamais lieu) et de 'terminee' (effectivement comptée, présence ou non).
export type SessionStatut = 'planifiee' | 'terminee' | 'annulee' | 'reportee'
export type InvitationStatut = 'en_attente' | 'acceptee' | 'excusee'
export type LedgerType = 'credit_professeur' | 'debit_etudiant'
export type CategorieDocument =
  | 'identite'
  | 'diplome_certification'
  | 'justificatif_domicile'
  | 'devis'
  | 'facture'
  | 'contrat'
  | 'support_pedagogique'
  | 'confidentiel'
  | 'autre'
export type StatutPaiement = 'attendu' | 'paye' | 'en_retard' | 'annule'
export type StatutDevis = 'brouillon' | 'envoye' | 'accepte' | 'refuse' | 'expire'
export type StatutFacture = 'emise' | 'envoyee' | 'payee' | 'en_retard' | 'annulee'
export type StatutContrat = 'brouillon' | 'envoye' | 'signe' | 'resilie'
export type StatutCohorte = 'a_venir' | 'en_cours' | 'terminee'
/* Niveau d'une classe au sein d'une promotion (0074), dérivé automatiquement du niveau CECRL
   estimé au quiz écrit — voir src/lib/classesCollectif.ts. */
export type NiveauClasse = 'beginner' | 'intermediate' | 'advanced'
/* Créneau horaire d'une classe (0074), réglé au niveau établissement (etablissements.creneau_*). */
export type CreneauClasse = 'matin' | 'midi' | 'soir'
export type StatutRendezVous = 'en_attente' | 'confirme' | 'refuse' | 'annule'

/* Pièce déposée par un candidat formateur (0082), dans le bucket privé `candidatures`. */
export interface FichierCandidature {
  chemin: string
  nom: string
  type: 'cv' | 'diplome'
}

export type StatutTimesheet = 'soumis' | 'valide' | 'refuse'

/* Une séance déclarée sur un TimeSheet (0081), figée au moment de l'envoi. */
export interface LigneTimesheet {
  hour_ledger_id: string
  session_id: string
  debut: string | null
  eleves: string
  heures: number
}

export interface LigneFacturation {
  description: string
  quantite: number
  prix_unitaire_ht: number
  tva_pct: number
}

export interface VariableTemplate {
  cle: string
  label: string
  // Origine automatique de la valeur (voir `SourceVariable` dans lib/contrats.ts) : absent ou
  // vide quand la variable doit être ressaisie à chaque contrat.
  source?: string
  // Valeur suggérée quand `source` est absent — reprise telle quelle dans le champ de saisie au
  // lancement de l'approbation, mais reste modifiable par l'admin.
  valeur_defaut?: string
}

export interface Database {
  public: {
    Tables: {
      etablissements: {
        Row: {
          id: string
          nom: string
          slug: string
          specialite: string | null
          couleur_accent: string | null
          logo_url: string | null
          calendly_url: string | null
          /* Forfait d'heures par défaut d'un étudiant en cours collectif (0069). */
          heures_forfait_collectif: number
          /* Nombre de jours avant une échéance à partir duquel la relance part (0070). */
          relance_echeance_jours: number
          /* Seuil de déclenchement de l'alerte « fin du volume d'heures » (modèle 5.3, 0095),
             en heures restantes. 5 par défaut, soit deux à trois séances. */
          seuil_alerte_heures_restantes: number
          /* Créneaux horaires des classes de cours collectif, réglables (0074) : 7h/12h/19h
             par défaut. */
          creneau_matin: string
          creneau_midi: string
          creneau_soir: string
          /* Section « Profil HOC » (0097, demande client du 2026-10-05) : identité
             administrative de l'établissement, réutilisée sur factures/devis/reçus/contrats.
             Colonnes publiques (même policy de lecture que `nom`/`specialite`) : le CIN de la
             directrice, lui, vit à part dans `etablissement_identite_privee`, admin seul. */
          directrice: string | null
          adresse: string | null
          telephone: string | null
          email: string | null
          site_web: string | null
          nif: string | null
          stat: string | null
          /* Forme juridique (0100, demande client du 2026-10-07) : dernière mention d'identité
             figée en dur dans les modèles de contrat (« [forme juridique à compléter] »). */
          forme_juridique: string | null
          /* Tampon de l'établissement (0104, demande client du 2026-10-09) : chemin dans le
             bucket Storage `tampons`, affiché sur factures/devis/contrats. `null` tant
             qu'aucun admin n'en a déposé un — aucun document n'en affiche alors. */
          tampon_path: string | null
          created_at: string
        }
        Insert: {
          id?: string
          nom: string
          slug: string
          specialite?: string | null
          couleur_accent?: string | null
          logo_url?: string | null
          calendly_url?: string | null
          heures_forfait_collectif?: number
          relance_echeance_jours?: number
          seuil_alerte_heures_restantes?: number
          creneau_matin?: string
          creneau_midi?: string
          creneau_soir?: string
          directrice?: string | null
          adresse?: string | null
          telephone?: string | null
          email?: string | null
          site_web?: string | null
          nif?: string | null
          stat?: string | null
          forme_juridique?: string | null
          tampon_path?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['etablissements']['Insert']>
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          etablissement_id: string
          prospect_id: string | null
          role: Role
          status: ProfileStatus
          nom: string | null
          prenom: string | null
          email: string | null
          telephone: string | null
          adresse: string | null
          ville: string | null
          date_naissance: string | null
          lieu_naissance: string | null
          whatsapp: string | null
          taux_horaire: number | null
          signature_path: string | null
          mot_de_passe_defini: boolean
          /* DUO (0054) : renseigné uniquement sur le profil « secondaire » (converti en second),
             pointe vers le profil « principal » qui porte réellement packages/sessions/
             paiements/contrats. Voir src/lib/duo.ts. */
          duo_partenaire_id: string | null
          duo_nom_groupe: string | null
          /* Mise en pause (0063, demande client du 2026-09-23) : motif obligatoire à la pause,
             conservé après une réactivation comme historique — jamais remis à null. */
          motif_pause: string | null
          pause_le: string | null
          pause_par: string | null
          /* Professeur recruté encore en phase d'intégration (0082). */
          statut_integration: 'en_integration' | null
          created_at: string
        }
        Insert: {
          id: string
          etablissement_id: string
          prospect_id?: string | null
          role?: Role
          status?: ProfileStatus
          nom?: string | null
          prenom?: string | null
          email?: string | null
          telephone?: string | null
          adresse?: string | null
          ville?: string | null
          date_naissance?: string | null
          lieu_naissance?: string | null
          whatsapp?: string | null
          taux_horaire?: number | null
          signature_path?: string | null
          mot_de_passe_defini?: boolean
          duo_partenaire_id?: string | null
          duo_nom_groupe?: string | null
          motif_pause?: string | null
          pause_le?: string | null
          pause_par?: string | null
          statut_integration?: 'en_integration' | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: []
      }
      prospects: {
        Row: {
          id: string
          etablissement_id: string
          statut: ProspectStatut
          nom: string
          prenom: string
          email: string
          telephone: string | null
          langue_visee: string | null
          objectif: string | null
          disponibilites: string | null
          type_programme: TypeProgrammeProspect | null
          /* Tarif choisi par le prospect (0054), repris automatiquement en packages à la
             conversion pour individuel/duo. */
          tarif_choisi_id: string | null
          /* Le prospect commence par une heure d'essai avant de s'engager (0057). */
          essai_demande: boolean
          /* Durée de la séance d'essai (1 à 3 h), facturée à l'heure hors forfait (0078). */
          essai_heures: number
          duo_partenaire_id: string | null
          duo_nom_groupe: string | null
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          statut?: ProspectStatut
          nom: string
          prenom: string
          email: string
          telephone?: string | null
          langue_visee?: string | null
          objectif?: string | null
          disponibilites?: string | null
          type_programme?: TypeProgrammeProspect | null
          tarif_choisi_id?: string | null
          essai_demande?: boolean
          essai_heures?: number
          duo_partenaire_id?: string | null
          duo_nom_groupe?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['prospects']['Insert']>
        Relationships: []
      }
      diagnostic_calls: {
        Row: {
          id: string
          etablissement_id: string
          prospect_id: string
          mene_par: string
          date_appel: string
          niveau_evalue: string | null
          notes: string | null
          rythme_convenu: string | null
          /* Questionnaire structuré rempli pendant l'appel (0050). Voir `ReponsesDiagnostic`
             dans src/lib/diagnostic.ts pour la liste des clés. */
          reponses: Record<string, string | string[] | undefined>
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          prospect_id: string
          mene_par: string
          date_appel: string
          niveau_evalue?: string | null
          notes?: string | null
          rythme_convenu?: string | null
          reponses?: Record<string, string | string[] | undefined>
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['diagnostic_calls']['Insert']>
        Relationships: []
      }
      tarifs: {
        Row: {
          id: string
          etablissement_id: string
          type_programme: TypeProgrammeProspect
          titre: string
          prix: number
          unite: string
          heures: number | null
          description: string | null
          ordre: number
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          type_programme: TypeProgrammeProspect
          titre: string
          prix: number
          unite?: string
          heures?: number | null
          description?: string | null
          ordre?: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['tarifs']['Insert']>
        Relationships: []
      }
      teacher_assignments: {
        Row: {
          id: string
          etablissement_id: string
          student_id: string
          teacher_id: string
          langue: string | null
          date_debut: string
          date_fin: string | null
          motif_changement: string | null
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          student_id: string
          teacher_id: string
          langue?: string | null
          date_debut: string
          date_fin?: string | null
          motif_changement?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['teacher_assignments']['Insert']>
        Relationships: []
      }
      sessions: {
        Row: {
          id: string
          etablissement_id: string
          teacher_id: string
          type: SessionType
          debut: string
          duree_minutes: number
          statut: SessionStatut
          /* Vague (promotion) à laquelle la séance appartient (0069) : planning commun au
             groupe, et décompte d'heures appliqué à tous ses inscrits à la clôture. Toujours
             renseigné pour une séance de classe (dérivé de cohort_classes.cohort_id, 0074),
             pour ne pas casser la clôture ni le décompte existants. */
          cohort_id: string | null
          /* Classe de niveau au sein de la promotion (0074), si la séance en vient une. */
          cohort_class_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          teacher_id: string
          type: SessionType
          debut: string
          duree_minutes: number
          statut?: SessionStatut
          cohort_id?: string | null
          cohort_class_id?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['sessions']['Insert']>
        Relationships: []
      }
      session_modifications: {
        Row: {
          id: string
          session_id: string
          etablissement_id: string
          modifie_par: string
          // 'reportee'/'absence_comptabilisee' (0085) : décision prise à la clôture d'une séance en
          // présence d'un absent, voir api/professeur/cloturer-seance.ts.
          type_modification: 'reprogrammee' | 'annulee' | 'reportee' | 'absence_comptabilisee'
          ancien_debut: string
          nouveau_debut: string | null
          ancienne_duree_minutes: number
          nouvelle_duree_minutes: number | null
          justificatif: string | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          etablissement_id: string
          modifie_par: string
          type_modification: 'reprogrammee' | 'annulee' | 'reportee' | 'absence_comptabilisee'
          ancien_debut: string
          nouveau_debut?: string | null
          ancienne_duree_minutes: number
          nouvelle_duree_minutes?: number | null
          justificatif?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['session_modifications']['Insert']>
        Relationships: []
      }
      session_enrollments: {
        Row: {
          id: string
          session_id: string
          student_id: string
          teacher_assignment_id: string | null
          invitation_statut: InvitationStatut
          present: boolean | null
          minutes_connecte: number | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          student_id: string
          teacher_assignment_id?: string | null
          invitation_statut?: InvitationStatut
          present?: boolean | null
          minutes_connecte?: number | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['session_enrollments']['Insert']>
        Relationships: []
      }
      demandes_forfait: {
        Row: {
          id: string
          etablissement_id: string
          student_id: string
          heures_demandees: number
          message: string | null
          statut: 'en_attente' | 'validee' | 'refusee'
          package_id: string | null
          motif_refus: string | null
          created_at: string
          decidee_le: string | null
          decidee_par_profile_id: string | null
        }
        Insert: {
          id?: string
          etablissement_id: string
          student_id: string
          heures_demandees: number
          message?: string | null
          statut?: 'en_attente' | 'validee' | 'refusee'
          package_id?: string | null
          motif_refus?: string | null
          created_at?: string
          decidee_le?: string | null
          decidee_par_profile_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['demandes_forfait']['Insert']>
        Relationships: []
      }
      packages: {
        Row: {
          id: string
          etablissement_id: string
          student_id: string
          type_programme: TypeProgrammeProspect
          total_heures: number
          montant: number | null
          echeance: string | null
          essai: boolean
          tarif_vise_id: string | null
          essai_resultat: 'poursuivi' | 'arrete' | null
          essai_decide_le: string | null
          /* Horodatage de l'e-mail « il vous reste X heures » (modèle 5.3, 0095) — null = jamais
             alerté. Marqué une seule fois par forfait, sinon le cron enverrait l'alerte chaque
             matin tant que le restant reste sous le seuil. */
          email_fin_heures_le: string | null
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          student_id: string
          type_programme?: TypeProgrammeProspect
          total_heures: number
          montant?: number | null
          echeance?: string | null
          essai?: boolean
          tarif_vise_id?: string | null
          essai_resultat?: 'poursuivi' | 'arrete' | null
          essai_decide_le?: string | null
          email_fin_heures_le?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['packages']['Insert']>
        Relationships: []
      }
      cohorts: {
        Row: {
          id: string
          etablissement_id: string
          nom: string
          langue: string | null
          date_debut: string
          date_fin: string
          capacite_max: number | null
          statut: StatutCohorte
          /* Professeur qui accompagne la vague (0069). */
          teacher_id: string | null
          /* Surcharge du forfait d'heures de l'établissement pour cette vague (0069). */
          heures_forfait: number | null
          created_by_profile_id: string
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          nom: string
          langue?: string | null
          date_debut: string
          date_fin: string
          capacite_max?: number | null
          statut?: StatutCohorte
          teacher_id?: string | null
          heures_forfait?: number | null
          created_by_profile_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['cohorts']['Insert']>
        Relationships: []
      }
      /* Classe de niveau au sein d'une promotion (0074) : niveau, créneau et professeur
         propres, plusieurs classes du même niveau pouvant coexister (règle des 3-7 élèves). */
      cohort_classes: {
        Row: {
          id: string
          etablissement_id: string
          cohort_id: string
          niveau: NiveauClasse
          nom: string | null
          creneau: CreneauClasse
          teacher_id: string | null
          created_by_profile_id: string
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          cohort_id: string
          niveau: NiveauClasse
          nom?: string | null
          creneau?: CreneauClasse
          teacher_id?: string | null
          created_by_profile_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['cohort_classes']['Insert']>
        Relationships: []
      }
      quiz_questions: {
        Row: {
          id: string
          etablissement_id: string
          ordre: number
          enonce: string
          options: string[]
          /* Index dans `options`, jamais exposé au visiteur (0051). */
          bonne_reponse: number
          actif: boolean
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          ordre: number
          enonce: string
          options: string[]
          bonne_reponse: number
          actif?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['quiz_questions']['Insert']>
        Relationships: []
      }
      creneaux_test_positionnement: {
        Row: {
          id: string
          etablissement_id: string
          cohort_id: string
          debut: string
          duree_minutes: number
          capacite_max: number | null
          lien_visio: string | null
          /* Événement Google Calendar correspondant, pour déplacer/supprimer le lien Meet
             quand le créneau est modifié ou retiré (0053). */
          google_event_id: string | null
          actif: boolean
          created_by_profile_id: string
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          cohort_id: string
          debut: string
          duree_minutes?: number
          capacite_max?: number | null
          lien_visio?: string | null
          google_event_id?: string | null
          actif?: boolean
          created_by_profile_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['creneaux_test_positionnement']['Insert']>
        Relationships: []
      }
      test_positionnement_inscriptions: {
        Row: {
          id: string
          etablissement_id: string
          creneau_id: string
          prospect_id: string
          reponses: { question_id: string; choix: number | null }[]
          score: number
          total: number
          niveau_estime: string | null
          bilan: string | null
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          creneau_id: string
          prospect_id: string
          reponses?: { question_id: string; choix: number | null }[]
          score?: number
          total?: number
          niveau_estime?: string | null
          bilan?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['test_positionnement_inscriptions']['Insert']>
        Relationships: []
      }
      cohort_enrollments: {
        Row: {
          id: string
          etablissement_id: string
          cohort_id: string
          /* Classe de niveau assignée au sein de la promotion (0074). Nullable : vague legacy
             sans classes, ou étudiant en attente d'affectation. */
          cohort_class_id: string | null
          student_id: string
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          cohort_id: string
          cohort_class_id?: string | null
          student_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['cohort_enrollments']['Insert']>
        Relationships: []
      }
      hour_ledger: {
        Row: {
          id: string
          etablissement_id: string
          session_id: string
          student_id: string | null
          teacher_id: string | null
          type_ecriture: LedgerType
          heures: number
          teacher_payment_id: string | null
          /* TimeSheet sur lequel ce crédit a été déclaré (0081). */
          timesheet_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          session_id: string
          student_id?: string | null
          teacher_id?: string | null
          type_ecriture: LedgerType
          heures: number
          teacher_payment_id?: string | null
          timesheet_id?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['hour_ledger']['Insert']>
        Relationships: []
      }
      candidatures_formateurs: {
        Row: {
          id: string
          etablissement_id: string
          prenom: string
          nom: string
          email: string
          telephone: string | null
          ville: string | null
          motivation: string
          experiences: string
          diplome_declare: 'licence_anglais' | 'tefl' | 'licence_et_tefl' | 'autre'
          diplome_autre_precision: string | null
          fichiers: FichierCandidature[]
          statut: 'recue' | 'preselection' | 'tests' | 'simulation' | 'integration' | 'integre' | 'refusee'
          documents_verifies: boolean
          preselection: Record<string, string | number | boolean | null | undefined>
          tests: Record<string, unknown>
          simulation: Record<string, string | number | boolean | null | undefined>
          integration: Record<string, { fait?: boolean; date?: string | null } | undefined>
          notes: string | null
          motif_refus: string | null
          professeur_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          prenom: string
          nom: string
          email: string
          telephone?: string | null
          ville?: string | null
          motivation: string
          experiences: string
          diplome_declare: 'licence_anglais' | 'tefl' | 'licence_et_tefl' | 'autre'
          diplome_autre_precision?: string | null
          fichiers?: FichierCandidature[]
          statut?: 'recue' | 'preselection' | 'tests' | 'simulation' | 'integration' | 'integre' | 'refusee'
          documents_verifies?: boolean
          preselection?: Record<string, string | number | boolean | null | undefined>
          tests?: Record<string, unknown>
          simulation?: Record<string, string | number | boolean | null | undefined>
          integration?: Record<string, { fait?: boolean; date?: string | null } | undefined>
          notes?: string | null
          motif_refus?: string | null
          professeur_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['candidatures_formateurs']['Insert']>
        Relationships: []
      }
      timesheets: {
        Row: {
          id: string
          etablissement_id: string
          teacher_id: string
          numero: string
          periode_debut: string
          periode_fin: string
          total_heures: number
          taux_horaire: number | null
          montant: number | null
          lignes: LigneTimesheet[]
          commentaire: string | null
          statut: StatutTimesheet
          motif_refus: string | null
          soumis_le: string
          traite_le: string | null
          traite_par: string | null
          teacher_payment_id: string | null
          invoice_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          teacher_id: string
          numero: string
          periode_debut: string
          periode_fin: string
          total_heures: number
          taux_horaire?: number | null
          montant?: number | null
          lignes?: LigneTimesheet[]
          commentaire?: string | null
          statut?: StatutTimesheet
          motif_refus?: string | null
          soumis_le?: string
          traite_le?: string | null
          traite_par?: string | null
          teacher_payment_id?: string | null
          invoice_id?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['timesheets']['Insert']>
        Relationships: []
      }
      google_integrations: {
        Row: {
          etablissement_id: string
          google_email: string
          refresh_token_chiffre: string
          scope: string | null
          connecte_par: string | null
          connecte_le: string
          derniere_erreur: string | null
        }
        Insert: {
          etablissement_id: string
          google_email: string
          refresh_token_chiffre: string
          scope?: string | null
          connecte_par?: string | null
          connecte_le?: string
          derniere_erreur?: string | null
        }
        Update: Partial<Database['public']['Tables']['google_integrations']['Insert']>
        Relationships: []
      }
      etablissement_identite_privee: {
        Row: {
          etablissement_id: string
          cin_directrice: string | null
          updated_at: string
        }
        Insert: {
          etablissement_id: string
          cin_directrice?: string | null
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['etablissement_identite_privee']['Insert']>
        Relationships: []
      }
      google_integrations_personnelles: {
        Row: {
          profile_id: string
          etablissement_id: string
          google_email: string
          refresh_token_chiffre: string
          scope: string | null
          connecte_le: string
          derniere_erreur: string | null
        }
        Insert: {
          profile_id: string
          etablissement_id: string
          google_email: string
          refresh_token_chiffre: string
          scope?: string | null
          connecte_le?: string
          derniere_erreur?: string | null
        }
        Update: Partial<Database['public']['Tables']['google_integrations_personnelles']['Insert']>
        Relationships: []
      }
      video_sessions: {
        Row: {
          id: string
          session_id: string
          provider: string | null
          room_ref: string | null
          statut: string | null
          enregistrement_url: string | null
          google_event_id: string | null
          organisateur_email: string | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          provider?: string | null
          room_ref?: string | null
          statut?: string | null
          enregistrement_url?: string | null
          google_event_id?: string | null
          organisateur_email?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['video_sessions']['Insert']>
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          etablissement_id: string
          owner_profile_id: string
          owner_role: Role
          uploaded_by_profile_id: string
          categorie: CategorieDocument
          /* Étiquette libre d'une catégorie personnalisée (0109) — n'a de sens que lorsque
             `categorie === 'autre'`, sinon toujours `null`. */
          categorie_libre: string | null
          nom_original: string
          mime_type: string
          taille_octets: number
          storage_path: string
          etablissement_wide: boolean
          /* Dossier de classement (0058). Nul = racine de l'espace documentaire. */
          dossier_id: string | null
          /* Support de cours joint à un compte rendu (0087, demande client du 2026-09-30) — nul
             pour tout document déposé autrement. `on delete set null` : supprimer le compte
             rendu ne doit pas faire disparaître la ligne à l'aveugle côté base, voir
             api/admin/supprimer-compte-rendu.ts pour le nettoyage explicite. */
          session_report_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          owner_profile_id: string
          // Écrasé par le trigger documents_before_insert (migration 0018) : jamais fait
          // confiance depuis le client, mais requis par le type Row — envoyer une valeur
          // quelconque, elle sera recalculée côté serveur.
          owner_role?: Role
          uploaded_by_profile_id: string
          categorie?: CategorieDocument
          categorie_libre?: string | null
          nom_original: string
          mime_type: string
          taille_octets: number
          // Écrasé par le même trigger — ne jamais fournir de valeur côté client.
          storage_path?: string
          etablissement_wide?: boolean
          dossier_id?: string | null
          session_report_id?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['documents']['Insert']>
        Relationships: []
      }
      document_dossiers: {
        Row: {
          id: string
          etablissement_id: string
          proprietaire_profile_id: string
          proprietaire_role: Role
          parent_id: string | null
          nom: string
          created_by_profile_id: string
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          proprietaire_profile_id: string
          // Recalculé par le trigger document_dossiers_avant_ecriture (0058), comme
          // documents.owner_role : jamais fait confiance depuis le navigateur.
          proprietaire_role?: Role
          parent_id?: string | null
          nom: string
          created_by_profile_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['document_dossiers']['Insert']>
        Relationships: []
      }
      document_partages: {
        Row: {
          id: string
          document_id: string
          destinataire_profile_id: string
          partage_par_profile_id: string
          /* Figé à l'insertion par trigger (0060) : le destinataire ne peut pas toujours lire
             le profil de l'émetteur. */
          partage_par_nom: string | null
          message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          destinataire_profile_id: string
          partage_par_profile_id: string
          partage_par_nom?: string | null
          message?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['document_partages']['Insert']>
        Relationships: []
      }
      document_permissions: {
        Row: {
          id: string
          document_id: string
          profile_id: string
          niveau: 'lecture' | 'ecriture'
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          profile_id: string
          niveau: 'lecture' | 'ecriture'
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['document_permissions']['Insert']>
        Relationships: []
      }
      session_reports: {
        Row: {
          id: string
          etablissement_id: string
          session_id: string
          teacher_id: string
          /* Template structuré du compte rendu (0052) — voir src/lib/compteRendu.ts pour le
             détail des champs et des valeurs autorisées. */
          objectifs: string[]
          lecons_abordees: string | null
          contenu_cours: string | null
          nouveau_vocabulaire: string | null
          erreurs_importantes: string | null
          points_forts: string | null
          points_a_ameliorer: string | null
          devoirs: string | null
          progres: string | null
          priorites_prochain_cours: string | null
          conseils_prochain_professeur: string | null
          remarques: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          session_id: string
          teacher_id: string
          objectifs?: string[]
          lecons_abordees?: string | null
          contenu_cours?: string | null
          nouveau_vocabulaire?: string | null
          erreurs_importantes?: string | null
          points_forts?: string | null
          points_a_ameliorer?: string | null
          devoirs?: string | null
          progres?: string | null
          priorites_prochain_cours?: string | null
          conseils_prochain_professeur?: string | null
          remarques?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['session_reports']['Insert']>
        Relationships: []
      }
      student_payments: {
        Row: {
          id: string
          etablissement_id: string
          student_id: string | null
          prospect_id: string | null
          package_id: string | null
          montant: number
          devise: string
          statut: StatutPaiement
          moyen_paiement: string | null
          date_echeance: string | null
          date_paiement: string | null
          reference: string | null
          notes: string | null
          /* Cumul des versements enregistrés, tenu à jour par trigger (0049). Le statut
             « payé partiellement » s'en déduit, il n'existe pas dans l'enum. */
          montant_regle: number
          supprime_le: string | null
          supprime_par: string | null
          motif_suppression: string | null
          created_by_profile_id: string
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          student_id?: string | null
          prospect_id?: string | null
          package_id?: string | null
          montant: number
          devise?: string
          statut?: StatutPaiement
          moyen_paiement?: string | null
          date_echeance?: string | null
          date_paiement?: string | null
          reference?: string | null
          notes?: string | null
          montant_regle?: number
          supprime_le?: string | null
          supprime_par?: string | null
          motif_suppression?: string | null
          created_by_profile_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['student_payments']['Insert']>
        Relationships: []
      }
      teacher_payments: {
        Row: {
          id: string
          etablissement_id: string
          teacher_id: string
          periode_debut: string | null
          periode_fin: string | null
          montant: number
          devise: string
          statut: StatutPaiement
          moyen_paiement: string | null
          date_echeance: string | null
          date_paiement: string | null
          reference: string | null
          notes: string | null
          mode_remuneration: 'horaire' | 'mensuel'
          montant_regle: number
          supprime_le: string | null
          supprime_par: string | null
          motif_suppression: string | null
          created_by_profile_id: string
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          teacher_id: string
          periode_debut?: string | null
          periode_fin?: string | null
          montant: number
          devise?: string
          statut?: StatutPaiement
          moyen_paiement?: string | null
          date_echeance?: string | null
          date_paiement?: string | null
          reference?: string | null
          notes?: string | null
          mode_remuneration?: 'horaire' | 'mensuel'
          montant_regle?: number
          supprime_le?: string | null
          supprime_par?: string | null
          motif_suppression?: string | null
          created_by_profile_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['teacher_payments']['Insert']>
        Relationships: []
      }
      paiement_versements: {
        Row: {
          id: string
          etablissement_id: string
          /* Exactement l'un des deux est renseigné (contrainte
             paiement_versements_une_seule_cible, 0049). */
          student_payment_id: string | null
          teacher_payment_id: string | null
          montant: number
          date_versement: string
          moyen_paiement: string | null
          reference: string | null
          notes: string | null
          created_by_profile_id: string
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          student_payment_id?: string | null
          teacher_payment_id?: string | null
          montant: number
          date_versement?: string
          moyen_paiement?: string | null
          reference?: string | null
          notes?: string | null
          created_by_profile_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['paiement_versements']['Insert']>
        Relationships: []
      }
      paiement_echeances: {
        Row: {
          id: string
          etablissement_id: string
          student_payment_id: string
          libelle: string | null
          montant: number
          date_echeance: string
          relance_envoyee_le: string | null
          reglee_le: string | null
          created_by_profile_id: string
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          student_payment_id: string
          libelle?: string | null
          montant: number
          date_echeance: string
          relance_envoyee_le?: string | null
          reglee_le?: string | null
          created_by_profile_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['paiement_echeances']['Insert']>
        Relationships: []
      }
      quotes: {
        Row: {
          id: string
          etablissement_id: string
          student_id: string
          numero: string
          statut: StatutDevis
          objet: string | null
          lignes: LigneFacturation[]
          montant_ht: number
          montant_tva: number
          montant_ttc: number
          date_emission: string
          date_validite: string | null
          notes: string | null
          created_by_profile_id: string
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          student_id: string
          numero: string
          statut?: StatutDevis
          objet?: string | null
          lignes?: LigneFacturation[]
          montant_ht?: number
          montant_tva?: number
          montant_ttc?: number
          date_emission?: string
          date_validite?: string | null
          notes?: string | null
          created_by_profile_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['quotes']['Insert']>
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          etablissement_id: string
          /* Exactement l'un des deux est renseigné (contrainte invoices_destinataire_unique,
             0029) : student_id pour une facture/reçu étudiant, teacher_id pour une facture
             professeur. */
          student_id: string | null
          teacher_id: string | null
          quote_id: string | null
          payment_id: string | null
          teacher_payment_id: string | null
          numero: string
          statut: StatutFacture
          objet: string | null
          lignes: LigneFacturation[]
          montant_ht: number
          montant_tva: number
          montant_ttc: number
          date_emission: string
          date_echeance: string | null
          date_paiement: string | null
          notes: string | null
          /* Horodatage de l'e-mail annonçant ce reçu/facture à l'élève (modèle 2.3, 0095) —
             null = jamais annoncé. Le reçu naît d'un trigger (0030), qui ne peut pas envoyer
             d'e-mail : c'est le cron quotidien qui reprend les reçus non marqués. */
          email_envoye_le: string | null
          created_by_profile_id: string
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          student_id?: string | null
          teacher_id?: string | null
          quote_id?: string | null
          payment_id?: string | null
          teacher_payment_id?: string | null
          numero: string
          statut?: StatutFacture
          objet?: string | null
          lignes?: LigneFacturation[]
          montant_ht?: number
          montant_tva?: number
          montant_ttc?: number
          date_emission?: string
          date_echeance?: string | null
          date_paiement?: string | null
          notes?: string | null
          email_envoye_le?: string | null
          created_by_profile_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          etablissement_id: string
          destinataire_profile_id: string
          type: string
          titre: string
          message: string | null
          lien: string | null
          lu: boolean
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          destinataire_profile_id: string
          type: string
          titre: string
          message?: string | null
          lien?: string | null
          lu?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>
        Relationships: []
      }
      /* Messagerie interne (0090) : un humain écrit à un humain, avec objet et fil de réponses —
         à ne pas confondre avec `notifications`, signal système à sens unique. Le contenu est
         immuable après envoi (trigger `messages_contenu_immuable`), seul `lu` bouge. */
      messages: {
        Row: {
          id: string
          etablissement_id: string
          expediteur_profile_id: string
          destinataire_profile_id: string
          objet: string
          corps: string
          parent_id: string | null
          lu: boolean
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          expediteur_profile_id: string
          destinataire_profile_id: string
          objet: string
          corps: string
          parent_id?: string | null
          lu?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['messages']['Insert']>
        Relationships: []
      }
      /* Modèles d'e-mails du parcours apprenant (0091), repris du document client
         « HOC_Templates_emails_apprenants ». `reference` (« 1.1 », « 4.6 »…) est la clé stable
         par laquelle les envois automatiques retrouvent leur modèle. */
      email_templates: {
        Row: {
          id: string
          etablissement_id: string
          reference: string | null
          categorie: string
          nom: string
          objet: string
          corps: string
          quand: string | null
          piece_jointe_attendue: string | null
          ordre: number
          actif: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          reference?: string | null
          categorie: string
          nom: string
          objet: string
          corps: string
          quand?: string | null
          piece_jointe_attendue?: string | null
          ordre?: number
          actif?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['email_templates']['Insert']>
        Relationships: []
      }
      /* Journal des envois, qui sert aussi de tiroir à brouillons (choix client du 2026-10-01 :
         « Enregistrer » met le mail préparé de côté sans toucher au modèle). */
      email_envois: {
        Row: {
          id: string
          etablissement_id: string
          template_id: string | null
          destinataires_profile_ids: string[]
          copies_profile_ids: string[]
          destinataires_emails: string[]
          objet: string
          corps: string
          piece_jointe_nom: string | null
          piece_jointe_chemin: string | null
          statut: 'brouillon' | 'envoye' | 'echec'
          erreur: string | null
          envoye_le: string | null
          cree_par_profile_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          template_id?: string | null
          destinataires_profile_ids?: string[]
          copies_profile_ids?: string[]
          destinataires_emails?: string[]
          objet: string
          corps: string
          piece_jointe_nom?: string | null
          piece_jointe_chemin?: string | null
          statut?: 'brouillon' | 'envoye' | 'echec'
          erreur?: string | null
          envoye_le?: string | null
          cree_par_profile_id: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['email_envois']['Insert']>
        Relationships: []
      }
      /* Constantes de la maison injectées dans les modèles (0093) : liens de réservation, numéros
         Orange Money/Mvola, dates de test oral. Une valeur vide fait tomber la ligne qui la porte
         plutôt que d'exposer un gabarit nu (voir src/lib/templatesEmail.ts). */
      email_variables: {
        Row: {
          id: string
          etablissement_id: string
          cle: string
          libelle: string
          valeur: string | null
          ordre: number
          updated_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          cle: string
          libelle: string
          valeur?: string | null
          ordre?: number
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['email_variables']['Insert']>
        Relationships: []
      }
      contract_templates: {
        Row: {
          id: string
          etablissement_id: string
          nom: string
          public_cible: Role
          corps_template: string
          variables_disponibles: VariableTemplate[]
          actif: boolean
          created_by_profile_id: string
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          nom: string
          public_cible: Role
          corps_template: string
          variables_disponibles?: VariableTemplate[]
          actif?: boolean
          created_by_profile_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['contract_templates']['Insert']>
        Relationships: []
      }
      contracts: {
        Row: {
          id: string
          etablissement_id: string
          template_id: string | null
          destinataire_profile_id: string
          destinataire_role: Role
          /* Second membre d'un binôme DUO devant aussi signer ce contrat (0066). Null pour tout
             contrat individuel/professeur. */
          destinataire_secondaire_profile_id: string | null
          titre: string
          corps_genere: string
          variables_valeurs: Record<string, string>
          statut: StatutContrat
          date_envoi: string | null
          date_signature: string | null
          date_resiliation: string | null
          document_id: string | null
          notes: string | null
          signe_etablissement_at: string | null
          signe_etablissement_par: string | null
          signe_destinataire_at: string | null
          ip_signature_destinataire: string | null
          user_agent_signature_destinataire: string | null
          signe_destinataire_secondaire_at: string | null
          ip_signature_destinataire_secondaire: string | null
          user_agent_signature_destinataire_secondaire: string | null
          date_limite_signature: string | null
          created_by_profile_id: string
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          template_id?: string | null
          destinataire_profile_id: string
          destinataire_role: Role
          destinataire_secondaire_profile_id?: string | null
          titre: string
          corps_genere: string
          variables_valeurs?: Record<string, string>
          statut?: StatutContrat
          date_envoi?: string | null
          date_signature?: string | null
          date_resiliation?: string | null
          document_id?: string | null
          notes?: string | null
          signe_etablissement_at?: string | null
          signe_etablissement_par?: string | null
          signe_destinataire_at?: string | null
          ip_signature_destinataire?: string | null
          user_agent_signature_destinataire?: string | null
          signe_destinataire_secondaire_at?: string | null
          ip_signature_destinataire_secondaire?: string | null
          user_agent_signature_destinataire_secondaire?: string | null
          date_limite_signature?: string | null
          created_by_profile_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['contracts']['Insert']>
        Relationships: []
      }
      platform_admins: {
        Row: {
          id: string
          email: string | null
          nom: string | null
          prenom: string | null
          created_at: string
        }
        Insert: {
          id: string
          email?: string | null
          nom?: string | null
          prenom?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['platform_admins']['Insert']>
        Relationships: []
      }
      niveau_evaluations: {
        Row: {
          id: string
          etablissement_id: string
          student_id: string
          niveau: string
          date_evaluation: string
          evalue_par: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          student_id: string
          niveau: string
          date_evaluation?: string
          evalue_par: string
          notes?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['niveau_evaluations']['Insert']>
        Relationships: []
      }
      session_satisfaction: {
        Row: {
          id: string
          etablissement_id: string
          session_id: string
          student_id: string
          note_globale: number
          note_pedagogie: number | null
          commentaire: string | null
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          session_id: string
          student_id: string
          note_globale: number
          note_pedagogie?: number | null
          commentaire?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['session_satisfaction']['Insert']>
        Relationships: []
      }
      reservation_parametres: {
        Row: {
          etablissement_id: string
          duree_minutes: number
          delai_minimum_heures: number
          horizon_jours: number
          pause_minutes: number
          fuseau: string
          validation_requise: boolean
          updated_at: string
        }
        Insert: {
          etablissement_id: string
          duree_minutes?: number
          delai_minimum_heures?: number
          horizon_jours?: number
          pause_minutes?: number
          fuseau?: string
          validation_requise?: boolean
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['reservation_parametres']['Insert']>
        Relationships: []
      }
      creneaux_disponibilites: {
        Row: {
          id: string
          etablissement_id: string
          jour_semaine: number
          heure_debut: string
          heure_fin: string
          actif: boolean
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          jour_semaine: number
          heure_debut: string
          heure_fin: string
          actif?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['creneaux_disponibilites']['Insert']>
        Relationships: []
      }
      rendez_vous: {
        Row: {
          id: string
          etablissement_id: string
          prospect_id: string
          debut: string
          duree_minutes: number
          statut: StatutRendezVous
          google_event_id: string | null
          lien_meet: string | null
          message: string | null
          motif_refus: string | null
          valide_par: string | null
          valide_le: string | null
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          prospect_id: string
          debut: string
          duree_minutes: number
          statut?: StatutRendezVous
          google_event_id?: string | null
          lien_meet?: string | null
          message?: string | null
          motif_refus?: string | null
          valide_par?: string | null
          valide_le?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['rendez_vous']['Insert']>
        Relationships: []
      }
      evenements_admin: {
        Row: {
          id: string
          etablissement_id: string
          titre: string
          debut: string
          duree_minutes: number
          participants_obligatoires: string[]
          participants_optionnels: string[]
          notes: string | null
          google_event_id: string | null
          lien_meet: string | null
          annule: boolean
          cree_par: string | null
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          titre: string
          debut: string
          duree_minutes: number
          participants_obligatoires?: string[]
          participants_optionnels?: string[]
          notes?: string | null
          google_event_id?: string | null
          lien_meet?: string | null
          annule?: boolean
          cree_par?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['evenements_admin']['Insert']>
        Relationships: []
      }
    }
    Views: {
      /* Liste des personnes à qui écrire un message (0090). Vue `security definer` à dessein :
         `profiles` ne laisse voir à un élève que lui-même et son professeur, cette vue n'expose
         que le nom et le rôle de chacun — jamais e-mail, téléphone ni taux horaire. */
      annuaire_etablissement: {
        Row: {
          id: string
          prenom: string | null
          nom: string | null
          role: Role
          etablissement_id: string
        }
        Relationships: []
      }
      google_integration_statut: {
        Row: {
          etablissement_id: string
          google_email: string
          connecte_le: string
          derniere_erreur: string | null
          /* Permissions effectivement accordées par Google, exposées par la migration 0106 :
             l'écran doit pouvoir dire qu'un compte est branché SANS la permission d'agenda. */
          scope: string | null
        }
        Relationships: []
      }
      google_integration_personnelle_statut: {
        Row: {
          google_email: string
          connecte_le: string
          derniere_erreur: string | null
          /* Permissions accordées par Google (0107) : sans `calendar.events`, le compte est resté
             en lecture seule et ne peut pas héberger les réunions de ses cours. */
          scope: string | null
        }
        Relationships: []
      }
      /* Qui, parmi les professeurs, a connecté son agenda Google — et avec quelles permissions
         (0107). Réservée aux admins par la clause WHERE de la vue. */
      google_agendas_professeurs_statut: {
        Row: {
          profile_id: string
          prenom: string | null
          nom: string | null
          email: string | null
          google_email: string | null
          connecte_le: string | null
          derniere_erreur: string | null
          scope: string | null
        }
        Relationships: []
      }
      etablissement_cin_directrice: {
        Row: {
          etablissement_id: string
          cin_directrice: string | null
        }
        Relationships: []
      }
      student_hours_summary: {
        Row: {
          student_id: string
          etablissement_id: string
          heures_consommees: number
        }
        Relationships: []
      }
      teacher_hours_summary: {
        Row: {
          teacher_id: string
          etablissement_id: string
          heures_enseignees: number
        }
        Relationships: []
      }
    }
    Functions: {
      attribuer_professeur: {
        Args: {
          p_student_id: string
          p_teacher_id: string
          p_langue?: string | null
          p_motif?: string | null
        }
        Returns: {
          nouvelle_affectation_id: string
          seances_individuelles_transferees: number
          seances_collectives_desinscrites: number
        }[]
      }
      current_etablissement_id: {
        Args: Record<string, never>
        Returns: string
      }
      /* Date de démarrage de la prochaine vague « à venir » (0102) : seule information des vagues
         ouverte au public, pour la carte Collectif de la page Cours & tarifs. */
      prochaine_vague_publique: {
        Args: { p_slug: string }
        Returns: string | null
      }
      is_admin_etablissement: {
        Args: Record<string, never>
        Returns: boolean
      }
      numero_prochain_recu: {
        Args: { p_payment_id: string }
        Returns: string
      }
      verifier_limite_debit: {
        Args: { p_cle: string; p_max: number; p_fenetre_secondes: number }
        Returns: boolean
      }
    }
  }
}
