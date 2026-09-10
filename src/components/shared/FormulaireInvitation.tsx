import { useState, type FormEvent } from 'react'
import { useProfileContext } from '../../context/ProfileContext'

const champStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 11px',
  fontSize: 13,
  color: 'var(--ink)',
  background: 'rgba(0,0,0,.22)',
}

interface FormulaireInvitationProps {
  /* Route API cible : api/admin/inviter-professeur ou api/admin/inviter-etudiant, même
     contrat de requête/réponse pour les deux (voir api/_lib/adminAuth.ts). */
  endpoint: string
  roleLabel: string
  onTermine: () => void
}

/* Formulaire d'invitation par e-mail, partagé entre l'espace admin "Professeurs" et
   "Étudiants" — seule la route appelée et le libellé changent, le flux est identique. */
export function FormulaireInvitation({ endpoint, roleLabel, onTermine }: FormulaireInvitationProps) {
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
      body: JSON.stringify({ email, nom, prenom }),
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
      <div className="card" style={{ padding: 20, marginBottom: 20, color: 'var(--accent-teal)' }}>
        Invitation envoyée à {email}.
      </div>
    )
  }

  return (
    <form onSubmit={envoyer} className="card" style={{ padding: 20, marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1, minWidth: 160 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Prénom</label>
        <input required value={prenom} onChange={(e) => setPrenom(e.target.value)} style={champStyle} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1, minWidth: 160 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Nom</label>
        <input required value={nom} onChange={(e) => setNom(e.target.value)} style={champStyle} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 2, minWidth: 220 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>E-mail</label>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={champStyle} />
      </div>
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12.5, width: '100%' }}>{erreur}</p>}
      <button type="submit" disabled={enCours} className="btn-shine" style={{ background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours ? 0.6 : 1 }}>
        {enCours ? 'Envoi…' : `Inviter ${roleLabel.toLowerCase()}`}
      </button>
    </form>
  )
}
