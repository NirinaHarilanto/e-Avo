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
import { CreneauxClassesAdmin } from './CreneauxClassesAdmin'
import type { Database } from '../../types/database.types'

type Etablissement = Database['public']['Tables']['etablissements']['Row']


export function ParametresAdmin() {
  const { profile } = useProfileContext()
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null)
  const [loading, setLoading] = useState(true)
  const [heuresForfaitCollectif, setHeuresForfaitCollectif] = useState(32)
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
        {/* Les trois créneaux matin/midi/soir vivaient dans le formulaire ci-dessus, en trois
            champs figés. Ils forment désormais une liste que l'administration allonge elle-même
            (0150, demande client du 2026-10-31) — d'où un bloc à part, qui enregistre ligne par
            ligne au lieu d'attendre le bouton « Enregistrer » du formulaire. */}
        <CreneauxClassesAdmin />

        <IntegrationGoogleMeet />

        {/* Juste après l'agenda de l'établissement : les deux se lisent ensemble depuis 0107 — ce
            compte-ci porte les rendez-vous de l'administration, celui de chaque professeur porte
            ses cours. */}
        <AgendasProfesseursAdmin />

        <DisponibilitesAdmin />

        {/* Le bloc « Journal des erreurs » (JournalErreursAdmin.tsx, migration 0121) a été retiré
            de cet écran — demande client du 2026-10-20, le composant a été supprimé avec lui. La
            table `journal_erreurs` et l'écriture faite par FrontiereErreur.tsx restent en place :
            seule sa LECTURE ici a disparu, pas la collecte. */}
      </div>
    </AdminLayout>
  )
}
