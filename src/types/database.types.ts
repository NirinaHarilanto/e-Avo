// Types écrits à la main en attendant la génération officielle depuis le schéma réel :
//   npx supabase gen types typescript --project-id <ref> > src/types/database.types.ts
// Reflètent le schéma des migrations 0001-0012 (voir supabase/migrations/).
// À régénérer et remplacer dès que l'accès direct au projet Supabase est disponible.

export type Role = 'etudiant' | 'professeur' | 'admin_etablissement'
export type ProfileStatus = 'pending' | 'approved' | 'suspended'
export type ProspectStatut = 'prospect' | 'diagnostic_planifie' | 'diagnostic_fait' | 'etudiant'
export type TypeProgrammeProspect = 'individuel' | 'duo' | 'collectif'
export type SessionType = 'individuel' | 'collectif'
export type SessionStatut = 'planifiee' | 'terminee' | 'annulee'
export type StatutChangementSeance = 'aucun' | 'en_attente'
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
export type StatutRendezVous = 'en_attente' | 'confirme' | 'refuse' | 'annule'

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
          debut_propose: string | null
          duree_minutes_propose: number | null
          justificatif_changement: string | null
          changement_demande_par: string | null
          changement_demande_le: string | null
          changement_statut: StatutChangementSeance
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
          debut_propose?: string | null
          duree_minutes_propose?: number | null
          justificatif_changement?: string | null
          changement_demande_par?: string | null
          changement_demande_le?: string | null
          changement_statut?: StatutChangementSeance
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['sessions']['Insert']>
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
      packages: {
        Row: {
          id: string
          etablissement_id: string
          student_id: string
          type_programme: TypeProgrammeProspect
          total_heures: number
          montant: number | null
          echeance: string | null
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
          created_by_profile_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['cohorts']['Insert']>
        Relationships: []
      }
      cohort_enrollments: {
        Row: {
          id: string
          etablissement_id: string
          cohort_id: string
          student_id: string
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          cohort_id: string
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
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['hour_ledger']['Insert']>
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
          nom_original: string
          mime_type: string
          taille_octets: number
          storage_path: string
          etablissement_wide: boolean
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
          nom_original: string
          mime_type: string
          taille_octets: number
          // Écrasé par le même trigger — ne jamais fournir de valeur côté client.
          storage_path?: string
          etablissement_wide?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['documents']['Insert']>
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
          themes: string | null
          resume: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          session_id: string
          teacher_id: string
          themes?: string | null
          resume?: string | null
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
          student_id: string
          package_id: string | null
          montant: number
          devise: string
          statut: StatutPaiement
          moyen_paiement: string | null
          date_echeance: string | null
          date_paiement: string | null
          reference: string | null
          notes: string | null
          created_by_profile_id: string
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          student_id: string
          package_id?: string | null
          montant: number
          devise?: string
          statut?: StatutPaiement
          moyen_paiement?: string | null
          date_echeance?: string | null
          date_paiement?: string | null
          reference?: string | null
          notes?: string | null
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
          created_by_profile_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['teacher_payments']['Insert']>
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
      google_integration_statut: {
        Row: {
          etablissement_id: string
          google_email: string
          connecte_le: string
          derniere_erreur: string | null
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
      is_admin_etablissement: {
        Args: Record<string, never>
        Returns: boolean
      }
    }
  }
}
