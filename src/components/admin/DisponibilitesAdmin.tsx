import { useCallback, useEffect, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useDisponibilites } from '../../hooks/useRendezVous'
import { jetonAcces } from '../../lib/jetonAcces'
import { supabase } from '../../lib/supabaseClient'
import { Section } from '../ui/Section'
import { EtatChargement, MessageErreur, MessageInfo, MessageSucces } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { Champ, champStyle } from '../ui/Champ'
import { Icone } from '../ui/Icones'
import { ChampDate } from '../ui/ChampDate'

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
  const [apercu, setApercu] = useState<ApercuCreneaux | null>(null)
  const [plageEnEdition, setPlageEnEdition] = useState<string | null>(null)
  const [editionDebut, setEditionDebut] = useState('09:00')
  const [editionFin, setEditionFin] = useState('12:00')

  /* Aperçu de ce que le visiteur voit réellement, recalculé à chaque modification des plages
     (demande client du 2026-10-31). Il passe par le serveur et non par un calcul local : seul le
     serveur peut lire l'agenda Google de l'établissement, qui est précisément ce qui faisait
     disparaître des plages pourtant ouvertes. */
  const chargerApercu = useCallback(async () => {
    const reponse = await fetch('/api/admin/apercu-creneaux', {
      headers: { Authorization: `Bearer ${await jetonAcces()}` },
    })
      .then((r) => r.json())
      .catch(() => null)
    setApercu(reponse && !reponse.error ? (reponse as ApercuCreneaux) : null)
  }, [])

  /* Signature plutôt que le tableau lui-même : `useDisponibilites` rend `valeur?.plages ?? []`,
     donc un tableau d'identité neuve à chaque rendu tant que la requête n'a pas répondu — en
     dépendance directe, l'effet se relancerait en boucle. */
  const signaturePlages = plages.map((p) => `${p.id}:${p.actif}:${p.heure_debut}:${p.heure_fin}`).join(',')
  useEffect(() => {
    chargerApercu()
  }, [chargerApercu, signaturePlages])

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

  /* Modification d'une plage EXISTANTE — demande client du 2026-10-31 : « il faut que les
     créneaux existants dans paramètres espace admin soient modifiables par l'admin et
     instantanément pris en compte après sauvegarde ». Jusqu'ici il fallait supprimer la plage
     puis la recréer, ce qui obligeait à retaper le jour en plus de l'horaire. */
  async function enregistrerPlage(id: string) {
    if (editionFin <= editionDebut) {
      setEchec('L’heure de fin doit être après l’heure de début.')
      return
    }
    setEchec(null)
    const { error } = await supabase
      .from('creneaux_disponibilites')
      .update({ heure_debut: editionDebut, heure_fin: editionFin })
      .eq('id', id)
    if (error) {
      setEchec(error.message)
      return
    }
    setPlageEnEdition(null)
    setMessage('Plage modifiée.')
    recharger()
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

      {/* Le total, avant le détail plage par plage : c'est la première question que se pose
          l'admin en arrivant ici (« est-ce que mes créneaux sortent ? »). */}
      {apercu && (
        <MessageInfo>
          {apercu.creneauxLibres.length > 0
            ? `${apercu.creneauxLibres.length} créneau${apercu.creneauxLibres.length > 1 ? 'x' : ''} d’appel sont actuellement proposés sur le site public, sur les ${apercu.horizonJours} prochains jours. Toute modification ci-dessous y est répercutée en moins d’une minute.`
            : 'Aucun créneau n’est actuellement proposé sur le site public. Le détail de chaque plage ci-dessous en donne la raison.'}
        </MessageInfo>
      )}

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
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              {plageEnEdition === plage.id ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13.5, color: 'var(--ink)' }}>
                    {JOURS.find((j) => j.valeur === plage.jour_semaine)?.libelle}
                  </strong>
                  <ChampDate type="time" value={editionDebut} onChange={(e) => setEditionDebut(e.target.value)} style={{ ...champStyle, width: 120 }} />
                  <span style={{ color: 'var(--muted)' }}>–</span>
                  <ChampDate type="time" value={editionFin} onChange={(e) => setEditionFin(e.target.value)} style={{ ...champStyle, width: 120 }} />
                </span>
              ) : (
                <span style={{ fontSize: 13.5, color: plage.actif ? 'var(--ink)' : 'var(--muted-2)', textDecoration: plage.actif ? 'none' : 'line-through' }}>
                  <strong>{JOURS.find((j) => j.valeur === plage.jour_semaine)?.libelle}</strong>{' '}
                  {plage.heure_debut.slice(0, 5)} – {plage.heure_fin.slice(0, 5)}
                </span>
              )}
              {/* Ce que cette journée donne VRAIMENT au visiteur. Sans cette ligne, une plage
                  ouverte mais entièrement occupée par l'agenda Google était indiscernable d'une
                  plage qui fonctionne — c'est le défaut signalé le 2026-10-31. */}
              {plage.actif && <LigneApercuJour apercu={apercu} jourSemaine={plage.jour_semaine} />}
            </span>
            <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {plageEnEdition === plage.id ? (
                <>
                  <button type="button" onClick={() => setPlageEnEdition(null)} style={boutonDiscret}>
                    Annuler
                  </button>
                  <button type="button" onClick={() => enregistrerPlage(plage.id)} style={{ ...boutonDiscret, color: 'var(--accent-blue)' }}>
                    Enregistrer
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEchec(null)
                    setEditionDebut(plage.heure_debut.slice(0, 5))
                    setEditionFin(plage.heure_fin.slice(0, 5))
                    setPlageEnEdition(plage.id)
                  }}
                  style={boutonDiscret}
                >
                  Modifier
                </button>
              )}
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
          <ChampDate type="time" value={nouveauDebut} onChange={(e) => setNouveauDebut(e.target.value)} style={champStyle} />
        </Champ>
        <Champ label="À" style={{ minWidth: 120 }}>
          <ChampDate type="time" value={nouveauFin} onChange={(e) => setNouveauFin(e.target.value)} style={champStyle} />
        </Champ>
        <button type="button" onClick={ajouterPlage} className="btn-shine" style={boutonPrimaireStyle}>
          <Icone nom="plus" taille={15} />
          Ajouter la plage
        </button>
      </div>
    </Section>
  )
}

