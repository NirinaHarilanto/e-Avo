import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AdminLayout } from '../layout/AdminLayout'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { AttribuerProfesseur } from './AttribuerProfesseur'
import { CreerForfait } from './CreerForfait'
import { DossierEtudiantVue, initiales } from './DossierEtudiantVue'
import { FormulaireInvitation } from '../shared/FormulaireInvitation'

export function EtudiantsAdmin() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { etudiants, loading, recharger } = useEtudiants()
  const [recherche, setRecherche] = useState('')
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)

  const filtres = useMemo(
    () =>
      etudiants.filter((e) =>
        `${e.prenom ?? ''} ${e.nom ?? ''}`.toLowerCase().includes(recherche.toLowerCase()),
      ),
    [etudiants, recherche],
  )

  return (
    <AdminLayout actif="Étudiants">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <h1 style={{ fontSize: 28, color: '#fff' }}>Étudiants</h1>
        <button onClick={() => setFormulaireOuvert((v) => !v)} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510' }}>
          Ajouter un étudiant
        </button>
      </div>

      {formulaireOuvert && (
        <FormulaireInvitation
          endpoint="/api/admin/inviter-etudiant"
          roleLabel="un étudiant"
          onTermine={() => {
            setFormulaireOuvert(false)
            recharger()
          }}
        />
      )}

      <div style={{ display: 'flex', gap: 18 }}>
        <aside style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            placeholder="Rechercher un étudiant…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px', fontSize: 13.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
          />
          {loading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement…</p>}
          {!loading && filtres.length === 0 && <p style={{ color: 'var(--muted-2)', fontSize: 13 }}>Aucun étudiant.</p>}
          {filtres.map((etudiant) => (
            <button
              key={etudiant.id}
              onClick={() => navigate(`/admin/etudiants/${etudiant.id}`)}
              className="carte-ligne"
              style={{
                textAlign: 'left',
                borderRadius: 14,
                border: etudiant.id === id ? '1px solid rgba(94,179,255,.5)' : '1px solid var(--border)',
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
                {initiales(etudiant)}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                  {etudiant.prenom} {etudiant.nom}
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{etudiant.status === 'approved' ? 'Actif' : etudiant.status}</span>
              </div>
            </button>
          ))}
        </aside>

        <div style={{ flexGrow: 1, minWidth: 0 }}>
          {id ? <DossierPanel studentId={id} /> : <p style={{ color: 'var(--muted)' }}>Sélectionnez un étudiant dans la liste.</p>}
        </div>
      </div>
    </AdminLayout>
  )
}

function DossierPanel({ studentId }: { studentId: string }) {
  const { dossier, loading, erreur, recharger } = useDossierEtudiant(studentId)

  if (loading) return <p style={{ color: 'var(--muted)' }}>Chargement du dossier…</p>
  if (erreur || !dossier) return <p style={{ color: 'var(--danger)' }}>{erreur ?? 'Dossier introuvable.'}</p>

  const affectationActuelle = dossier.periodes[0] && !dossier.periodes[0].affectation.date_fin ? dossier.periodes[0].affectation : null

  return (
    <DossierEtudiantVue
      dossier={dossier}
      panneauProfesseur={
        <AttribuerProfesseur
          studentId={dossier.etudiant.id}
          etablissementId={dossier.etudiant.etablissement_id}
          affectationActuelle={affectationActuelle}
          onTermine={recharger}
        />
      }
      panneauForfait={
        <CreerForfait studentId={dossier.etudiant.id} etablissementId={dossier.etudiant.etablissement_id} onCree={recharger} />
      }
    />
  )
}
