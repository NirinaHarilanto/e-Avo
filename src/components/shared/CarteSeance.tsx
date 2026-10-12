import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { type SeanceProfesseur } from '../../hooks/useCalendrierProfesseur'
import { useDetailSeance } from '../../hooks/useDetailSeance'
import { getJoinUrl } from '../../lib/visio'
import { libelleTypeSeance, nomsElevesInscrits } from '../../lib/seances'
import { Bouton } from '../ui/Boutons'
import { champStyle, etiquetteStyle, LigneInfo } from '../ui/Champ'
import { BadgeStatutSeance } from './BadgeStatutSeance'
import { EnqueteSatisfactionAffichage } from './EnqueteSatisfactionAffichage'
import { BoutonRejoindreVisio } from './BoutonRejoindreVisio'
import { CompteRenduSeance } from '../professeurs/CompteRenduSeance'
import { EditerSeancePlanifieeModale } from './EditerSeancePlanifieeModale'

/* Carte d'une séance : rejoindre la visio, clôturer (émargement, décision d'absence), reprogrammer,
   annuler, puis compte rendu et résultats de l'enquête de satisfaction une fois terminée. Extraite
   de CalendrierProfesseur.tsx le 2026-10-12 pour être ouverte aussi depuis le planning d'une classe
   de cours collectif (PanneauPlanningClasse.tsx) — demande client : « chaque ligne de séance de
   cours devrait être cliquable avec la possibilité de clôturer une séance de cours collectif
   également quand la date de séance de cours est dépassée ». Un seul composant, donc exactement les
   mêmes règles de clôture des deux côtés. */
