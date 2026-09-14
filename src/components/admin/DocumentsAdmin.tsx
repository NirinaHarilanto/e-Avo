import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { useDocuments } from '../../hooks/useDocuments'
import { useSessionReports } from '../../hooks/useSessionReports'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { UploaderDocument } from '../documents/UploaderDocument'
import { ListeDocuments } from '../documents/ListeDocuments'
import { GestionAccesDocument } from '../documents/GestionAccesDocument'
import { initiales } from '../etudiants/DossierEtudiantVue'
import type { Database } from '../../types/database.types'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GroupeSection } from '../ui/Section'
import { Onglets } from '../ui/Onglets'
import { ChampRecherche } from '../ui/BarreOutils'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur, MessageInfo } from '../ui/Etats'
import { boutonSecondaireStyle } from '../ui/Boutons'

type Profile = Database['public']['Tables']['profiles']['Row']
type Document = Database['public']['Tables']['documents']['Row']
type Onglet = 'etudiants' | 'professeurs' | 'partageables' | 'comptes_rendus' | 'confidentiels'

const ONGLETS: { value: Onglet; label: string }[] = [
  { value: 'etudiants', label: 'Étudiants' },
  { value: 'professeurs', label: 'Professeurs' },
  { value: 'partageables', label: 'Partageables' },
  { value: 'comptes_rendus', label: 'Comptes rendus' },
  { value: 'confidentiels', label: 'Confidentiels' },
]

