import { useEffect, useState, type FormEvent } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { EnTetePage } from '../ui/EnTetePage'
import { Champ, champStyle } from '../ui/Champ'
import { EtatChargement, MessageErreur, MessageSucces } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { IntegrationGoogleMeet } from './IntegrationGoogleMeet'
import { AgendasProfesseursAdmin } from './AgendasProfesseursAdmin'
import { DisponibilitesAdmin } from './DisponibilitesAdmin'
import { JournalErreursAdmin } from './JournalErreursAdmin'
import type { Database } from '../../types/database.types'
import { ChampDate } from '../ui/ChampDate'

type Etablissement = Database['public']['Tables']['etablissements']['Row']


export function ParametresAdmin() {
  const { profile } = useProfileContext()
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null)
  const [loading, setLoading] = useState(true)
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
      />

      {loading ? (
        <EtatChargement lignes={1} hauteur={220} />
      ) : (
        <form onSubmit={enregistrer} className="card" style={{ maxWidth: 560, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 16, color: 'var(--accent-gold, #e9cf94)', margin: 0 }}>Cours collectifs</h2>

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
                <ChampDate type="time" value={creneauMatin} onChange={(e) => setCreneauMatin(e.target.value)} style={champStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Midi</span>
                <ChampDate type="time" value={creneauMidi} onChange={(e) => setCreneauMidi(e.target.value)} style={champStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Soir</span>
                <ChampDate type="time" value={creneauSoir} onChange={(e) => setCreneauSoir(e.target.value)} style={champStyle} />
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

        {/* Juste après l'agenda de l'établissement : les deux se lisent ensemble depuis 0107 — ce
            compte-ci porte les rendez-vous de l'administration, celui de chaque professeur porte
            ses cours. */}
        <AgendasProfesseursAdmin />

        <DisponibilitesAdmin />

        {/* En dernier : on ne le consulte qu'en cas de doute, il n'a pas à occuper le haut de la
            page tant que rien ne va mal. */}
        <JournalErreursAdmin />
      </div>
    </AdminLayout>
  )
}
