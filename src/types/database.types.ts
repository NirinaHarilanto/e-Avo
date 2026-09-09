// Types écrits à la main en attendant la génération officielle depuis le schéma réel :
//   npx supabase gen types typescript --project-id <ref> > src/types/database.types.ts
// Reflètent le schéma des migrations 0001-0012 (voir supabase/migrations/).
// À régénérer et remplacer dès que l'accès direct au projet Supabase est disponible.

export type Role = 'etudiant' | 'professeur' | 'admin_etablissement'
export type ProfileStatus = 'pending' | 'approved' | 'suspended'
export type ProspectStatut = 'prospect' | 'diagnostic_planifie' | 'diagnostic_fait' | 'etudiant'
export type SessionType = 'individuel' | 'collectif'
export type SessionStatut = 'planifiee' | 'terminee' | 'annulee'
export type InvitationStatut = 'en_attente' | 'acceptee' | 'excusee'
export type LedgerType = 'credit_professeur' | 'debit_etudiant'

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
          created_at: string
        }
        Insert: {
          id?: string
          nom: string
          slug: string
          specialite?: string | null
          couleur_accent?: string | null
          logo_url?: string | null
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
          total_heures: number
          echeance: string | null
          created_at: string
        }
        Insert: {
          id?: string
          etablissement_id: string
          student_id: string
          total_heures: number
          echeance?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['packages']['Insert']>
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
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['hour_ledger']['Insert']>
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
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          provider?: string | null
          room_ref?: string | null
          statut?: string | null
          enregistrement_url?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['video_sessions']['Insert']>
        Relationships: []
      }
    }
    Views: {
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
