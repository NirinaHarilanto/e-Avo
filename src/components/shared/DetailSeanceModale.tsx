import type { ReactNode } from 'react'
import type { Database } from '../../types/database.types'
import { useDetailSeance } from '../../hooks/useDetailSeance'
import { nomEleveInscrit } from '../../lib/seances'
import { formaterMinutes } from '../../lib/heures'
import { estLienReel, getJoinUrl } from '../../lib/visio'
import { Modale } from '../ui/Modale'
import { LigneInfo } from '../ui/Champ'
import { EtatChargement } from '../ui/Etats'
import { BadgeStatutSeance } from './BadgeStatutSeance'
import { CompteRenduAffichage } from './CompteRenduAffichage'
import { Etoiles } from '../etudiants/SatisfactionSeance'

type Session = Database['public']['Tables']['sessions']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type VideoSession = Database['public']['Tables']['video_sessions']['Row']

interface DetailSeanceModaleProps {
  session: Session
  professeur: Profile | null
  eleves: (Profile | null)[]
  video: VideoSession | null
  onFermer: () => void
  /* Actions propres à l'appelant (modifier, annuler, clôturer…) : la fiche décrit la séance,
     elle ne décide pas de ce qu'on a le droit d'en faire. */
  actions?: ReactNode
}

function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <h4 style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>
        {titre}
      </h4>
      {children}
    </section>
  )
}

/* Fiche complète d'une séance, ouverte au clic sur un créneau de l'agenda — demande client du
   2026-09-23 (point 4) : « professeur, étudiants, compte rendu du cours si la séance est
   terminée, résultat de l'enquête de satisfaction de l'étudiant si disponible ». Partagée par
   l'espace admin et l'espace professeur pour que les deux voient exactement la même chose ; ce
   que chacun a le droit de lire est tranché par la RLS, pas par un filtre d'affichage. */
export function DetailSeanceModale({ session, professeur, eleves, video, onFermer, actions }: DetailSeanceModaleProps) {
  const { detail, loading } = useDetailSeance(session.id)
  const lienVisio = video ? getJoinUrl(video) : null
  const debut = new Date(session.debut)

  const nomsEleves = eleves.map((e) => nomEleveInscrit(e))
  const satisfactions = detail?.satisfactions ?? []
  const moyenne =
    satisfactions.length > 0
      ? satisfactions.reduce((total, s) => total + s.note_globale, 0) / satisfactions.length
      : null

  return (
    <Modale titre="Détail de la séance" onFermer={onFermer} largeurMax={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="brand-font" style={{ fontSize: 16, color: 'var(--ink)' }}>
            {debut.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
            {debut.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <BadgeStatutSeance statut={session.statut} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <LigneInfo label="Professeur" valeur={professeur ? `${professeur.prenom} ${professeur.nom}` : 'Non attribué'} />
          <LigneInfo label={nomsEleves.length > 1 ? 'Étudiants' : 'Étudiant'} valeur={nomsEleves.join(', ') || 'Aucun élève inscrit'} />
          <LigneInfo label="Type" valeur={session.type === 'individuel' ? 'Individuel' : 'Collectif'} />
          <LigneInfo label="Durée" valeur={formaterMinutes(session.duree_minutes)} />
        </div>

        {video && lienVisio && estLienReel(video) && (
          <a
            href={lienVisio}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-blue)' }}
          >
            Ouvrir le lien de visioconférence
          </a>
        )}

        {loading && <EtatChargement lignes={2} hauteur={40} />}

        {!loading && session.statut === 'terminee' && (
          <Bloc titre="Compte rendu du cours">
            {detail?.compteRendu ? (
              <CompteRenduAffichage rapport={detail.compteRendu} />
            ) : (
              <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0 }}>
                Le professeur n’a pas encore rédigé de compte rendu pour cette séance.
              </p>
            )}
          </Bloc>
        )}

        {!loading && session.statut === 'terminee' && (
          <Bloc titre="Enquête de satisfaction">
            {satisfactions.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0 }}>
                Aucun avis déposé pour le moment. L’élève la remplit depuis son espace personnel.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {moyenne !== null && satisfactions.length > 1 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--ink-2)' }}>
                    Moyenne <Etoiles valeur={Math.round(moyenne)} taille={13} />
                    <strong style={{ color: 'var(--accent-gold, #e9cf94)' }}>
                      {Number.isInteger(moyenne) ? moyenne : moyenne.toFixed(1)}/5
                    </strong>
                  </span>
                )}
                {satisfactions.map((avis) => {
                  const eleve = eleves.find((e) => e?.id === avis.student_id)
                  return (
                    <div
                      key={avis.id}
                      style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,.03)' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: 'var(--ink)' }}>{nomEleveInscrit(eleve)}</span>
                        <Etoiles valeur={avis.note_globale} taille={13} />
                        {avis.note_pedagogie !== null && (
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Pédagogie {avis.note_pedagogie}/5</span>
                        )}
                      </div>
                      {avis.commentaire && (
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{avis.commentaire}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Bloc>
        )}

        {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
      </div>
    </Modale>
  )
}
