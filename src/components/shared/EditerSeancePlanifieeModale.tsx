import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useHistoriqueSeance } from '../../hooks/useHistoriqueSeance'
import type { Database } from '../../types/database.types'
import { getJoinUrl, estLienReel } from '../../lib/visio'
import { Modale } from '../ui/Modale'
import { Champ, champStyle } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'

type Session = Database['public']['Tables']['sessions']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type VideoSession = Database['public']['Tables']['video_sessions']['Row']

interface EditerSeancePlanifieeModaleProps {
  session: Session
  onFermer: () => void
  onEnregistre: () => void
  /* Récapitulatif affiché en tête de modale — tout est optionnel : chaque appelant transmet ce
     qu'il a déjà sous la main (aucune requête supplémentaire), le bloc n'affiche que ce qui est
     fourni. Demande client du 2026-09-17 : voir l'élève, le professeur et le lien Meet sans
     quitter la fenêtre de modification. */
  etudiants?: Pick<Profile, 'id' | 'prenom' | 'nom'>[]
  professeur?: Pick<Profile, 'prenom' | 'nom'> | null
  video?: VideoSession | null
}

function versDatetimeLocal(iso: string): string {
  // <input type="datetime-local"> attend l'heure locale du navigateur, sans le "Z" ni le
  // décalage — retirer les secondes/millisecondes de l'ISO local suffit, pas de conversion de
  // fuseau à faire nous-mêmes (Date le fait déjà en interne pour getFullYear()/getMonth()/etc.).
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/* Édition d'une séance encore planifiée — heure de début et durée — avec justificatif
   obligatoire dès que l'une des deux change. Appliqué IMMÉDIATEMENT, professeur comme admin :
   la validation admin intermédiaire a été supprimée (demande client du 2026-09-17), remplacée
   par une notification aux seules personnes concernées (voir api/professeur/modifier-seance.ts)
   et par l'historique tracé ci-dessous (session_modifications, migration 0048). Réutilisée
   depuis le planning prévisionnel du dossier étudiant (admin) et le calendrier professeur
   (CalendrierProfesseur.tsx) — mêmes règles des deux côtés, un seul endroit à maintenir. */
export function EditerSeancePlanifieeModale({ session, onFermer, onEnregistre, etudiants, professeur, video }: EditerSeancePlanifieeModaleProps) {
  const { session: authSession } = useProfileContext()
  const peutSupprimer = session.statut === 'planifiee'
  const { modifications, loading: chargementHistorique } = useHistoriqueSeance(session.id)

  const [debut, setDebut] = useState(versDatetimeLocal(session.debut))
  const [dureeMinutes, setDureeMinutes] = useState(session.duree_minutes)
  const [justificatif, setJustificatif] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [suppressionEnCours, setSuppressionEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Comparaison par instant, pas par égalité de chaîne : PostgREST rend `debut` au format
  // "+00:00" alors que `new Date(...).toISOString()` produit toujours un suffixe "Z" — une
  // comparaison de chaînes détecterait un changement à chaque ouverture du formulaire, même
  // sans qu'aucun champ n'ait été touché.
  const aChange = new Date(debut).getTime() !== new Date(session.debut).getTime() || dureeMinutes !== session.duree_minutes

  async function enregistrer() {
    if (!authSession || !aChange) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/professeur/modifier-seance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authSession.access_token}` },
      body: JSON.stringify({ sessionId: session.id, debut: new Date(debut).toISOString(), dureeMinutes, justificatif }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? "La modification a échoué.")
      return
    }
    onEnregistre()
  }

  async function supprimer() {
    if (!authSession) return
    setSuppressionEnCours(true)
    setErreur(null)
    // Même API que le bouton "Annuler la séance" déjà présent sur la carte du calendrier
    // professeur (CalendrierProfesseur.tsx) : elle autorise déjà l'admin comme le professeur
    // propriétaire (requireTeacherOrAdmin), et gère aussi le nettoyage Google Calendar/visio.
    // Suppression immédiate, sans validation admin (décision client du 2026-09-17) : contrairement
    // au changement d'horaire, il n'y a pas de nouvelle valeur à faire approuver.
    const reponse = await fetch('/api/professeur/annuler-seance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authSession.access_token}` },
      body: JSON.stringify({ sessionId: session.id }),
    })
    setSuppressionEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? "La suppression a échoué.")
      return
    }
    onEnregistre()
  }

  return (
    <Modale titre="Modifier la séance" onFermer={onFermer} largeurMax={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {(etudiants?.length || professeur || video) && (
          <div
            style={{
              borderRadius: 12,
              border: '1px solid var(--border-soft, var(--border))',
              background: 'rgba(255,255,255,.03)',
              padding: '12px 15px',
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              fontSize: 12.5,
              color: 'var(--ink-2)',
            }}
          >
            {etudiants && etudiants.length > 0 && (
              <span>
                <strong style={{ color: 'var(--ink)' }}>{etudiants.length > 1 ? 'Élèves' : 'Élève'} :</strong>{' '}
                {etudiants.map((e) => `${e.prenom ?? ''} ${e.nom ?? ''}`).join(', ')}
              </span>
            )}
            {professeur && (
              <span>
                <strong style={{ color: 'var(--ink)' }}>Professeur :</strong> {professeur.prenom} {professeur.nom}
              </span>
            )}
            {video && (
              <span>
                <strong style={{ color: 'var(--ink)' }}>Lien Google Meet :</strong>{' '}
                {estLienReel(video) ? (
                  <a href={getJoinUrl(video)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)' }}>
                    {getJoinUrl(video)}
                  </a>
                ) : (
                  <span style={{ color: 'var(--muted-2)' }}>Pas encore généré</span>
                )}
              </span>
            )}
          </div>
        )}

        <Champ label="Date et heure de début" obligatoire>
          <input type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} style={champStyle} />
        </Champ>
        <Champ label="Durée (minutes)" obligatoire>
          <input type="number" min={15} step={15} value={dureeMinutes} onChange={(e) => setDureeMinutes(Number(e.target.value))} style={champStyle} />
        </Champ>
        {aChange && (
          <Champ label="Justificatif du changement" obligatoire aide="Obligatoire dès que l'heure ou la durée change — conservé dans l'historique ci-dessous.">
            <textarea
              rows={3}
              value={justificatif}
              onChange={(e) => setJustificatif(e.target.value)}
              placeholder="Ex. indisponibilité de l'élève, imprévu du professeur…"
              style={{ ...champStyle, resize: 'vertical' }}
            />
          </Champ>
        )}

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        {peutSupprimer && (
          <button
            type="button"
            onClick={supprimer}
            disabled={suppressionEnCours}
            style={{
              ...boutonNeutreStyle,
              justifyContent: 'center',
              color: 'var(--danger)',
              borderColor: 'var(--danger)',
              opacity: suppressionEnCours ? 0.6 : 1,
            }}
          >
            {suppressionEnCours ? 'Suppression…' : 'Supprimer la séance'}
          </button>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onFermer} style={{ ...boutonNeutreStyle, flexGrow: 1, justifyContent: 'center' }}>
            Annuler
          </button>
          <button
            type="button"
            onClick={enregistrer}
            disabled={enCours || !aChange || !justificatif.trim()}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours || !aChange || !justificatif.trim() ? 0.6 : 1 }}
          >
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>

        {!chargementHistorique && modifications.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-soft, var(--border))', paddingTop: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Historique des modifications
            </span>
            {modifications.map(({ modification, auteur }) => (
              <div key={modification.id} style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--muted)' }}>
                  {new Date(modification.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                  {' · '}
                  {auteur ? `${auteur.prenom ?? ''} ${auteur.nom ?? ''}`.trim() : 'Utilisateur inconnu'}
                </span>
                {modification.type_modification === 'annulee' ? (
                  <p style={{ margin: '2px 0 0' }}>
                    Séance annulée (initialement prévue le{' '}
                    {new Date(modification.ancien_debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}).
                  </p>
                ) : (
                  <p style={{ margin: '2px 0 0' }}>
                    Reprogrammée du {new Date(modification.ancien_debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })} au{' '}
                    {modification.nouveau_debut
                      ? new Date(modification.nouveau_debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
                      : '—'}
                    {modification.nouvelle_duree_minutes ? ` (${modification.nouvelle_duree_minutes} min)` : ''}
                    {modification.justificatif ? ` — « ${modification.justificatif} »` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modale>
  )
}
