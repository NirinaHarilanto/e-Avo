import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import type { Database } from '../../types/database.types'
import { Modale } from '../ui/Modale'
import { Champ, champStyle } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'

type Session = Database['public']['Tables']['sessions']['Row']

interface EditerSeancePlanifieeModaleProps {
  session: Session
  onFermer: () => void
  onEnregistre: () => void
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
   obligatoire dès que l'une des deux change, et validation admin quand c'est un professeur qui
   la propose (voir api/professeur/proposer-changement-seance.ts). Réutilisée depuis le planning
   prévisionnel du dossier étudiant (admin) et le calendrier professeur (CalendrierProfesseur.tsx)
   — mêmes règles des deux côtés, un seul endroit à maintenir. */
export function EditerSeancePlanifieeModale({ session, onFermer, onEnregistre }: EditerSeancePlanifieeModaleProps) {
  const { profile, session: authSession } = useProfileContext()
  const estAdmin = profile?.role === 'admin_etablissement'
  const changementEnAttente = session.changement_statut === 'en_attente'

  const [debut, setDebut] = useState(versDatetimeLocal(session.debut))
  const [dureeMinutes, setDureeMinutes] = useState(session.duree_minutes)
  const [justificatif, setJustificatif] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Comparaison par instant, pas par égalité de chaîne : PostgREST rend `debut` au format
  // "+00:00" alors que `new Date(...).toISOString()` produit toujours un suffixe "Z" — une
  // comparaison de chaînes détecterait un changement à chaque ouverture du formulaire, même
  // sans qu'aucun champ n'ait été touché.
  const aChange = new Date(debut).getTime() !== new Date(session.debut).getTime() || dureeMinutes !== session.duree_minutes

  async function proposer() {
    if (!authSession || !aChange) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/professeur/proposer-changement-seance', {
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

  async function repondreAValidation(approuver: boolean) {
    if (!authSession) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/valider-changement-seance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authSession.access_token}` },
      body: JSON.stringify({ sessionId: session.id, approuver }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? "L'opération a échoué.")
      return
    }
    onEnregistre()
  }

  return (
    <Modale titre="Modifier la séance" onFermer={onFermer} largeurMax={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {changementEnAttente ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ borderRadius: 12, border: '1px solid rgba(255,190,110,.3)', background: 'rgba(255,190,110,.08)', padding: '12px 15px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Changement en attente de validation
              </span>
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>
                Nouvelle heure :{' '}
                {session.debut_propose ? new Date(session.debut_propose).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                {session.duree_minutes_propose ? ` · ${session.duree_minutes_propose} min` : ''}
              </span>
              {session.justificatif_changement && (
                <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>« {session.justificatif_changement} »</span>
              )}
            </div>
            {estAdmin ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => repondreAValidation(false)}
                  disabled={enCours}
                  style={{ ...boutonNeutreStyle, flexGrow: 1, justifyContent: 'center', color: 'var(--danger)' }}
                >
                  Refuser
                </button>
                <button
                  type="button"
                  onClick={() => repondreAValidation(true)}
                  disabled={enCours}
                  className="btn-shine"
                  style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours ? 0.6 : 1 }}
                >
                  {enCours ? 'Validation…' : 'Valider le changement'}
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>En attente de validation par l'administration.</p>
            )}
          </div>
        ) : (
          <>
            <Champ label="Date et heure de début" obligatoire>
              <input type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} style={champStyle} />
            </Champ>
            <Champ label="Durée (minutes)" obligatoire>
              <input type="number" min={15} step={15} value={dureeMinutes} onChange={(e) => setDureeMinutes(Number(e.target.value))} style={champStyle} />
            </Champ>
            {aChange && (
              <Champ label="Justificatif du changement" obligatoire aide="Obligatoire dès que l'heure ou la durée change.">
                <textarea
                  rows={3}
                  value={justificatif}
                  onChange={(e) => setJustificatif(e.target.value)}
                  placeholder="Ex. indisponibilité de l'élève, imprévu du professeur…"
                  style={{ ...champStyle, resize: 'vertical' }}
                />
              </Champ>
            )}
            {!estAdmin && aChange && (
              <p style={{ fontSize: 11.5, color: 'var(--muted-2)', margin: 0, lineHeight: 1.5 }}>
                Ce changement sera appliqué après validation par l'administration.
              </p>
            )}
          </>
        )}

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        {!changementEnAttente && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onFermer} style={{ ...boutonNeutreStyle, flexGrow: 1, justifyContent: 'center' }}>
              Annuler
            </button>
            <button
              type="button"
              onClick={proposer}
              disabled={enCours || !aChange || !justificatif.trim()}
              className="btn-shine"
              style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours || !aChange || !justificatif.trim() ? 0.6 : 1 }}
            >
              {enCours ? 'Enregistrement…' : estAdmin ? 'Enregistrer' : 'Proposer la modification'}
            </button>
          </div>
        )}
      </div>
    </Modale>
  )
}
