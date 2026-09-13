import { useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'

type Profile = Database['public']['Tables']['profiles']['Row']

const champStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 10px',
  fontSize: 12.5,
  color: 'var(--ink)',
  background: 'rgba(0,0,0,.22)',
}

interface InformationsPersonnellesProps {
  personne: Profile
  onChange: () => void
  /* Champs additionnels propres à un rôle (ex. taux horaire professeur, Phase 2/3) — insérés
     entre l'adresse et les boutons, sans dupliquer ce composant par rôle. */
  extra?: ReactNode
}

/* Panneau réutilisable admin : informations personnelles modifiables d'un étudiant ou d'un
   professeur (nom/prénom/téléphone/adresse). L'e-mail reste affiché en lecture seule : c'est
   aussi l'identifiant de connexion (auth.users), le modifier ici désynchroniserait l'affichage
   du login réel sans le changer — hors périmètre de ce panneau. */
export function InformationsPersonnelles({ personne, onChange, extra }: InformationsPersonnellesProps) {
  const [edition, setEdition] = useState(false)
  const [nom, setNom] = useState(personne.nom ?? '')
  const [prenom, setPrenom] = useState(personne.prenom ?? '')
  const [telephone, setTelephone] = useState(personne.telephone ?? '')
  const [adresse, setAdresse] = useState(personne.adresse ?? '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  function annuler() {
    setNom(personne.nom ?? '')
    setPrenom(personne.prenom ?? '')
    setTelephone(personne.telephone ?? '')
    setAdresse(personne.adresse ?? '')
    setErreur(null)
    setEdition(false)
  }

  async function enregistrer() {
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase
      .from('profiles')
      .update({
        nom: nom || null,
        prenom: prenom || null,
        telephone: telephone || null,
        adresse: adresse || null,
      })
      .eq('id', personne.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setEdition(false)
    onChange()
  }

  return (
    <div className="card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>Informations personnelles</h3>
        {!edition && (
          <button
            onClick={() => setEdition(true)}
            style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer' }}
          >
            Modifier
          </button>
        )}
      </div>

      {!edition ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <LigneInfo label="Nom" valeur={personne.nom ?? '—'} />
          <LigneInfo label="Prénom" valeur={personne.prenom ?? '—'} />
          <LigneInfo label="E-mail" valeur={personne.email ?? '—'} />
          <LigneInfo label="Téléphone" valeur={personne.telephone ?? '—'} />
          <LigneInfo label="Adresse" valeur={personne.adresse ?? '—'} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Champ label="Nom" value={nom} onChange={setNom} />
          <Champ label="Prénom" value={prenom} onChange={setPrenom} />
          <Champ label="Téléphone" value={telephone} onChange={setTelephone} />
          <Champ label="Adresse" value={adresse} onChange={setAdresse} />
          {erreur && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{erreur}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={annuler} style={{ flexGrow: 1, fontSize: 12.5, padding: 9, borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>
              Annuler
            </button>
            <button onClick={enregistrer} disabled={enCours} className="btn-shine" style={{ flexGrow: 1, fontSize: 12.5, padding: 9, background: 'var(--accent-gradient)', color: '#1b1510', opacity: enCours ? 0.6 : 1 }}>
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {extra}
    </div>
  )
}

function LigneInfo({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{valeur}</span>
    </div>
  )
}

function Champ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={champStyle} />
    </div>
  )
}
