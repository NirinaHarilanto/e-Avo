import { useState } from 'react'
import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useCalendrierProfesseur } from '../../hooks/useCalendrierProfesseur'
import { useDocuments } from '../../hooks/useDocuments'
import { UploaderDocument } from '../documents/UploaderDocument'
import { ListeDocuments } from '../documents/ListeDocuments'

export function DocumentsProfesseur() {
  const { profile } = useProfileContext()
  const { etudiantsActifs } = useCalendrierProfesseur(profile?.id)
  const [eleveId, setEleveId] = useState<string | null>(null)

  return (
    <ProfesseurLayout actif="Documents">
      <h1 style={{ fontSize: 28, color: '#fff', marginBottom: 22 }}>Documents</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <section>
          <h2 style={{ fontSize: 17, color: 'var(--accent-gold, #e9cf94)', marginBottom: 12 }}>Mes documents</h2>
          {profile && <SectionDocuments ownerProfileId={profile.id} etablissementId={profile.etablissement_id} />}
        </section>

        <section>
          <h2 style={{ fontSize: 17, color: 'var(--accent-gold, #e9cf94)', marginBottom: 12 }}>Documents de mes élèves</h2>
          {etudiantsActifs.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>Aucun élève assigné.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <select
                value={eleveId ?? ''}
                onChange={(e) => setEleveId(e.target.value || null)}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', fontSize: 13, color: 'var(--ink)', background: 'rgba(0,0,0,.22)', maxWidth: 280 }}
              >
                <option value="">Sélectionner un élève…</option>
                {etudiantsActifs.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.prenom} {e.nom}
                  </option>
                ))}
              </select>
              {eleveId && profile && <SectionDocuments ownerProfileId={eleveId} etablissementId={profile.etablissement_id} />}
            </div>
          )}
        </section>
      </div>
    </ProfesseurLayout>
  )
}

function SectionDocuments({ ownerProfileId, etablissementId }: { ownerProfileId: string; etablissementId: string }) {
  const { profile } = useProfileContext()
  const { documents, loading, erreur, recharger } = useDocuments(ownerProfileId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <UploaderDocument ownerProfileId={ownerProfileId} etablissementId={etablissementId} onUploade={recharger} />
      {erreur && <p style={{ color: 'var(--danger)' }}>{erreur}</p>}
      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Chargement…</p>
      ) : (
        <div className="card" style={{ padding: 20 }}>
          <ListeDocuments documents={documents} peutSupprimer={(d) => d.uploaded_by_profile_id === profile?.id} onChange={recharger} />
        </div>
      )}
    </div>
  )
}
