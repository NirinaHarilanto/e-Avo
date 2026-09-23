import { useEffect, useState, type FormEvent } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { Champ, champStyle } from '../ui/Champ'
import { EtatChargement, MessageErreur, MessageSucces } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { IntegrationGoogleMeet } from './IntegrationGoogleMeet'
import { DisponibilitesAdmin } from './DisponibilitesAdmin'
import type { Database } from '../../types/database.types'

type Etablissement = Database['public']['Tables']['etablissements']['Row']


export function ParametresAdmin() {
  const { profile } = useProfileContext()
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null)
  const [loading, setLoading] = useState(true)
  const [calendlyUrl, setCalendlyUrl] = useState('')
  const [heuresForfaitCollectif, setHeuresForfaitCollectif] = useState(32)
  const [creneauMatin, setCreneauMatin] = useState('07:00')
  const [creneauMidi, setCreneauMidi] = useState('12:00')
  const [creneauSoir, setCreneauSoir] = useState('19:00')
  const [relanceEcheanceJours, setRelanceEcheanceJours] = useState(3)
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enregistre, setEnregistre] = useState(false)

  useEffect(() => {
    if (!profile) return
    supabase
      .from('etablissements')
      .select('*')
      .eq('id', profile.etablissement_id)
      .maybeSingle()
      .then(({ data }) => {
        setEtablissement(data)
        setCalendlyUrl(data?.calendly_url ?? '')
        setHeuresForfaitCollectif(data?.heures_forfait_collectif ?? 32)
        setCreneauMatin(data?.creneau_matin?.slice(0, 5) ?? '07:00')
        setCreneauMidi(data?.creneau_midi?.slice(0, 5) ?? '12:00')
        setCreneauSoir(data?.creneau_soir?.slice(0, 5) ?? '19:00')
        setRelanceEcheanceJours(data?.relance_echeance_jours ?? 3)
        setLoading(false)
      })
  }, [profile])

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    if (!etablissement) return
    setEnregistrement(true)
    setErreur(null)
    setEnregistre(false)
    const { error } = await supabase
      .from('etablissements')
      .update({
        calendly_url: calendlyUrl.trim() || null,
        heures_forfait_collectif: heuresForfaitCollectif,
        creneau_matin: creneauMatin,
        creneau_midi: creneauMidi,
        creneau_soir: creneauSoir,
        relance_echeance_jours: relanceEcheanceJours,
      })
      .eq('id', etablissement.id)
    setEnregistrement(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setEnregistre(true)
  }

  return (
    <AdminLayout actif="Paramètres">
      <EnTetePage
        titre="Paramètres"
        description="Les réglages propres à votre établissement. Ils s'appliquent à votre page vitrine publique et au parcours de vos visiteurs."
      />

      <GuidePage
        id="admin-parametres"
        etapes={[
          <>
            Le <strong>lien Calendly</strong> est facultatif. Laissé vide, le formulaire de réservation de votre page
            vitrine se contente d'enregistrer le visiteur comme prospect.
          </>,
          <>
            Renseigné, le visiteur est d'abord enregistré comme prospect, <strong>puis redirigé</strong> vers votre
            Calendly pour choisir son créneau lui-même : vous n'avez plus à organiser la prise de rendez-vous.
          </>,
          <>
            Dans les deux cas, le dossier apparaît dans la page <strong>Prospects</strong>, où vous le faites avancer
            jusqu'à sa conversion en étudiant.
          </>,
          <>
            Les <strong>3 créneaux horaires</strong> (matin/midi/soir) réglés ci-dessous sont ceux proposés pour les{' '}
            <strong>classes de niveau</strong> des cours collectifs, page « Cours collectifs ». Les changer ici les
            change pour toutes les promotions.
          </>,
        ]}
      />

      {loading ? (
        <EtatChargement lignes={1} hauteur={220} />
      ) : (
        <form onSubmit={enregistrer} className="card" style={{ maxWidth: 560, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 16, color: 'var(--accent-gold, #e9cf94)', margin: 0 }}>Réservation des appels</h2>

          <Champ
            label="Lien Calendly"
            aide="Si renseigné, un visiteur qui valide le formulaire de réservation de votre page vitrine est d'abord enregistré comme prospect, puis redirigé vers ce lien pour choisir son créneau directement sur votre Calendly."
          >
            <input
              type="url"
              placeholder="https://calendly.com/votre-etablissement/appel-diagnostic"
              value={calendlyUrl}
              onChange={(e) => setCalendlyUrl(e.target.value)}
              style={champStyle}
            />
          </Champ>

          <h2 style={{ fontSize: 16, color: 'var(--accent-gold, #e9cf94)', margin: '8px 0 0' }}>Cours collectifs</h2>

          <Champ
            label="Forfait d’heures par élève en cours collectif"
            aide="Appliqué automatiquement à chaque élève inscrit dans une vague. La dernière heure est consacrée à son évaluation. Une vague peut fixer sa propre valeur depuis sa fiche."
          >
            <input
              type="number"
              min={1}
              max={500}
              value={heuresForfaitCollectif}
              onChange={(e) => setHeuresForfaitCollectif(Number(e.target.value))}
              style={champStyle}
            />
          </Champ>

          <Champ label="Créneaux horaires des classes" aide="Heures par défaut des classes de niveau matin/midi/soir des cours collectifs.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Matin</span>
                <input type="time" value={creneauMatin} onChange={(e) => setCreneauMatin(e.target.value)} style={champStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Midi</span>
                <input type="time" value={creneauMidi} onChange={(e) => setCreneauMidi(e.target.value)} style={champStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Soir</span>
                <input type="time" value={creneauSoir} onChange={(e) => setCreneauSoir(e.target.value)} style={champStyle} />
              </div>
            </div>
          </Champ>

          <h2 style={{ fontSize: 16, color: 'var(--accent-gold, #e9cf94)', margin: '8px 0 0' }}>Relances de paiement</h2>

          <Champ
            label="Prévenir combien de jours avant une échéance"
            aide="Une notification part automatiquement à l’élève à l’approche de chaque échéance de son échéancier, puis le jour du dépassement. 0 pour ne prévenir que le jour même."
          >
            <input
              type="number"
              min={0}
              max={60}
              value={relanceEcheanceJours}
              onChange={(e) => setRelanceEcheanceJours(Number(e.target.value))}
              style={champStyle}
            />
          </Champ>

          {erreur && <MessageErreur>{erreur}</MessageErreur>}
          {enregistre && <MessageSucces>Réglages enregistrés.</MessageSucces>}

          <button
            type="submit"
            disabled={enregistrement}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, alignSelf: 'flex-start', fontSize: 13.5, padding: '11px 20px', opacity: enregistrement ? 0.7 : 1 }}
          >
            {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}

      <div style={{ marginTop: 20 }}>
        <IntegrationGoogleMeet />

        <DisponibilitesAdmin />
      </div>
    </AdminLayout>
  )
}
