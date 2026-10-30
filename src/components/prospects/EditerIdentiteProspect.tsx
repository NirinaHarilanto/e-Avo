import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { Champ, champStyle, LigneInfo } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { boutonSecondaireStyle, boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { GroupeSection } from '../ui/Section'

type Prospect = Database['public']['Tables']['prospects']['Row']

/* Informations d'un candidat PAS ENCORE converti (demande client du 2026-10-11, suite du Suivi
   des cours collectifs : « toutes les informations devraient être modifiables par l'admin »).
   Distinct d'InformationsPersonnelles.tsx, qui édite un `profiles` : tant que la conversion n'a
   pas eu lieu, la seule identité qui existe est celle du `prospects`. Une fois converti, c'est
   `profiles` qui prend le relais comme source de vérité (voir construireSuiviCollectif.ts) — ce
   panneau-ci ne sert alors plus à rien et n'est pas affiché. */
export function EditerIdentiteProspect({ prospect, onChange }: { prospect: Prospect; onChange: () => void }) {
  const [edition, setEdition] = useState(false)
  const [prenom, setPrenom] = useState(prospect.prenom)
  const [nom, setNom] = useState(prospect.nom)
  const [email, setEmail] = useState(prospect.email)
  const [telephone, setTelephone] = useState(prospect.telephone ?? '')
  const [objectif, setObjectif] = useState(prospect.objectif ?? '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  function annuler() {
    setPrenom(prospect.prenom)
    setNom(prospect.nom)
    setEmail(prospect.email)
    setTelephone(prospect.telephone ?? '')
    setObjectif(prospect.objectif ?? '')
    setErreur(null)
    setEdition(false)
  }

  async function enregistrer() {
    if (!prenom.trim() || !nom.trim() || !email.trim()) {
      setErreur('Prénom, nom et e-mail sont obligatoires.')
      return
    }
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase
      .from('prospects')
      .update({
        prenom: prenom.trim(),
        nom: nom.trim(),
        email: email.trim(),
        telephone: telephone.trim() || null,
        objectif: objectif.trim() || null,
      })
      .eq('id', prospect.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setEdition(false)
    onChange()
  }

  return (
    <GroupeSection
      titre="Informations du candidat"
      actions={
        !edition ? (
          <button onClick={() => setEdition(true)} style={boutonSecondaireStyle}>
            Modifier
          </button>
        ) : undefined
      }
    >
      {!edition ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <LigneInfo label="Prénom" valeur={prospect.prenom} />
          <LigneInfo label="Nom" valeur={prospect.nom} />
          <LigneInfo label="E-mail" valeur={prospect.email} />
          <LigneInfo label="Téléphone" valeur={prospect.telephone ?? '—'} />
          <LigneInfo label="Objectif" valeur={prospect.objectif ?? '—'} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <Champ label="Prénom" obligatoire>
            <input value={prenom} onChange={(e) => setPrenom(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="Nom" obligatoire>
            <input value={nom} onChange={(e) => setNom(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="E-mail" obligatoire aide="Pas encore un identifiant de connexion tant que le candidat n’est pas converti : librement modifiable.">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="Téléphone">
            <input value={telephone} onChange={(e) => setTelephone(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="Objectif">
            <input value={objectif} onChange={(e) => setObjectif(e.target.value)} placeholder="Entretien, expatriation…" style={champStyle} />
          </Champ>
          {erreur && <MessageErreur>{erreur}</MessageErreur>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={annuler} style={{ ...boutonNeutreStyle, flexGrow: 1, fontSize: 12.5, padding: 9 }}>
              Annuler
            </button>
            <button onClick={enregistrer} disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, flexGrow: 1, fontSize: 12.5, padding: 9, opacity: enCours ? 0.6 : 1 }}>
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </GroupeSection>
  )
}
