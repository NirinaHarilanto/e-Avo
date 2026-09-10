import { useMemo, useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { useDocuments } from '../../hooks/useDocuments'
import { useProfileContext } from '../../context/ProfileContext'
import { UploaderDocument } from '../documents/UploaderDocument'
import { ListeDocuments } from '../documents/ListeDocuments'
import { initiales } from '../etudiants/DossierEtudiantVue'
import type { Database } from '../../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Onglet = 'etudiants' | 'professeurs'

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

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {(['etudiants', 'professeurs'] as const).map((o) => (
          <button
            key={o}
            onClick={() => {
              setOnglet(o)
              setSelectionneId(null)
            }}
            className={`nav-item${onglet === o ? ' nav-item-active' : ''}`}
            style={{
              padding: '9px 16px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: onglet === o ? 800 : 600,
              color: onglet === o ? '#1b1510' : 'var(--ink-2)',
              background: onglet === o ? 'var(--accent-gradient)' : undefined,
              cursor: 'pointer',
            }}
          >
            {o === 'etudiants' ? 'Étudiants' : 'Professeurs'}
          </button>
        ))}
      </div>

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
