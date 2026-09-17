import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useCalendrierProfesseur } from '../../hooks/useCalendrierProfesseur'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { DossierEtudiantVue, initiales } from '../etudiants/DossierEtudiantVue'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { ChampRecherche } from '../ui/BarreOutils'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'

/* Équivalent, côté professeur, de EtudiantsAdmin.tsx : même agencement liste + dossier, mais
   scope réduit aux élèves actuellement assignés à ce professeur, et en lecture seule (aucun
   panneau d'action — DossierEtudiantVue est déjà conçu pour ça, voir son commentaire). Les
   forfaits/diagnostics restent invisibles ici : aucune policy RLS ne les ouvre au rôle
   professeur (scope volontaire, pas un bug — cf. plan). */
export function EtudiantsProfesseur() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useProfileContext()
  const { etudiantsActifs, etudiantsAnciens, loading } = useCalendrierProfesseur(profile?.id)
  const [recherche, setRecherche] = useState('')

  const filtres = useMemo(
    () => etudiantsActifs.filter((e) => `${e.prenom ?? ''} ${e.nom ?? ''}`.toLowerCase().includes(recherche.toLowerCase())),
    [etudiantsActifs, recherche],
  )
  const anciensFiltres = useMemo(
    () => etudiantsAnciens.filter((e) => `${e.profil.prenom ?? ''} ${e.profil.nom ?? ''}`.toLowerCase().includes(recherche.toLowerCase())),
    [etudiantsAnciens, recherche],
  )

  return (
    <ProfesseurLayout actif="Mes étudiants">
      <EnTetePage
        titre="Mes étudiants"
        description="Les élèves qui vous sont actuellement attribués. Sélectionnez un nom pour consulter son parcours, ses séances et son assiduité."
      />

      <GuidePage
        id="professeur-etudiants"
        etapes={[
          <>
            Cette page est en <strong>lecture seule</strong> : elle vous informe sans rien vous demander de saisir.
          </>,
          <>
            Le <strong>parcours pédagogique</strong> d’un élève liste toutes ses séances avec vous et sa présence à
            chacune, utile pour préparer votre prochain cours.
          </>,
          <>
            Un élève qui change de professeur passe dans la section <strong>« Anciens élèves »</strong>, avec la date du
            transfert ; son historique avec vous reste consultable dans son dossier.
          </>,
        ]}
      />

      <div className="grille-maitre-detail">
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <ChampRecherche valeur={recherche} onChange={setRecherche} placeholder="Rechercher un élève…" etiquette="Rechercher un élève" />

          {loading && <EtatChargement lignes={3} hauteur={58} />}

          {!loading && etudiantsActifs.length === 0 && (
            <EtatVide
              compact
              icone="etudiants"
              titre="Aucun élève assigné"
              description="L’administration ne vous a pas encore attribué d’élève."
            />
          )}

          {!loading && etudiantsActifs.length > 0 && filtres.length === 0 && (
            <EtatVide compact icone="recherche" titre="Aucun résultat" description={`Aucun élève ne correspond à « ${recherche} ».`} />
          )}

          {filtres.map((etudiant) => (
            <button
              key={etudiant.id}
              onClick={() => navigate(`/professeur/etudiants/${etudiant.id}`)}
              aria-current={etudiant.id === id ? 'true' : undefined}
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

          {anciensFiltres.length > 0 && (
            <>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.8, padding: '10px 4px 2px' }}>
                Anciens élèves
              </span>
              {anciensFiltres.map(({ profil, transfereLe }) => (
                <button
                  key={profil.id}
                  onClick={() => navigate(`/professeur/etudiants/${profil.id}`)}
                  aria-current={profil.id === id ? 'true' : undefined}
                  className="carte-ligne"
                  style={{
                    textAlign: 'left',
                    borderRadius: 14,
                    border: profil.id === id ? '1px solid rgba(94,179,255,.5)' : '1px solid var(--border)',
                    background: 'var(--surface)',
                    padding: '13px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    cursor: 'pointer',
                    color: 'inherit',
                    opacity: 0.6,
                  }}
                >
                  <span style={{ width: 38, height: 38, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                    {initiales(profil)}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                      {profil.prenom} {profil.nom}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--muted-2)' }}>Transféré le {new Date(transfereLe).toLocaleDateString('fr-FR')}</span>
                  </span>
                </button>
              ))}
            </>
          )}
        </aside>

        <div style={{ minWidth: 0 }}>
          {id ? (
            <DossierPanel studentId={id} />
          ) : (
            <EtatVide
              icone="dossier"
              titre="Sélectionnez un élève"
              description="Choisissez un nom dans la liste de gauche pour afficher son parcours : séances suivies avec vous, présence, heures et prochaine échéance."
            />
          )}
        </div>
      </div>
    </ProfesseurLayout>
  )
}

function DossierPanel({ studentId }: { studentId: string }) {
  const { dossier, loading, erreur } = useDossierEtudiant(studentId)

  if (loading) return <EtatChargement lignes={3} hauteur={110} />
  if (erreur || !dossier) return <MessageErreur>{erreur ?? 'Dossier introuvable.'}</MessageErreur>

  return <DossierEtudiantVue dossier={dossier} />
}
