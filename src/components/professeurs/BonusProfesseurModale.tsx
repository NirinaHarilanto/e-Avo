import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useProfileContext } from '../../context/ProfileContext'
import { formaterMontant, LABEL_TYPE_PROGRAMME } from '../../lib/paiements'
import {
  estPaye,
  motifRenouvellement,
  MONTANT_BONUS_DEFAUT,
  renouvellementsProposables,
  totalBonus,
  type EleveAvecForfaits,
  type RenouvellementProposable,
} from '../../lib/bonusProfesseur'
import type { Database } from '../../types/database.types'
import { Modale } from '../ui/Modale'
import { Champ, champStyle } from '../ui/Champ'
import { MessageErreur, MessageInfo } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

type BonusProfesseur = Database['public']['Tables']['bonus_professeur']['Row']

/* Bonus d'un professeur — demande client du 2026-11-17 : « l'admin pourra incrémenter
   manuellement ou modifier le bonus [...] on retrouvera l'historique et statuts des bonus dans
   le pop-up, ceux qui sont payés et ceux qui ne le sont pas encore. »
 *
 * Trois parties, dans cet ordre, parce que c'est l'ordre dans lequel l'admin travaille :
 *   1. ce que l'application a REPÉRÉ et propose d'accorder (les renouvellements de forfait de
 *      ses élèves, un clic chacun) ;
 *   2. la saisie libre, pour un bonus qui ne vient d'aucun renouvellement ;
 *   3. l'historique, chaque ligne avec son statut.
 *
 * Un bonus PAYÉ ne se modifie plus : son montant est parti dans une rémunération et sur une
 * facture, toutes deux figées. L'écran le dit, et la base le refuse de toute façon (trigger
 * 0162) — la règle ne dépend pas de l'écran emprunté. */
