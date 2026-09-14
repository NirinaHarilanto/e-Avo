import { useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { Section } from '../ui/Section'
import { Champ, LigneInfo, champStyle } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { boutonSecondaireStyle, boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'

type Profile = Database['public']['Tables']['profiles']['Row']

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
  const [tauxHoraire, setTauxHoraire] = useState(personne.taux_horaire?.toString() ?? '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const estProfesseur = personne.role === 'professeur'

  function annuler() {
    setNom(personne.nom ?? '')
    setPrenom(personne.prenom ?? '')
    setTelephone(personne.telephone ?? '')
    setAdresse(personne.adresse ?? '')
    setTauxHoraire(personne.taux_horaire?.toString() ?? '')
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
        ...(estProfesseur && { taux_horaire: tauxHoraire ? Number(tauxHoraire) : null }),
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
    <Section
      titre="Informations personnelles"
      padding="18px 20px"
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
          <LigneInfo label="Nom" valeur={personne.nom ?? '—'} />
          <LigneInfo label="Prénom" valeur={personne.prenom ?? '—'} />
          <LigneInfo label="E-mail" valeur={personne.email ?? '—'} />
          <LigneInfo label="Téléphone" valeur={personne.telephone ?? '—'} />
          <LigneInfo label="Adresse" valeur={personne.adresse ?? '—'} />
          {estProfesseur && <LigneInfo label="Taux horaire" valeur={personne.taux_horaire ? `${personne.taux_horaire} Ar/h` : '—'} />}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <Champ label="Nom">
            <input value={nom} onChange={(e) => setNom(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="Prénom">
            <input value={prenom} onChange={(e) => setPrenom(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="E-mail" aide="L’e-mail sert d’identifiant de connexion : il se modifie depuis le compte, pas ici.">
            <input value={personne.email ?? ''} disabled style={{ ...champStyle, opacity: 0.55, cursor: 'not-allowed' }} />
          </Champ>
          <Champ label="Téléphone">
            <input value={telephone} onChange={(e) => setTelephone(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="Adresse">
            <input value={adresse} onChange={(e) => setAdresse(e.target.value)} style={champStyle} />
          </Champ>
          {estProfesseur && (
            <Champ label="Taux horaire (Ar/h)" aide="Sert au calcul automatique des rémunérations à l’heure enseignée.">
              <input type="number" value={tauxHoraire} onChange={(e) => setTauxHoraire(e.target.value)} style={champStyle} />
            </Champ>
          )}
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

      {extra}
    </Section>
  )
}
