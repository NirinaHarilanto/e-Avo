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
import type { Database } from '../../types/database.types'

type Etablissement = Database['public']['Tables']['etablissements']['Row']


export function ParametresAdmin() {
  const { profile } = useProfileContext()
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null)
  const [loading, setLoading] = useState(true)
  const [calendlyUrl, setCalendlyUrl] = useState('')
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
      .update({ calendly_url: calendlyUrl.trim() || null })
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
      </div>
    </AdminLayout>
  )
}