export function DocumentsAdmin() {
  const { profile } = useProfileContext()
  const { etudiants, loading: chargementEtudiants } = useEtudiants()
  const { professeurs, loading: chargementProfesseurs } = useProfesseurs()
  const [onglet, setOnglet] = useState<Onglet>('etudiants')
  const [selectionneId, setSelectionneId] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')

  const personnes = onglet === 'etudiants' ? etudiants : professeurs
  const loading = onglet === 'etudiants' ? chargementEtudiants : chargementProfesseurs
  const filtres = useMemo(
    () => personnes.filter((p) => `${p.prenom ?? ''} ${p.nom ?? ''}`.toLowerCase().includes(recherche.toLowerCase())),
    [personnes, recherche],
  )
  const selectionne = personnes.find((p) => p.id === selectionneId) ?? null

  return (
    <AdminLayout actif="Documents">
      <EnTetePage
        titre="Documents"
        description="Tous les fichiers de l’établissement, rangés par destinataire et par niveau de confidentialité. Chaque onglet correspond à une règle de visibilité différente."
        actions={
          <Onglets
            etiquette="Catégories de documents"
            actif={onglet}
            onChange={(valeur) => {
              setOnglet(valeur)
              setSelectionneId(null)
            }}
            onglets={ONGLETS}
          />
        }
      />

      <GuidePage
        id="admin-documents"
        etapes={[
          <>
            <strong>Étudiants</strong> et <strong>Professeurs</strong> : choisissez une personne à gauche pour voir et
            compléter son dossier de pièces. Elle seule, ses professeurs et l’administration y ont accès.
          </>,
          <>
            <strong>Partageables</strong> : des documents visibles par tout l’établissement, à utiliser pour les
            supports de cours et les règlements communs.
          </>,
          <>
            <strong>Comptes rendus</strong> : rédigés par les professeurs après leurs séances. Ils sont en lecture seule
            ici, et visibles par l’élève concerné.
          </>,
          <>
            <strong>Confidentiels</strong> : visibles uniquement par les personnes que vous ajoutez explicitement à la
            liste d’accès du document. Même les autres administrateurs n’y accèdent pas sans y être inscrits.
          </>,
        ]}
      />

      {(onglet === 'etudiants' || onglet === 'professeurs') && (
        <div className="grille-maitre-detail">
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <ChampRecherche
              valeur={recherche}
              onChange={setRecherche}
              placeholder={onglet === 'etudiants' ? 'Rechercher un étudiant…' : 'Rechercher un professeur…'}
            />
            {loading && <EtatChargement lignes={4} hauteur={62} />}
            {!loading && filtres.length === 0 && (
              <EtatVide
                compact
                icone={recherche ? 'recherche' : onglet === 'etudiants' ? 'etudiants' : 'professeurs'}
                titre={recherche ? 'Aucun résultat' : 'Personne à afficher'}
                description={
                  recherche
                    ? `Aucun nom ne correspond à « ${recherche} ».`
                    : `Aucun ${onglet === 'etudiants' ? 'étudiant' : 'professeur'} n’est encore enregistré dans l’établissement.`
                }
              />
            )}
            {filtres.map((personne) => (
              <button
                key={personne.id}
                onClick={() => setSelectionneId(personne.id)}
                aria-current={personne.id === selectionneId ? 'true' : undefined}
                className="carte-ligne"
                style={{
                  textAlign: 'left',
                  borderRadius: 14,
                  border: personne.id === selectionneId ? '1px solid rgba(94,179,255,.5)' : '1px solid var(--border)',
                  background: 'var(--surface)',
                  padding: '13px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                <span style={{ width: 38, height: 38, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                  {initiales(personne)}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                  {personne.prenom} {personne.nom}
                </span>
              </button>
            ))}
          </aside>

          <div style={{ minWidth: 0 }}>
            {selectionne && profile ? (
              <PanneauDocuments personne={selectionne} etablissementId={profile.etablissement_id} />
            ) : (
              <EtatVide
                icone="documents"
                titre="Sélectionnez une personne"
                description="Choisissez un nom dans la liste de gauche pour consulter ses documents et en déposer de nouveaux."
              />
            )}
          </div>
        </div>
      )}

      {onglet === 'partageables' && profile && <PanneauPartageables etablissementId={profile.etablissement_id} adminId={profile.id} />}
      {onglet === 'comptes_rendus' && <PanneauComptesRendus />}
      {onglet === 'confidentiels' && profile && <PanneauConfidentiels etablissementId={profile.etablissement_id} adminId={profile.id} />}
    </AdminLayout>
  )
}

function PanneauDocuments({ personne, etablissementId }: { personne: Profile; etablissementId: string }) {
  const { documents, loading, erreur, recharger } = useDocuments(personne.id)

  return (
    <GroupeSection
      titre={`Documents de ${personne.prenom} ${personne.nom}`}
      description="Visibles par cette personne, par ses professeurs le cas échéant, et par l’administration."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <UploaderDocument ownerProfileId={personne.id} etablissementId={etablissementId} onUploade={recharger} />
        {erreur && <MessageErreur>{erreur}</MessageErreur>}
        {loading ? (
          <EtatChargement lignes={3} hauteur={52} />
        ) : (
          <div className="card" style={{ padding: 20 }}>
            <ListeDocuments
              documents={documents}
              peutSupprimer={() => true}
              onChange={recharger}
              messageVide={`Aucune pièce au dossier de ${personne.prenom}. Utilisez le formulaire ci-dessus pour en déposer une.`}
            />
          </div>
        )}
      </div>
    </GroupeSection>
  )
}

function PanneauPartageables({ etablissementId, adminId }: { etablissementId: string; adminId: string }) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  const charger = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('documents').select('*').eq('etablissement_wide', true).order('created_at', { ascending: false })
    setDocuments(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  return (
    <GroupeSection
      titre="Documents partageables"
      description="Supports de présentation, communications et règlements internes — visibles par tout le monde dans l’établissement, élèves comme professeurs."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <MessageInfo>
          Tout fichier déposé ici devient immédiatement visible par l’ensemble des élèves et des professeurs. Pour un
          document à diffusion restreinte, utilisez l’onglet « Confidentiels ».
        </MessageInfo>
        <UploaderDocument ownerProfileId={adminId} etablissementId={etablissementId} etablissementWide onUploade={charger} />
        {loading ? (
          <EtatChargement lignes={3} hauteur={52} />
        ) : (
          <div className="card" style={{ padding: 20 }}>
            <ListeDocuments
              documents={documents}
              peutSupprimer={() => true}
              onChange={charger}
              messageVide="Aucun document partagé pour l’instant. Déposez ici les supports que tout l’établissement doit pouvoir consulter."
            />
          </div>
        )}
      </div>
    </GroupeSection>
  )
}

function PanneauComptesRendus() {
  const { comptesRendus, loading, erreur } = useSessionReports()

  if (loading) return <EtatChargement lignes={3} hauteur={96} />
  if (erreur) return <MessageErreur>{erreur}</MessageErreur>
  if (comptesRendus.length === 0) {
    return (
      <EtatVide
        icone="documents"
        titre="Aucun compte rendu pour le moment"
        description="Les comptes rendus sont rédigés par les professeurs depuis leur calendrier, après avoir clôturé une séance. Ils apparaissent ici automatiquement et sont visibles par les élèves concernés."
      />
    )
  }

  return (
    <GroupeSection
      titre="Comptes rendus de séances"
      description="Rédigés par les professeurs après chaque cours, en lecture seule ici. L’élève concerné les retrouve dans son espace."
    >
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {comptesRendus.map(({ rapport, session, professeur, participants }) => (
        <div key={rapport.id} className="card card-lift" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)' }}>
              {session ? new Date(session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Séance inconnue'}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{professeur ? `${professeur.prenom} ${professeur.nom}` : 'Professeur inconnu'}</span>
            <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>
              {participants.map((p) => `${p.prenom} ${p.nom}`).join(', ') || 'aucun participant'}
            </span>
          </div>
          {rapport.themes && (
            <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0 }}>
              <strong>Thèmes :</strong> {rapport.themes}
            </p>
          )}
          {rapport.resume && <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0 }}>{rapport.resume}</p>}
        </div>
      ))}
    </div>
    </GroupeSection>
  )
}

