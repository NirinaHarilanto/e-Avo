import { useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { memeNom, nomComplet } from '../../lib/nomDuplique'
import type { Database } from '../../types/database.types'
import { GroupeSection, Section } from '../ui/Section'
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
  /* À `false` quand le panneau est inséré dans un onglet qui porte déjà son propre cadre (voir
     DossierEtudiantVue.tsx) : évite une carte dans une carte. Le contenu reste identique, seul
     l'habillage (fond, bordure) disparaît. */
  carte?: boolean
}

/* Panneau réutilisable admin : informations personnelles modifiables d'un étudiant ou d'un
   professeur (nom/prénom/téléphone/adresse). L'e-mail reste affiché en lecture seule : c'est
   aussi l'identifiant de connexion (auth.users), le modifier ici désynchroniserait l'affichage
   du login réel sans le changer — hors périmètre de ce panneau. */
export function InformationsPersonnelles({ personne, onChange, extra, carte = true }: InformationsPersonnellesProps) {
  const [edition, setEdition] = useState(false)
  const [nom, setNom] = useState(personne.nom ?? '')
  const [prenom, setPrenom] = useState(personne.prenom ?? '')
  const [telephone, setTelephone] = useState(personne.telephone ?? '')
  const [whatsapp, setWhatsapp] = useState(personne.whatsapp ?? '')
  const [adresse, setAdresse] = useState(personne.adresse ?? '')
  const [ville, setVille] = useState(personne.ville ?? '')
  const [dateNaissance, setDateNaissance] = useState(personne.date_naissance ?? '')
  const [lieuNaissance, setLieuNaissance] = useState(personne.lieu_naissance ?? '')
  const [tauxHoraire, setTauxHoraire] = useState(personne.taux_horaire?.toString() ?? '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const estProfesseur = personne.role === 'professeur'

  function annuler() {
    setNom(personne.nom ?? '')
    setPrenom(personne.prenom ?? '')
    setTelephone(personne.telephone ?? '')
    setWhatsapp(personne.whatsapp ?? '')
    setAdresse(personne.adresse ?? '')
    setVille(personne.ville ?? '')
    setDateNaissance(personne.date_naissance ?? '')
    setLieuNaissance(personne.lieu_naissance ?? '')
    setTauxHoraire(personne.taux_horaire?.toString() ?? '')
    setErreur(null)
    setEdition(false)
  }

  async function enregistrer() {
    setEnCours(true)
    setErreur(null)

    /* Même règle qu'à l'invitation (api/_lib/nomDuplique.ts) : deux personnes du même nom ne
       doivent jamais coexister dans la liste des étudiants ou des professeurs. Ce panneau écrit
       directement dans `profiles` sans passer par une fonction `api/`, la vérification se fait
       donc ici — l'admin voit déjà tous les profils de son établissement (policies de 0004/0017),
       la requête ne révèle rien de nouveau. */
    if (nom.trim() && prenom.trim()) {
      const { data: profils } = await supabase
        .from('profiles')
        .select('id, nom, prenom')
        .eq('etablissement_id', personne.etablissement_id)
        .eq('role', personne.role)
      const homonyme = (profils ?? []).find((p) => p.id !== personne.id && memeNom(p, { nom, prenom }))
      if (homonyme) {
        setEnCours(false)
        setErreur(
          `${nomComplet(homonyme)} existe déjà dans cet établissement. Ajoutez de quoi les distinguer (second prénom, initiale) plutôt que deux fiches au même nom.`,
        )
        return
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        nom: nom || null,
        prenom: prenom || null,
        telephone: telephone || null,
        whatsapp: whatsapp || null,
        adresse: adresse || null,
        ville: ville || null,
        date_naissance: dateNaissance || null,
        lieu_naissance: lieuNaissance || null,
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

  const Conteneur = carte ? Section : GroupeSection
  const proprietesConteneur = carte ? { padding: '18px 20px' } : {}

  return (
    <Conteneur
      titre="Informations personnelles"
      {...proprietesConteneur}
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
          <LigneInfo label="Date de naissance" valeur={personne.date_naissance ? new Date(personne.date_naissance).toLocaleDateString('fr-FR') : '—'} />
          <LigneInfo label="Lieu de naissance" valeur={personne.lieu_naissance ?? '—'} />
          <LigneInfo label="E-mail" valeur={personne.email ?? '—'} />
          <LigneInfo label="Téléphone" valeur={personne.telephone ?? '—'} />
          <LigneInfo label="WhatsApp" valeur={personne.whatsapp ?? '—'} />
          <LigneInfo label="Adresse" valeur={personne.adresse ?? '—'} />
          <LigneInfo label="Ville" valeur={personne.ville ?? '—'} />
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
          <Champ label="Date de naissance">
            <input type="date" value={dateNaissance} onChange={(e) => setDateNaissance(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="Lieu de naissance">
            <input value={lieuNaissance} onChange={(e) => setLieuNaissance(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="E-mail" aide="L’e-mail sert d’identifiant de connexion : il se modifie depuis le compte, pas ici.">
            <input value={personne.email ?? ''} disabled style={{ ...champStyle, opacity: 0.55, cursor: 'not-allowed' }} />
          </Champ>
          <Champ label="Téléphone">
            <input value={telephone} onChange={(e) => setTelephone(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="WhatsApp" aide="Facultatif : à renseigner seulement s’il diffère du téléphone.">
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="Adresse">
            <input value={adresse} onChange={(e) => setAdresse(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="Ville">
            <input value={ville} onChange={(e) => setVille(e.target.value)} style={champStyle} />
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
    </Conteneur>
  )
}
