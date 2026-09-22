import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useDemandesForfait } from '../../hooks/useDemandesForfait'
import { Modale } from '../ui/Modale'
import { Champ, champStyle } from '../ui/Champ'
import { MessageErreur, MessageSucces } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'

/* Demande de forfait supplémentaire, côté élève (0061) — demande client du 2026-09-22.
   L'élève ne crée qu'une INTENTION : rien n'est ajouté à son compteur d'heures avant que
   l'admin ne la valide (et enregistre le paiement dans le même geste, voir
   AjouterForfaitModale). Une demande déjà en attente bloque l'envoi d'une seconde, pour éviter
   à l'admin de devoir trier des doublons. */
export function DemandeForfaitEtudiant({ studentId }: { studentId: string }) {
  const { enAttente, recharger } = useDemandesForfait(studentId)
  const [ouvert, setOuvert] = useState(false)
  const [heures, setHeures] = useState('')
  const [message, setMessage] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoyee, setEnvoyee] = useState(false)

  async function envoyer() {
    if (!heures || Number(heures) <= 0) return
    setEnCours(true)
    setErreur(null)
    const { data: profil } = await supabase.from('profiles').select('etablissement_id').eq('id', studentId).single()
    if (!profil) {
      setEnCours(false)
      setErreur('Profil introuvable.')
      return
    }
    const { error } = await supabase.from('demandes_forfait').insert({
      etablissement_id: profil.etablissement_id,
      student_id: studentId,
      heures_demandees: Number(heures),
      message: message.trim() || null,
    })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setEnvoyee(true)
    setHeures('')
    setMessage('')
    recharger()
  }

  if (enAttente.length > 0) {
    return (
      <div style={{ padding: '11px 13px', borderRadius: 12, border: '1px solid rgba(233,207,148,.35)', background: 'rgba(233,207,148,.08)' }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
          Votre demande de <strong>{enAttente[0].heures_demandees} h</strong> supplémentaires est en attente de
          validation par l’établissement.
        </span>
      </div>
    )
  }

  return (
    <>
      <button onClick={() => setOuvert(true)} className="btn-shine btn-secondary" style={{ alignSelf: 'flex-start' }}>
        Demander un forfait supplémentaire
      </button>

      {ouvert && (
        <Modale
          titre="Demander un forfait supplémentaire"
          onFermer={() => {
            setOuvert(false)
            setEnvoyee(false)
          }}
          largeurMax={420}
        >
          {envoyee ? (
            <MessageSucces>
              Votre demande a été envoyée à l’établissement. Vous serez prévenu(e) dès qu’elle sera traitée.
            </MessageSucces>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)', margin: 0 }}>
                L’établissement vérifiera le paiement avant de valider : les heures ne s’ajoutent à votre
                compteur qu’une fois la demande acceptée.
              </p>
              <Champ label="Heures souhaitées" obligatoire>
                <input type="number" min={0.5} step="0.5" value={heures} onChange={(e) => setHeures(e.target.value)} style={champStyle} />
              </Champ>
              <Champ label="Un mot pour l’établissement (facultatif)">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </Champ>
              {erreur && <MessageErreur>{erreur}</MessageErreur>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setOuvert(false)} style={{ ...boutonNeutreStyle, flexGrow: 1 }}>
                  Annuler
                </button>
                <button
                  onClick={envoyer}
                  disabled={enCours || !heures || Number(heures) <= 0}
                  className="btn-shine"
                  style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours || !heures ? 0.6 : 1 }}
                >
                  {enCours ? 'Envoi…' : 'Envoyer la demande'}
                </button>
              </div>
            </div>
          )}
        </Modale>
      )}
    </>
  )
}
