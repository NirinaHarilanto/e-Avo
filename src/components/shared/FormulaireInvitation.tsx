import { useState, type FormEvent } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { Champ, champStyle } from '../ui/Champ'
import { MessageErreur, MessageSucces } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'

interface FormulaireInvitationProps {
  /* Route API cible : api/admin/inviter-professeur, api/admin/inviter-etudiant, ou
     api/plateforme/inviter-admin-etablissement — même contrat de requête/réponse pour les
     trois (voir api/_lib/adminAuth.ts / platformAuth.ts). */
  endpoint: string
  roleLabel: string
  onTermine: () => void
  /* Champs additionnels fusionnés dans le body JSON, ex. { etablissementId } pour
     inviter-admin-etablissement.ts (dont l'établissement cible n'est pas déductible du
     contexte de l'appelant, contrairement aux deux autres routes). */
  corpsSupplementaire?: Record<string, unknown>
}

/* Formulaire d'invitation par e-mail, partagé entre l'espace admin "Professeurs", "Étudiants"
   et l'espace Admin plateforme — seule la route appelée, le libellé et un éventuel corps
   additionnel changent, le flux est identique. */
export function FormulaireInvitation({ endpoint, roleLabel, onTermine, corpsSupplementaire }: FormulaireInvitationProps) {
  const { session } = useProfileContext()
  const [email, setEmail] = useState('')
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState(false)

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    if (!session) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ email, nom, prenom, ...corpsSupplementaire }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? "L'invitation a échoué.")
      return
    }
    setSucces(true)
    setTimeout(onTermine, 1200)
  }

  if (succes) {
    return (
      <div style={{ marginBottom: 20 }}>
        <MessageSucces>Invitation envoyée à {email}.</MessageSucces>
      </div>
    )
  }

  return (
    <form
      onSubmit={envoyer}
      className="card"
      style={{ padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
        Un e-mail d’invitation sera envoyé à cette adresse. La personne y choisira elle-même son mot de passe, puis
        accédera directement à son espace : vous n’avez pas de mot de passe à créer ni à transmettre.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Champ label="Prénom" obligatoire style={{ flexGrow: 1, minWidth: 160 }}>
          <input required value={prenom} onChange={(e) => setPrenom(e.target.value)} style={champStyle} />
        </Champ>
        <Champ label="Nom" obligatoire style={{ flexGrow: 1, minWidth: 160 }}>
          <input required value={nom} onChange={(e) => setNom(e.target.value)} style={champStyle} />
        </Champ>
        <Champ label="E-mail" obligatoire style={{ flexGrow: 2, minWidth: 220 }}>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={champStyle} />
        </Champ>
      </div>

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, opacity: enCours ? 0.6 : 1 }}>
          {enCours ? 'Envoi…' : `Inviter ${roleLabel.toLowerCase()}`}
        </button>
      </div>
    </form>
  )
}
