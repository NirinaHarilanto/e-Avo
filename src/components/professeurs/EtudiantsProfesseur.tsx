import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ProfesseurLayout } from '../layout/ProfesseurLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useCalendrierProfesseur } from '../../hooks/useCalendrierProfesseur'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { useSecondairesDuo } from '../../hooks/useSecondairesDuo'
import { useStatutsContratsSignature } from '../../hooks/useStatutsContratsSignature'
import { useTypesProgrammeEtudiants } from '../../hooks/useTypesProgrammeEtudiants'
import { DossierEtudiantVue, initiales } from '../etudiants/DossierEtudiantVue'
import { CarteListeEtudiant } from '../etudiants/CarteListeEtudiant'
import { PanneauInformationsDuo, informationsPersonnellesCompletes } from '../shared/InformationsPersonnelles'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { ChampRecherche } from '../ui/BarreOutils'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'

/* Équivalent, côté professeur, de EtudiantsAdmin.tsx : même agencement liste + dossier, mais
   scope réduit aux élèves actuellement assignés à ce professeur, et en lecture seule (aucun
   panneau d'action — DossierEtudiantVue est déjà conçu pour ça, voir son commentaire).
   Bloc de liste et panneau d'informations personnelles PARTAGÉS avec EtudiantsAdmin.tsx
   (CarteListeEtudiant / PanneauInformationsDuo) — demande client du 2026-09-23 : « il faut que
   le bloc étudiant dans l'espace admin soit repris exactement » côté professeur, DUO compris.
   Informations personnelles, forfait et statut de contrat sont désormais visibles ici (demande
   client du 2026-09-22/23, « exactement comme dans l'espace admin »), via les policies RLS
   étendues au professeur sur `packages`/`hour_ledger` (0061) et `contracts` (0063). Restent hors
   de portée, volontairement : les diagnostics et les paiements, qui ne concernent ni la
   préparation d'un cours ni le suivi pédagogique. */
export function EtudiantsProfesseur() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useProfileContext()
  const { etudiantsActifs, etudiantsAnciens, loading } = useCalendrierProfesseur(profile?.id)
  const [recherche, setRecherche] = useState('')

  /* DUO (0058) : un binôme secondaire n'a ni séance ni affectation propre (voir la migration
     0054 — son dossier est celui du principal), donc `etudiantsActifs` ne le contient jamais.
     Il faut le retrouver par une requête dédiée plutôt que de le déduire de cette liste, comme
     le fait EtudiantsAdmin.tsx à partir de la liste complète des étudiants de l'établissement
     (dont un professeur n'a justement pas la vue). */
  const idsActifs = useMemo(() => etudiantsActifs.map((e) => e.id), [etudiantsActifs])
  const { secondaireParPrincipal } = useSecondairesDuo(idsActifs)

  const filtres = useMemo(
    () =>
      etudiantsActifs.filter((e) => {
        const secondaire = secondaireParPrincipal.get(e.id)
        const cible = `${e.prenom ?? ''} ${e.nom ?? ''} ${secondaire ? `${secondaire.prenom ?? ''} ${secondaire.nom ?? ''}` : ''}`
        return cible.toLowerCase().includes(recherche.toLowerCase())
      }),
    [etudiantsActifs, recherche, secondaireParPrincipal],
  )
  const anciensFiltres = useMemo(
    () => etudiantsAnciens.filter((e) => `${e.profil.prenom ?? ''} ${e.profil.nom ?? ''}`.toLowerCase().includes(recherche.toLowerCase())),
    [etudiantsAnciens, recherche],
  )
  const statutsContrats = useStatutsContratsSignature(idsActifs)
  const programmes = useTypesProgrammeEtudiants(idsActifs)

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

          {filtres.map((etudiant) => {
            const secondaire = secondaireParPrincipal.get(etudiant.id) ?? null
            return (
              <CarteListeEtudiant
                key={etudiant.id}
                principal={etudiant}
                secondaire={secondaire}
                selectionne={etudiant.id === id}
                onClick={() => navigate(`/professeur/etudiants/${etudiant.id}`)}
                programme={programmes[etudiant.id]}
                statutContrat={statutsContrats[etudiant.id]}
                dossierIncomplet={(secondaire ? [etudiant, secondaire] : [etudiant]).some((m) => !informationsPersonnellesCompletes(m))}
              />
            )
          })}

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
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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

  return (
    <DossierEtudiantVue
      dossier={dossier}
      panneauInformations={
        <PanneauInformationsDuo etudiant={dossier.etudiant} duoPartenaire={dossier.duoPartenaire} onChange={() => {}} lectureSeule />
      }
    />
  )
}