interface ApercuCreneaux {
  dureeMinutes: number
  fuseau: string
  horizonJours: number
  agendaGoogleLu: boolean
  nbPlagesActives: number
  creneauxLibres: string[]
  jours: { jourSemaine: number; libres: number; chevauchentGoogle: number; occupesBase: number; horsDelai: number }[]
}

/* Une phrase, pas un tableau de chiffres : l'admin veut savoir si sa plage « marche », et sinon
   pourquoi. L'ordre des cas suit ce qui explique le plus de créneaux manquants.

   L'agenda Google n'est plus une raison d'absence depuis le 2026-10-31 : il ne bloque plus rien
   (demande client, « les créneaux rendus disponibles doivent l'être au public même s'il y a des
   events dans l'agenda de l'admin »). Il devient un simple avertissement SOUS le décompte des
   créneaux proposés — l'admin reste averti qu'il a un rendez-vous personnel à cette heure-là
   avant de valider une demande, mais le public, lui, voit le créneau. */
function LigneApercuJour({ apercu, jourSemaine }: { apercu: ApercuCreneaux | null; jourSemaine: number }) {
  if (!apercu) return null
  const jour = apercu.jours.find((j) => j.jourSemaine === jourSemaine)
  const libres = jour?.libres ?? 0

  if (libres > 0) {
    const chevauchent = jour?.chevauchentGoogle ?? 0
    return (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 11.5, color: 'var(--accent-teal)' }}>
          {libres} créneau{libres > 1 ? 'x' : ''} proposé{libres > 1 ? 's' : ''} au public sur les {apercu.horizonJours}{' '}
          prochains jours
        </span>
        {chevauchent > 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            dont {chevauchent} pendant un événement de votre agenda Google — proposé{chevauchent > 1 ? 's' : ''} quand
            même, à vous de refuser la demande si cela ne vous arrange pas
          </span>
        )}
      </span>
    )
  }

  const raison = !jour
    ? `aucune date de ce jour ne tombe dans les ${apercu.horizonJours} prochains jours`
    : jour.occupesBase > 0
      ? `des rendez-vous ou des cours y sont déjà planifiés (${jour.occupesBase} créneau${jour.occupesBase > 1 ? 'x' : ''})`
      : jour.horsDelai > 0
        ? 'ils tombent tous sous le délai minimum de réservation'
        : 'la plage est plus courte que la durée d’un appel'

  return <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>Aucun créneau proposé au public : {raison}.</span>
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