export function BonusProfesseurModale({
  teacherId,
  nomProfesseur,
  etablissementId,
  eleves,
  bonus,
  onFermer,
  onChange,
}: {
  teacherId: string
  nomProfesseur: string
  etablissementId: string
  eleves: EleveAvecForfaits[]
  bonus: BonusProfesseur[]
  onFermer: () => void
  onChange: () => void
}) {
  const { profile } = useProfileContext()
  const [montant, setMontant] = useState(String(MONTANT_BONUS_DEFAUT))
  const [motif, setMotif] = useState('')
  const [enEdition, setEnEdition] = useState<BonusProfesseur | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const propositions = renouvellementsProposables(eleves, bonus)
  const totaux = totalBonus(bonus)

  async function accorder(valeurs: { montant: number; motif: string; packageId?: string; studentId?: string }) {
    if (!profile) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('bonus_professeur').insert({
      etablissement_id: etablissementId,
      teacher_id: teacherId,
      montant: valeurs.montant,
      motif: valeurs.motif,
      package_id: valeurs.packageId ?? null,
      student_id: valeurs.studentId ?? null,
      accorde_par: profile.id,
    })
    setEnCours(false)
    if (error) {
      /* L'unicité par forfait (0162) : deux admins, ou deux clics, sur la même proposition. Le
         message brut nommerait l'index en anglais. */
      setErreur(
        error.code === '23505'
          ? 'Un bonus a déjà été accordé pour ce renouvellement.'
          : error.message,
      )
      return
    }
    setMontant(String(MONTANT_BONUS_DEFAUT))
    setMotif('')
    onChange()
  }

  async function enregistrerModification() {
    if (!enEdition) return
    const valeur = Number(montant)
    if (!Number.isFinite(valeur) || valeur <= 0) {
      setErreur('Le montant doit être supérieur à zéro.')
      return
    }
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase
      .from('bonus_professeur')
      .update({ montant: valeur, motif: motif.trim() })
      .eq('id', enEdition.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setEnEdition(null)
    setMontant(String(MONTANT_BONUS_DEFAUT))
    setMotif('')
    onChange()
  }

  async function supprimer(ligne: BonusProfesseur) {
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('bonus_professeur').delete().eq('id', ligne.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  function ouvrirEdition(ligne: BonusProfesseur) {
    setEnEdition(ligne)
    setMontant(String(Number(ligne.montant)))
    setMotif(ligne.motif)
    setErreur(null)
  }

  function libelleProposition(r: RenouvellementProposable): string {
    return `${r.nomEleve} · ${LABEL_TYPE_PROGRAMME[r.typeProgramme]} ${r.totalHeures} h · ${r.rang}ᵉ forfait du ${new Date(r.dateSouscription).toLocaleDateString('fr-FR')}`
  }

  return (
    <Modale titre={`Bonus · ${nomProfesseur}`} onFermer={onFermer} largeurMax={640}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <TotalBonus libelle="En attente de paiement" montant={totaux.enAttente} ton="var(--accent-gold, #e9cf94)" />
          <TotalBonus libelle="Déjà payés" montant={totaux.paye} ton="var(--accent-teal)" />
        </div>

        {/* 1 · Ce que l'application a repéré. Accordé d'un clic, jamais tout seul. */}
        <section>
          <TitreBloc>Renouvellements repérés</TitreBloc>
          {propositions.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0, lineHeight: 1.55 }}>
              Aucun renouvellement de forfait en attente chez ses élèves. Un bonus reste accordable à la main
              ci-dessous.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {propositions.map((r) => (
                <div
                  key={r.packageId}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 9, background: 'var(--voile-doux, rgba(255,255,255,.03))', border: '1px solid var(--border-soft)', flexWrap: 'wrap' }}
                >
                  <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flexGrow: 1, minWidth: 170 }}>
                    {libelleProposition(r)}
                  </span>
                  <button
                    onClick={() =>
                      accorder({
                        montant: MONTANT_BONUS_DEFAUT,
                        motif: motifRenouvellement(r),
                        packageId: r.packageId,
                        studentId: r.studentId,
                      })
                    }
                    disabled={enCours}
                    style={{ ...boutonSecondaireStyle, fontSize: 11.5, padding: '6px 12px' }}
                  >
                    Accorder {formaterMontant(MONTANT_BONUS_DEFAUT)}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 2 · Saisie libre, ou correction d'un bonus déjà accordé. */}
        <section>
          <TitreBloc>{enEdition ? 'Corriger ce bonus' : 'Accorder un bonus'}</TitreBloc>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) minmax(180px, 2fr)', gap: 10 }}>
            <Champ label="Montant" obligatoire>
              <input
                type="number"
                min={1}
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                style={champStyle}
              />
            </Champ>
            <Champ label="Motif" obligatoire>
              <input
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Renouvellement du forfait de…"
                style={champStyle}
              />
            </Champ>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {enEdition && (
              <button
                onClick={() => {
                  setEnEdition(null)
                  setMontant(String(MONTANT_BONUS_DEFAUT))
                  setMotif('')
                  setErreur(null)
                }}
                disabled={enCours}
                style={{ ...boutonNeutreStyle, flexGrow: 1, fontSize: 12.5, padding: 9 }}
              >
                Annuler la correction
              </button>
            )}
            <button
              onClick={() => {
                if (enEdition) {
                  enregistrerModification()
                  return
                }
                const valeur = Number(montant)
                if (!Number.isFinite(valeur) || valeur <= 0) {
                  setErreur('Le montant doit être supérieur à zéro.')
                  return
                }
                if (!motif.trim()) {
                  setErreur('Un motif est obligatoire : c’est ce que vous relirez dans l’historique.')
                  return
                }
                accorder({ montant: valeur, motif: motif.trim() })
              }}
              disabled={enCours}
              className="btn-shine"
              style={{ ...boutonPrimaireStyle, flexGrow: 1, fontSize: 12.5, padding: 9, opacity: enCours ? 0.6 : 1 }}
            >
              {enCours ? 'Enregistrement…' : enEdition ? 'Enregistrer la correction' : 'Accorder le bonus'}
            </button>
          </div>
        </section>

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        {/* 3 · L'historique, chaque ligne avec son statut. */}
        <section>
          <TitreBloc>Historique · {bonus.length} bonus</TitreBloc>
          {bonus.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0 }}>Aucun bonus accordé pour le moment.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {bonus.map((ligne) => {
                const paye = estPaye(ligne)
                return (
                  <div
                    key={ligne.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 9, background: 'var(--voile-doux, rgba(255,255,255,.03))', border: '1px solid var(--border-soft)', flexWrap: 'wrap' }}
                  >
                    <span
                      style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, borderRadius: 999, padding: '3px 9px', flexShrink: 0, color: paye ? 'var(--accent-teal)' : 'var(--accent-gold, #e9cf94)', background: paye ? 'rgba(111,227,192,.14)' : 'rgba(233,207,148,.14)', border: `1px solid ${paye ? 'rgba(111,227,192,.4)' : 'rgba(233,207,148,.4)'}` }}
                    >
                      {paye ? 'Payé' : 'En attente'}
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flexGrow: 1, minWidth: 160 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{ligne.motif}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>
                        Accordé le {new Date(ligne.accorde_le).toLocaleDateString('fr-FR')}
                      </span>
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
                      {formaterMontant(Number(ligne.montant))}
                    </span>
                    {/* Un bonus payé ne se corrige ni ne se supprime : son montant est parti dans
                        une rémunération et sur une facture, toutes deux figées. */}
                    {!paye && (
                      <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={() => ouvrirEdition(ligne)}
                          title="Corriger ce bonus"
                          style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}
                        >
                          <Icone nom="contrats" taille={14} />
                        </button>
                        <button
                          onClick={() => supprimer(ligne)}
                          disabled={enCours}
                          title="Retirer ce bonus"
                          style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}
                        >
                          <Icone nom="supprimer" taille={14} />
                        </button>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <MessageInfo>
          Les bonus en attente sont repris sur le relevé d'heures du professeur au moment où vous le validez :
          ils s'ajoutent alors à sa rémunération et à sa facture, et passent à « payé ».
        </MessageInfo>
      </div>
    </Modale>
  )
}

function TitreBloc({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--accent-blue)', marginBottom: 7 }}
    >
      {children}
    </span>
  )
}

function TotalBonus({ libelle, montant, ton }: { libelle: string; montant: number; ton: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="brand-font" style={{ fontSize: 17, color: ton }}>
        {formaterMontant(montant)}
      </span>
      <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{libelle}</span>
    </div>
  )
}