export function CarteSeance({
  seance,
  maintenant,
  onChange,
  sansCadre = false,
  onDemandeCloture,
  emargementOuvertADemande = false,
}: {
  seance: SeanceProfesseur
  maintenant: string
  onChange: () => void
  /* Montée dans une modale (depuis l'agenda), la carte perd son propre cadre pour éviter une
     carte dans une carte — même convention que le prop `carte` d'InformationsPersonnelles. */
  sansCadre?: boolean
  /* Vue Liste uniquement (demande client du 2026-09-30) : au lieu de déplier l'émargement SUR LA
     PAGE, le clic sur « Clôturer » délègue à l'appelant, qui rouvre cette même carte en pop-up
     (voir le composant parent) avec `emargementOuvertADemande`. Absent en vue Agenda, où la carte
     vit déjà dans une pop-up — y déplier l'émargement sur place reste le bon geste. */
  onDemandeCloture?: () => void
  /* Pop-up rouverte spécifiquement pour clôturer (vs. simplement consultée) : l'émargement doit
     être déplié dès l'ouverture, pas seulement après un second clic sur « Clôturer » DANS la
     pop-up — le premier clic l'a déjà demandé. */
  emargementOuvertADemande?: boolean
}) {
  const { session: authSession, profile } = useProfileContext()
  // Résultats de l'enquête de satisfaction (0068) visibles dans l'agenda professeur — demande
  // client du 2026-09-30 : « le professeur, l'étudiant et l'admin devraient pouvoir voir [...]
  // les résultats de l'enquête [...] dans les agendas respectifs ». Déjà le cas côté admin
  // (DetailSeanceModale.tsx) ; manquait ici. Chargé seulement une fois la séance terminée.
  const { detail: detailSatisfaction } = useDetailSeance(seance.session.statut === 'terminee' ? seance.session.id : null)
  const [presences, setPresences] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(seance.inscriptions.map((i) => [i.student_id, true])),
  )
  const [clotureOuverte, setClotureOuverte] = useState(emargementOuvertADemande)
  const [editionHoraireOuverte, setEditionHoraireOuverte] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  /* Choix à la clôture dès qu'un absent est constaté (0085, demande client du 2026-09-29) — voir
     api/professeur/cloturer-seance.ts pour la logique. Jamais pertinent pour une séance de
     vague (`cohort_id` posé) : le décompte y est déjà indépendant de la présence. */
  const [decisionAbsence, setDecisionAbsence] = useState<'reporter' | 'comptabiliser' | null>(null)
  const [justificatifAbsence, setJustificatifAbsence] = useState('')
  const [proposerCompteRendu, setProposerCompteRendu] = useState(false)

  const estAVenir = seance.session.statut === 'planifiee'
  const dejaCommencee = seance.session.debut <= maintenant
  const auMoinsUnAbsent = !seance.session.cohort_id && Object.values(presences).some((present) => !present)
  const clotureBloquee = auMoinsUnAbsent && (!decisionAbsence || !justificatifAbsence.trim())

  async function annuler() {
    if (!authSession) return
    setEnCours(true)
    setErreur(null)
    // Passe par l'API plutôt que par un update direct : l'annulation doit aussi supprimer
    // l'événement Google Calendar et prévenir les invités, ce que seul le serveur peut faire.
    const reponse = await fetch('/api/professeur/annuler-seance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authSession.access_token}` },
      body: JSON.stringify({ sessionId: seance.session.id }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? "L'annulation a échoué.")
      return
    }
    onChange()
  }

  async function cloturer() {
    if (!authSession || clotureBloquee) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/professeur/cloturer-seance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authSession.access_token}` },
      body: JSON.stringify({
        sessionId: seance.session.id,
        presences: Object.entries(presences).map(([studentId, present]) => ({ studentId, present })),
        ...(auMoinsUnAbsent ? { decisionAbsence, justificatifAbsence: justificatifAbsence.trim() } : {}),
      }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'La clôture a échoué.')
      return
    }
    setClotureOuverte(false)
    // Demande client du 2026-10-12 : proposer le compte rendu tout de suite après la clôture,
    // sans que le professeur ait à rouvrir la séance pour le trouver. `CompteRenduSeance` ne
    // monte qu'une fois `statut === 'terminee'` (juste après ce `onChange()`, qui recharge la
    // séance) : c'est un vrai premier montage, pas un re-rendu, donc cet état initial est pris
    // en compte de façon fiable.
    setProposerCompteRendu(true)
    onChange()
  }

  return (
    <div
      className={sansCadre ? undefined : 'card card-lift'}
      style={{ padding: sansCadre ? 0 : 18, display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="brand-font" style={{ fontSize: 15, color: 'var(--ink)' }}>
            {new Date(seance.session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {libelleTypeSeance(seance.session.type, seance.inscriptions)} · {seance.session.duree_minutes} min ·{' '}
            {nomsElevesInscrits(seance.inscriptions).join(', ')}
          </span>
          {/* Organisateur — quel compte Google héberge la réunion et a donc envoyé les
              invitations (0107), même ligne que DetailSeanceModale.tsx côté admin. */}
          {seance.video?.organisateur_email && !sansCadre && (
            <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>Invitations envoyées par {seance.video.organisateur_email}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BadgeStatutSeance statut={seance.session.statut} />
        </div>
      </div>

      {sansCadre && seance.video?.organisateur_email && (
        <LigneInfo accent label="Invitations envoyées par" valeur={seance.video.organisateur_email} />
      )}

      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erreur}</p>}

      {estAVenir && !clotureOuverte && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {seance.video && (seance.video.provider === 'jitsi' || seance.video.provider === 'google_meet') && (
            <BoutonRejoindreVisio lien={getJoinUrl(seance.video)} fournisseur={seance.video.provider} />
          )}
          {dejaCommencee && (
            <button
              onClick={onDemandeCloture ?? (() => setClotureOuverte(true))}
              className="btn-shine"
              style={{ fontSize: 12.5, padding: '9px 16px', background: 'var(--accent-gradient)', color: '#1b1510' }}
            >
              Clôturer
            </button>
          )}
          <button
            onClick={() => setEditionHoraireOuverte(true)}
            style={{ fontSize: 12.5, padding: '9px 16px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--accent-blue)', cursor: 'pointer' }}
          >
            Modifier l'heure
          </button>
          <Bouton
            onClick={annuler}
            enCours={enCours}
            libelle="Annuler la séance"
            libelleEnCours="Annulation…"
            style={{ fontSize: 12.5, padding: '9px 16px', borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer' }}
          />
        </div>
      )}

      {clotureOuverte && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
          {/* `etiquetteStyle` (var(--ink), majuscules) plutôt que l'ancien `--ink-2` : ce dernier
              rendait l'intitulé « Présence » plus terne que les noms d'élèves qu'il annonce
              juste en dessous (`--ink`, ligne suivante) — l'inverse de la hiérarchie attendue.
              Demande client du 2026-09-30 : « rendre les intitulés plus visibles pour qu'ils ne
              se mélangent pas avec les autres informations ». */}
          <span style={etiquetteStyle}>Présence</span>
          {seance.inscriptions.map((i) => (
            <label key={i.student_id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={presences[i.student_id] ?? true}
                onChange={(e) => setPresences((p) => ({ ...p, [i.student_id]: e.target.checked }))}
              />
              {i.etudiant?.prenom} {i.etudiant?.nom}
            </label>
          ))}

          {/* 0085, demande client du 2026-09-29 : dès qu'un absent est constaté (hors vague),
              le choix devient obligatoire avant de pouvoir clôturer. */}
          {auMoinsUnAbsent && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, borderRadius: 12, border: '1px solid rgba(224,169,77,.32)', background: 'rgba(224,169,77,.08)', padding: '11px 13px' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--warning, #e0a94d)' }}>
                Élève absent — que faire de cette séance ?
              </span>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
                <input type="radio" name={`decision-absence-${seance.session.id}`} checked={decisionAbsence === 'reporter'} onChange={() => setDecisionAbsence('reporter')} style={{ marginTop: 2 }} />
                <span>
                  <strong>Reporter la séance</strong> — elle aura lieu plus tard, ni vous ni l’élève n’êtes impactés pour
                  cette occurrence.
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
                <input type="radio" name={`decision-absence-${seance.session.id}`} checked={decisionAbsence === 'comptabiliser'} onChange={() => setDecisionAbsence('comptabiliser')} style={{ marginTop: 2 }} />
                <span>
                  <strong>Comptabiliser l’heure</strong> — l’heure est décomptée du forfait de l’élève et créditée pour
                  vous, malgré l’absence.
                </span>
              </label>
              <textarea
                placeholder="Justificatif (obligatoire)"
                value={justificatifAbsence}
                onChange={(e) => setJustificatifAbsence(e.target.value)}
                rows={2}
                style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setClotureOuverte(false)} style={{ flexGrow: 1, fontSize: 12.5, padding: 9, borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
              Annuler
            </button>
            <button
              onClick={cloturer}
              disabled={enCours || clotureBloquee}
              className="btn-shine"
              style={{ flexGrow: 1, fontSize: 12.5, padding: 9, background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours || clotureBloquee ? 0.6 : 1 }}
            >
              Confirmer la clôture
            </button>
          </div>
        </div>
      )}

      {/* Émargement en lecture seule — demande client du 2026-10-12 : « afficher l'émargement de
          chaque étudiant (présent ou absent) » dans le pop-up d'une séance de cours collectif déjà
          clôturée. Relit `session_enrollments.present`, écrit une fois pour toutes à la clôture
          (api/professeur/cloturer-seance.ts) — jamais modifiable depuis ici. */}
      {seance.session.statut === 'terminee' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
          <span style={etiquetteStyle}>Présence</span>
          {seance.inscriptions.map((i) => (
            <div key={i.student_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink)' }}>
              <span>{i.etudiant?.prenom} {i.etudiant?.nom}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: i.present ? 'var(--accent-teal)' : i.present === false ? 'var(--danger)' : 'var(--muted)' }}>
                {i.present ? 'Présent(e)' : i.present === false ? 'Absent(e)' : '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Établissement et professeur lus sur LA SÉANCE, pas sur le compte connecté : la carte
          s'ouvre désormais aussi depuis le planning d'une classe, où l'admin n'est pas le
          professeur du cours — le compte rendu doit rester attribué à celui qui l'a donné. */}
      {seance.session.statut === 'terminee' && (
        <CompteRenduSeance
          sessionId={seance.session.id}
          etablissementId={seance.session.etablissement_id}
          teacherId={seance.session.teacher_id}
          studentIds={seance.inscriptions.map((i) => i.student_id)}
          ouvrirAutomatiquement={proposerCompteRendu}
        />
      )}

      {seance.session.statut === 'terminee' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
          <span style={{ ...etiquetteStyle, fontSize: 11 }}>Enquête de satisfaction</span>
          <EnqueteSatisfactionAffichage
            satisfactions={detailSatisfaction?.satisfactions ?? []}
            resoudreNom={(id) => nomsElevesInscrits(seance.inscriptions.filter((i) => i.student_id === id))[0] ?? 'Élève'}
          />
        </div>
      )}

      {editionHoraireOuverte && (
        <EditerSeancePlanifieeModale
          session={seance.session}
          etudiants={seance.inscriptions.map((i) => i.etudiant).filter((e): e is NonNullable<typeof e> => !!e)}
          professeur={profile?.id === seance.session.teacher_id ? profile : null}
          video={seance.video}
          onFermer={() => setEditionHoraireOuverte(false)}
          onEnregistre={() => {
            setEditionHoraireOuverte(false)
            onChange()
          }}
        />
      )}
    </div>
  )
}
