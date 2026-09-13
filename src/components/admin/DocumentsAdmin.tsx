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
      <h1 style={{ fontSize: 28, color: '#fff', marginBottom: 18 }}>Documents</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {ONGLETS.map((o) => (
          <button
            key={o.value}
            onClick={() => {
              setOnglet(o.value)
              setSelectionneId(null)
            }}
            className={`nav-item${onglet === o.value ? ' nav-item-active' : ''}`}
            style={{
              padding: '9px 16px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: onglet === o.value ? 800 : 600,
              color: onglet === o.value ? '#1b1510' : 'var(--ink-2)',
              background: onglet === o.value ? 'var(--accent-gradient)' : undefined,
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {(onglet === 'etudiants' || onglet === 'professeurs') && (
        <div style={{ display: 'flex', gap: 18 }}>
          <aside style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              placeholder="Rechercher…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px', fontSize: 13.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
            />
            {loading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement…</p>}
            {!loading && filtres.length === 0 && <p style={{ color: 'var(--muted-2)', fontSize: 13 }}>Aucun résultat.</p>}
            {filtres.map((personne) => (
              <button
                key={personne.id}
                onClick={() => setSelectionneId(personne.id)}
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

          <div style={{ flexGrow: 1, minWidth: 0 }}>
            {selectionne && profile ? (
              <PanneauDocuments personne={selectionne} etablissementId={profile.etablissement_id} />
            ) : (
              <p style={{ color: 'var(--muted)' }}>Sélectionnez une personne dans la liste.</p>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ fontSize: 19, color: 'var(--accent-gold, #e9cf94)' }}>
        Documents de {personne.prenom} {personne.nom}
      </h2>
      <UploaderDocument ownerProfileId={personne.id} etablissementId={etablissementId} onUploade={recharger} />
      {erreur && <p style={{ color: 'var(--danger)' }}>{erreur}</p>}
      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : (
        <div className="card" style={{ padding: 20 }}>
          <ListeDocuments documents={documents} peutSupprimer={() => true} onChange={recharger} />
        </div>
      )}
    </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
        Supports de présentation, communications et règlements internes — visibles par tout le monde dans l'établissement.
      </p>
      <UploaderDocument ownerProfileId={adminId} etablissementId={etablissementId} etablissementWide onUploade={charger} />
      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : (
        <div className="card" style={{ padding: 20 }}>
          <ListeDocuments documents={documents} peutSupprimer={() => true} onChange={charger} />
        </div>
      )}
    </div>
  )
}

function PanneauComptesRendus() {
  const { comptesRendus, loading, erreur } = useSessionReports()

  if (loading) return <p style={{ color: 'var(--muted)' }}>Chargement…</p>
  if (erreur) return <p style={{ color: 'var(--danger)' }}>{erreur}</p>
  if (comptesRendus.length === 0) return <p style={{ color: 'var(--muted)' }}>Aucun compte rendu pour le moment.</p>

  return (
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
        Visible uniquement par vous et les personnes explicitement autorisées ci-dessous — même un autre admin n'y a pas accès par
        défaut.
      </p>
      <UploaderDocument ownerProfileId={adminId} etablissementId={etablissementId} forcerCategorie="confidentiel" onUploade={charger} />
      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : documents.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Aucun document confidentiel visible pour vous.</p>
      ) : (
        <div className="card" style={{ padding: 20 }}>
          {documents.map((d) => (
            <div key={d.id} style={{ borderBottom: '1px solid var(--border-soft)', paddingBottom: 10, marginBottom: 10 }}>
              <ListeDocuments documents={[d]} peutSupprimer={() => true} onChange={charger} />
              <button
                onClick={() => setAccesOuvert((v) => (v === d.id ? null : d.id))}
                style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, marginTop: 6 }}
              >
                {accesOuvert === d.id ? 'Masquer les accès' : 'Gérer les accès'}
              </button>
              {accesOuvert === d.id && <GestionAccesDocument documentId={d.id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
