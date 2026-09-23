import { useCallback, useEffect, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { formaterMontant } from '../../lib/paiements'
import type { Database } from '../../types/database.types'
import { champStyle } from '../ui/Champ'
import { boutonSecondaireStyle } from '../ui/Boutons'
import { MessageErreur } from '../ui/Etats'

type Echeance = Database['public']['Tables']['paiement_echeances']['Row']

/* Échéancier d'une ligne de paiement — demande client du 2026-09-23 (point 12) : « la
   possibilité de planifier une échéance de paiement avec les relances automatiques liées au
   paiement à l'approche des échéances ».

   Une échéance annonce ce qui reste à encaisser ; l'acompte (paiement_versements, 0049) constate
   ce qui l'a été. Les deux coexistent sur la même ligne de paiement, et rien ne les rapproche
   automatiquement : c'est l'admin qui coche une échéance comme réglée, parce qu'un versement ne
   correspond pas toujours à une échéance (règlement anticipé, montant arrondi…). */
export function EcheancierPaiement({
  studentPaymentId,
  etablissementId,
  devise,
  resteDu,
  relanceJours,
}: {
  studentPaymentId: string
  etablissementId: string
  devise: string
  resteDu: number
  relanceJours: number
}) {
  const { profile } = useProfileContext()
  const [echeances, setEcheances] = useState<Echeance[] | null>(null)
  const [montant, setMontant] = useState('')
  const [date, setDate] = useState('')
  const [libelle, setLibelle] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('paiement_echeances')
      .select('*')
      .eq('student_payment_id', studentPaymentId)
      .order('date_echeance')
    setEcheances(data ?? [])
  }, [studentPaymentId])

  useEffect(() => {
    charger()
  }, [charger])

  const planifie = (echeances ?? []).filter((e) => !e.reglee_le).reduce((total, e) => total + e.montant, 0)

  async function ajouter() {
    if (!profile || !montant || !date) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('paiement_echeances').insert({
      etablissement_id: etablissementId,
      student_payment_id: studentPaymentId,
      libelle: libelle.trim() || null,
      montant: Number(montant),
      date_echeance: date,
      created_by_profile_id: profile.id,
    })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setMontant('')
    setDate('')
    setLibelle('')
    charger()
  }

  async function basculerReglee(echeance: Echeance) {
    setErreur(null)
    const { error } = await supabase
      .from('paiement_echeances')
      .update({ reglee_le: echeance.reglee_le ? null : new Date().toISOString().slice(0, 10) })
      .eq('id', echeance.id)
    if (error) {
      setErreur(error.message)
      return
    }
    charger()
  }

  async function supprimer(id: string) {
    setErreur(null)
    const { error } = await supabase.from('paiement_echeances').delete().eq('id', id)
    if (error) {
      setErreur(error.message)
      return
    }
    charger()
  }

  const aujourdhui = new Date().toISOString().slice(0, 10)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>
        Échéancier
      </span>

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {echeances === null ? null : echeances.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0, lineHeight: 1.5 }}>
          Aucune échéance planifiée. Ajoutez-en pour étaler le reste dû ({formaterMontant(resteDu, devise)}) : l’élève
          sera prévenu automatiquement {relanceJours > 0 ? `${relanceJours} jour${relanceJours > 1 ? 's' : ''} avant` : 'le jour'} de chacune.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {echeances.map((echeance) => {
            const enRetard = !echeance.reglee_le && echeance.date_echeance < aujourdhui
            return (
              <div
                key={echeance.id}
                style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', padding: '6px 4px', borderBottom: '1px solid var(--border-soft)' }}
              >
                <input
                  type="checkbox"
                  checked={!!echeance.reglee_le}
                  onChange={() => basculerReglee(echeance)}
                  aria-label={`Marquer l’échéance du ${echeance.date_echeance} comme réglée`}
                  style={{ accentColor: 'var(--accent-teal)' }}
                />
                <span style={{ fontSize: 12.5, color: enRetard ? 'var(--danger)' : 'var(--ink)', flexGrow: 1, minWidth: 130 }}>
                  {new Date(echeance.date_echeance).toLocaleDateString('fr-FR')}
                  {echeance.libelle ? ` · ${echeance.libelle}` : ''}
                  {enRetard ? ' · en retard' : ''}
                </span>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: echeance.reglee_le ? 'var(--accent-teal)' : 'var(--ink-2)',
                    textDecoration: echeance.reglee_le ? 'line-through' : 'none',
                  }}
                >
                  {formaterMontant(echeance.montant, devise)}
                </span>
                {echeance.relance_envoyee_le && (
                  <span style={{ fontSize: 10.5, color: 'var(--muted-2)' }}>
                    relancé le {new Date(echeance.relance_envoyee_le).toLocaleDateString('fr-FR')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => supprimer(echeance.id)}
                  aria-label="Supprimer cette échéance"
                  style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
                >
                  ×
                </button>
              </div>
            )
          })}
          <span style={{ fontSize: 11.5, color: 'var(--muted)', paddingTop: 5 }}>
            Planifié et non réglé : {formaterMontant(planifie, devise)} sur {formaterMontant(resteDu, devise)} restant dus.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input
          type="number"
          min={1}
          placeholder="Montant"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
          style={{ ...champStyle, width: 120 }}
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...champStyle, width: 155 }} />
        <input
          placeholder="Libellé (facultatif)"
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          style={{ ...champStyle, flexGrow: 1, minWidth: 130 }}
        />
        <button type="button" onClick={ajouter} disabled={enCours || !montant || !date} style={boutonSecondaireStyle}>
          Planifier
        </button>
      </div>
    </div>
  )
}
