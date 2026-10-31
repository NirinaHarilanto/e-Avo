import { jourDansFuseauEtablissement } from '../../lib/etablissement'
import { useCallback, useEffect, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { arrondi, formaterMontant, verdictEcheancier } from '../../lib/paiements'
import type { Database } from '../../types/database.types'
import { champStyle, etiquetteStyle } from '../ui/Champ'
import { boutonSecondaireStyle, Bouton } from '../ui/Boutons'
import { MessageErreur } from '../ui/Etats'
import { ChampDate } from '../ui/ChampDate'

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
    /* Prévenir AVANT d'écrire quand la nouvelle échéance ferait dépasser ce qu'il reste à
       encaisser — demande client du 2026-10-31. On avertit sans bloquer : l'admin peut
       légitimement planifier puis retirer un acompte saisi par erreur, et c'est lui qui connaît
       l'accord passé avec l'élève. Mais il ne doit plus pouvoir le faire sans s'en apercevoir,
       ce qui est exactement ce qui s'est produit sur la ligne de 1 100 000 Ar. */
    const nouveauPlanifie = arrondi(planifie + Number(montant))
    if (nouveauPlanifie > resteDu) {
      const message =
        resteDu === 0
          ? `Cette ligne est déjà soldée : il n'y a plus rien à encaisser. Planifier ${formaterMontant(Number(montant), devise)} de plus ?`
          : `Vous planifierez ${formaterMontant(nouveauPlanifie, devise)} alors qu'il ne reste que ${formaterMontant(resteDu, devise)} à encaisser. Continuer ?`
      if (!window.confirm(message)) return
    }
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
      .update({ reglee_le: echeance.reglee_le ? null : jourDansFuseauEtablissement() })
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

  const aujourdhui = jourDansFuseauEtablissement()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
      <span style={{ ...etiquetteStyle, fontSize: 11 }}>Échéancier</span>

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {echeances === null ? null : echeances.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0, lineHeight: 1.5 }}>
          {/* Ne plus inviter à « étaler le reste dû (0,00 Ar) » sur une ligne déjà soldée —
              signalé le 2026-10-31 : la phrase poussait à planifier une échéance qui ne
              correspondait plus à rien, et c'est ainsi qu'une ligne payée s'est retrouvée avec
              600 000 Ar encore planifiés. */}
          {resteDu > 0 ? (
            <>
              Aucune échéance planifiée. Ajoutez-en pour étaler le reste dû ({formaterMontant(resteDu, devise)}) : l’élève
              sera prévenu automatiquement {relanceJours > 0 ? `${relanceJours} jour${relanceJours > 1 ? 's' : ''} avant` : 'le jour'} de chacune.
            </>
          ) : (
            <>Rien à encaisser sur cette ligne : elle est soldée, il n’y a pas d’échéance à planifier.</>
          )}
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
          {/* Remplace « Planifié et non réglé : 600 000 Ar sur 0,00 Ar restant dus », qui se
              contredisait tout seul : les deux chiffres étaient calculés séparément et imprimés
              côte à côte sans jamais être comparés (signalé par le client le 2026-10-31). Le
              verdict les rapproche et dit ce qu'il en est — y compris, et surtout, quand on a
              planifié plus qu'il n'en reste à encaisser. */}
          <SyntheseEcheancier planifie={planifie} resteDu={resteDu} devise={devise} />
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
        <ChampDate type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...champStyle, width: 155 }} />
        <input
          placeholder="Libellé (facultatif)"
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          style={{ ...champStyle, flexGrow: 1, minWidth: 130 }}
        />
        <Bouton
          onClick={ajouter}
          enCours={enCours}
          disabled={!montant || !date}
          libelle="Planifier"
          libelleEnCours="Planification…"
          style={boutonSecondaireStyle}
        />
      </div>
    </div>
  )
}

/* Ce que l'échéancier et les acomptes disent ENSEMBLE — le rapprochement qui manquait (voir
   `verdictEcheancier`, lib/paiements.ts). L'excédent est le seul cas mis en avant : c'est une
   contradiction dans le dossier, pas une simple information, et le client a demandé qu'elle soit
   « mise en valeur ». Les trois autres cas restent en gris discret, ce sont des états normaux. */
function SyntheseEcheancier({ planifie, resteDu, devise }: { planifie: number; resteDu: number; devise: string }) {
  const verdict = verdictEcheancier(planifie, resteDu)

  if (verdict.cas === 'excedent') {
    return (
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          marginTop: 6,
          padding: '8px 10px',
          borderRadius: 10,
          border: '1px solid rgba(233,207,148,.42)',
          background: 'rgba(233,207,148,.12)',
          fontSize: 11.5,
          lineHeight: 1.5,
          color: 'var(--ink-2)',
        }}
      >
        <strong style={{ color: 'var(--warning)' }}>
          {formaterMontant(verdict.excedent, devise)} planifiés de trop
        </strong>
        {verdict.resteDu === 0
          ? `Cette ligne est déjà soldée : ${formaterMontant(verdict.planifie, devise)} restent pourtant planifiés et non réglés. Cochez les échéances déjà encaissées, ou supprimez celles qui font double emploi avec un acompte.`
          : `${formaterMontant(verdict.planifie, devise)} sont planifiés alors qu’il ne reste que ${formaterMontant(verdict.resteDu, devise)} à encaisser. Cochez les échéances déjà réglées par un acompte, ou corrigez les montants.`}
      </span>
    )
  }

  const texte =
    verdict.cas === 'couvert'
      ? `Tout le reste dû est planifié : ${formaterMontant(verdict.planifie, devise)}, non encore réglés.`
      : verdict.cas === 'partiel'
        ? `Planifié et non réglé : ${formaterMontant(verdict.planifie, devise)}. Reste à planifier : ${formaterMontant(verdict.aPlanifier, devise)}.`
        : verdict.cas === 'a_planifier'
          ? `Rien de planifié pour l’instant : ${formaterMontant(verdict.resteDu, devise)} restent à encaisser.`
          : 'Toutes les échéances sont réglées : cette ligne est soldée.'

  return <span style={{ fontSize: 11.5, color: 'var(--muted)', paddingTop: 5 }}>{texte}</span>
}