function PanneauConfidentiels({ etablissementId, adminId }: { etablissementId: string; adminId: string }) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [accesOuvert, setAccesOuvert] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('documents').select('*').eq('categorie', 'confidentiel').order('created_at', { ascending: false })
    setDocuments(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  return (
    <GroupeSection
      titre="Documents confidentiels"
      description="Visibles uniquement par vous et par les personnes que vous ajoutez nommément à la liste d’accès de chaque document."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <MessageInfo>
          La confidentialité est appliquée par la base de données elle-même, pas seulement par l’affichage : un autre
          administrateur de l’établissement ne verra pas ces fichiers tant que vous ne l’aurez pas ajouté à leur liste
          d’accès.
        </MessageInfo>
        <UploaderDocument ownerProfileId={adminId} etablissementId={etablissementId} forcerCategorie="confidentiel" onUploade={charger} />
        {loading ? (
          <EtatChargement lignes={2} hauteur={64} />
        ) : documents.length === 0 ? (
          <EtatVide
            icone="documents"
            titre="Aucun document confidentiel"
            description="Déposez un fichier ci-dessus, puis utilisez « Gérer les accès » pour désigner qui pourra le consulter."
          />
        ) : (
          <div className="card" style={{ padding: 20 }}>
            {documents.map((d) => (
              <div key={d.id} style={{ borderBottom: '1px solid var(--border-soft)', paddingBottom: 10, marginBottom: 10 }}>
                <ListeDocuments documents={[d]} peutSupprimer={() => true} onChange={charger} />
                <button
                  onClick={() => setAccesOuvert((v) => (v === d.id ? null : d.id))}
                  style={{ ...boutonSecondaireStyle, border: 'none', padding: '4px 0', marginTop: 6, fontSize: 11.5 }}
                >
                  {accesOuvert === d.id ? 'Masquer les accès' : 'Gérer les accès'}
                </button>
                {accesOuvert === d.id && <GestionAccesDocument documentId={d.id} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </GroupeSection>
  )
}
