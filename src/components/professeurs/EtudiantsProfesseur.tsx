import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useCalendrierProfesseur } from '../../hooks/useCalendrierProfesseur'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { DossierEtudiantVue, initiales } from '../etudiants/DossierEtudiantVue'

/* Équivalent, côté professeur, de EtudiantsAdmin.tsx : même agencement liste + dossier, mais
   scope réduit aux élèves actuellement assignés à ce professeur, et en lecture seule (aucun
   panneau d'action — DossierEtudiantVue est déjà conçu pour ça, voir son commentaire). Les
   forfaits/diagnostics restent invisibles ici : aucune policy RLS ne les ouvre au rôle
   professeur (scope volontaire, pas un bug — cf. plan). */
export function EtudiantsProfesseur() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useProfileContext()
  const { etudiantsActifs, loading } = useCalendrierProfesseur(profile?.id)
  const [recherche, setRecherche] = useState('')

  const filtres = useMemo(
    () => etudiantsActifs.filter((e) => `${e.prenom ?? ''} ${e.nom ?? ''}`.toLowerCase().includes(recherche.toLowerCase())),
    [etudiantsActifs, recherche],
  )

  return (
    <ProfesseurLayout actif="Mes étudiants">
      <div style={{ display: 'flex', gap: 18 }}>
        <aside style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            placeholder="Rechercher un élève…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px', fontSize: 13.5, color: 'var(--ink)', background: 'rgba(0,0,0,.22)' }}
          />
          {loading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement…</p>}
          {!loading && filtres.length === 0 && <p style={{ color: 'var(--muted-2)', fontSize: 13 }}>Aucun élève assigné.</p>}
          {filtres.map((etudiant) => (
            <button
              key={etudiant.id}
              onClick={() => navigate(`/professeur/etudiants/${etudiant.id}`)}
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
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                {etudiant.prenom} {etudiant.nom}
              </span>
            </button>
          ))}
        </aside>

        <div style={{ flexGrow: 1, minWidth: 0 }}>
          {id ? <DossierPanel studentId={id} /> : <p style={{ color: 'var(--muted)' }}>Sélectionnez un élève dans la liste.</p>}
        </div>
      </div>
    </ProfesseurLayout>
  )
}

function DossierPanel({ studentId }: { studentId: string }) {
  const { dossier, loading, erreur } = useDossierEtudiant(studentId)

  if (loading) return <p style={{ color: 'var(--muted)' }}>Chargement du dossier…</p>
  if (erreur || !dossier) return <p style={{ color: 'var(--danger)' }}>{erreur ?? 'Dossier introuvable.'}</p>

  return <DossierEtudiantVue dossier={dossier} />
}
