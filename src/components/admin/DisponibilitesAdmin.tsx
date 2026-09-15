import { useEffect, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useDisponibilites } from '../../hooks/useRendezVous'
import { supabase } from '../../lib/supabaseClient'
import { Section } from '../ui/Section'
import { EtatChargement, MessageErreur, MessageInfo, MessageSucces } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { Champ, champStyle } from '../ui/Champ'
import { Icone } from '../ui/Icones'

const JOURS = [
  { valeur: 1, libelle: 'Lundi' },
  { valeur: 2, libelle: 'Mardi' },
  { valeur: 3, libelle: 'Mercredi' },
  { valeur: 4, libelle: 'Jeudi' },
  { valeur: 5, libelle: 'Vendredi' },
  { valeur: 6, libelle: 'Samedi' },
  { valeur: 0, libelle: 'Dimanche' },
]

/* Réglage des créneaux proposés aux visiteurs sur la page d'accueil. Vit dans l'écran Paramètres
   plutôt que dans une page à part : c'est une configuration qu'on touche rarement, au même titre
   que la connexion Google juste à côté. */
export function DisponibilitesAdmin() {
  const { profile } = useProfileContext()
  const { plages, parametres, loading, erreur, recharger } = useDisponibilites()
  const [message, setMessage] = useState<string | null>(null)
  const [echec, setEchec] = useState<string | null>(null)
  const [enregistrement, setEnregistrement] = useState(false)

  const [duree, setDuree] = useState('15')
  const [delai, setDelai] = useState('12')
  const [horizon, setHorizon] = useState('21')
  const [pause, setPause] = useState('15')

  const [nouveauJour, setNouveauJour] = useState(1)
  const [nouveauDebut, setNouveauDebut] = useState('09:00')
  const [nouveauFin, setNouveauFin] = useState('12:00')

  useEffect(() => {
    if (!parametres) return
    setDuree(String(parametres.duree_minutes))
    setDelai(String(parametres.delai_minimum_heures))
    setHorizon(String(parametres.horizon_jours))
    setPause(String(parametres.pause_minutes))
  }, [parametres])

  async function enregistrerParametres() {
    if (!profile) return
    setEnregistrement(true)
    setEchec(null)
    setMessage(null)
    const { error } = await supabase.from('reservation_parametres').upsert({
      etablissement_id: profile.etablissement_id,
      duree_minutes: Number(duree),
      delai_minimum_heures: Number(delai),
      horizon_jours: Number(horizon),
      pause_minutes: Number(pause),
      updated_at: new Date().toISOString(),
    })
    setEnregistrement(false)
    if (error) setEchec(error.message)
    else {
      setMessage('Réglages enregistrés.')
      recharger()
    }
  }

  async function ajouterPlage() {
    if (!profile) return
    if (nouveauFin <= nouveauDebut) {
      setEchec('L’heure de fin doit être après l’heure de début.')
      return
    }
    setEchec(null)
    const { error } = await supabase.from('creneaux_disponibilites').insert({
      etablissement_id: profile.etablissement_id,
      jour_semaine: nouveauJour,
      heure_debut: nouveauDebut,
      heure_fin: nouveauFin,
    })
    if (error) setEchec(error.message)
    else {
      setMessage('Plage ajoutée.')
      recharger()
    }
  }

  async function basculerPlage(id: string, actif: boolean) {
    const { error } = await supabase.from('creneaux_disponibilites').update({ actif }).eq('id', id)
    if (error) setEchec(error.message)
    else recharger()
  }

  async function supprimerPlage(id: string) {
    const { error } = await supabase.from('creneaux_disponibilites').delete().eq('id', id)
    if (error) setEchec(error.message)
    else recharger()
  }

  if (loading) return <EtatChargement lignes={2} hauteur={80} />

  return (
    <Section
      titre="Disponibilités pour les appels diagnostic"
      description="Les créneaux proposés aux visiteurs sur la page d’accueil sont calculés à partir de ces plages, moins les rendez-vous déjà pris, les cours planifiés et les événements de l’agenda Google connecté."
    >
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      {echec && <MessageErreur>{echec}</MessageErreur>}
      {message && <MessageSucces>{message}</MessageSucces>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Champ label="Durée de l’appel (min)">
          <input type="number" min={5} max={240} value={duree} onChange={(e) => setDuree(e.target.value)} style={champStyle} />
        </Champ>
        <Champ label="Délai minimum (h)" aide="Temps dont vous disposez pour valider avant le rendez-vous">
          <input type="number" min={0} max={720} value={delai} onChange={(e) => setDelai(e.target.value)} style={champStyle} />
        </Champ>
        <Champ label="Réservable jusqu’à (jours)">
          <input type="number" min={1} max={180} value={horizon} onChange={(e) => setHorizon(e.target.value)} style={champStyle} />
        </Champ>
        <Champ label="Pause entre appels (min)">
          <input type="number" min={0} max={120} value={pause} onChange={(e) => setPause(e.target.value)} style={champStyle} />
        </Champ>
      </div>

      <button
        type="button"
        onClick={enregistrerParametres}
        disabled={enregistrement}
        className="btn-shine"
        style={{ ...boutonPrimaireStyle, marginBottom: 22 }}
      >
        {enregistrement ? 'Enregistrement…' : 'Enregistrer les réglages'}
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {plages.length === 0 && (
          <MessageInfo>
            Aucune plage d’ouverture : tant qu’il n’y en a pas, aucun créneau n’est proposé sur la page d’accueil.
          </MessageInfo>
        )}
        {plages.map((plage) => (
          <div
            key={plage.id}
            className="carte-ligne"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-alt)' }}
          >
            <span style={{ fontSize: 13.5, color: plage.actif ? 'var(--ink)' : 'var(--muted-2)', textDecoration: plage.actif ? 'none' : 'line-through' }}>
              <strong>{JOURS.find((j) => j.valeur === plage.jour_semaine)?.libelle}</strong>{' '}
              {plage.heure_debut.slice(0, 5)} – {plage.heure_fin.slice(0, 5)}
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => basculerPlage(plage.id, !plage.actif)}
                style={boutonDiscret}
              >
                {plage.actif ? 'Désactiver' : 'Réactiver'}
              </button>
              <button type="button" onClick={() => supprimerPlage(plage.id)} style={{ ...boutonDiscret, color: 'var(--danger)' }}>
                Supprimer
              </button>
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <Champ label="Jour" style={{ minWidth: 140 }}>
          <select value={nouveauJour} onChange={(e) => setNouveauJour(Number(e.target.value))} style={champStyle}>
            {JOURS.map((jour) => (
              <option key={jour.valeur} value={jour.valeur}>
                {jour.libelle}
              </option>
            ))}
          </select>
        </Champ>
        <Champ label="De" style={{ minWidth: 120 }}>
          <input type="time" value={nouveauDebut} onChange={(e) => setNouveauDebut(e.target.value)} style={champStyle} />
        </Champ>
        <Champ label="À" style={{ minWidth: 120 }}>
          <input type="time" value={nouveauFin} onChange={(e) => setNouveauFin(e.target.value)} style={champStyle} />
        </Champ>
        <button type="button" onClick={ajouterPlage} className="btn-shine" style={boutonPrimaireStyle}>
          <Icone nom="plus" taille={15} />
          Ajouter la plage
        </button>
      </div>
    </Section>
  )
}

const boutonDiscret = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--muted)',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
