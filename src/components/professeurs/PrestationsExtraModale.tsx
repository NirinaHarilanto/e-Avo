import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useProfileContext } from '../../context/ProfileContext'
import { formaterMontant } from '../../lib/paiements'
import {
  estPaye,
  formaterDuree,
  libelleExtra,
  LIBELLE_STATUT_EXTRA,
  STATUTS_EXTRA,
  totauxExtra,
  type StatutExtra,
} from '../../lib/prestationsExtra'
import type { Database } from '../../types/database.types'
import { Modale } from '../ui/Modale'
import { Champ, champStyle } from '../ui/Champ'
import { ChampDate } from '../ui/ChampDate'
import { ListeChoix } from '../ui/ListeChoix'
import { MessageErreur, MessageInfo } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

type PrestationExtra = Database['public']['Tables']['prestations_extra']['Row']

/* Prestations « Extra » d'un professeur, côté ADMIN — demande client du 2026-11-17 : « l'admin
   pourra attribuer une prestation, autre que ce qui est déjà défini à ce jour dans HOC [...]
   l'admin pourra définir le type de prestation, la durée, le montant de la prestation, le statut
   de la prestation, date et lieu de la prestation. »
 *
 * Le pendant en lecture seule, pour le professeur, est HistoriqueExtraModale.tsx.
 *
 * Une prestation PAYÉE ne se modifie plus : son montant est parti dans une rémunération et sur
 * une facture, toutes deux figées. L'écran ne montre alors aucun bouton, et la base refuserait
 * de toute façon l'écriture (trigger 0163) — la règle ne dépend pas de l'écran emprunté. */
export function PrestationsExtraModale({
  teacherId,
  nomProfesseur,
  etablissementId,
  extras,
  onFermer,
  onChange,
}: {
  teacherId: string
  nomProfesseur: string
  etablissementId: string
  extras: PrestationExtra[]
  onFermer: () => void
  onChange: () => void
}) {
  const { profile } = useProfileContext()
  const [enEdition, setEnEdition] = useState<PrestationExtra | null>(null)
  const [type, setType] = useState('')
  const [montant, setMontant] = useState('')
  const [duree, setDuree] = useState('')
  const [datePrestation, setDatePrestation] = useState(() => new Date().toISOString().slice(0, 10))
  const [lieu, setLieu] = useState('')
  const [statut, setStatut] = useState<StatutExtra>('planifiee')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const totaux = totauxExtra(extras)

  function reinitialiser() {
    setEnEdition(null)
    setType('')
    setMontant('')
    setDuree('')
    setDatePrestation(new Date().toISOString().slice(0, 10))
    setLieu('')
    setStatut('planifiee')
    setErreur(null)
  }

  function ouvrirEdition(extra: PrestationExtra) {
    setEnEdition(extra)
    setType(extra.type_prestation)
    setMontant(String(Number(extra.montant)))
    setDuree(extra.duree_minutes === null ? '' : String(extra.duree_minutes))
    setDatePrestation(extra.date_prestation)
    setLieu(extra.lieu ?? '')
    setStatut(extra.statut)
    setErreur(null)
  }

  async function enregistrer() {
    if (!profile) return
    const valeurMontant = Number(montant)
    if (!type.trim()) {
      setErreur('Le type de prestation est obligatoire : c’est l’intitulé qui figurera sur le relevé.')
      return
    }
    if (!Number.isFinite(valeurMontant) || valeurMontant <= 0) {
      setErreur('Le montant doit être supérieur à zéro.')
      return
    }
    /* Durée facultative, mais pas n'importe laquelle : la base la borne à 24 h (0163), autant le
       dire ici plutôt que de laisser remonter l'erreur de contrainte. */
    const valeurDuree = duree.trim() === '' ? null : Number(duree)
    if (valeurDuree !== null && (!Number.isInteger(valeurDuree) || valeurDuree <= 0 || valeurDuree > 1440)) {
      setErreur('La durée doit être un nombre de minutes entre 1 et 1440 (24 h), ou rester vide.')
      return
    }

    setEnCours(true)
    setErreur(null)
    const champs = {
      type_prestation: type.trim(),
      montant: valeurMontant,
      duree_minutes: valeurDuree,
      date_prestation: datePrestation,
      lieu: lieu.trim() || null,
      statut,
    }
    const { error } = enEdition
      ? await supabase.from('prestations_extra').update(champs).eq('id', enEdition.id)
      : await supabase.from('prestations_extra').insert({
          ...champs,
          etablissement_id: etablissementId,
          teacher_id: teacherId,
          cree_par: profile.id,
        })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    reinitialiser()
    onChange()
  }

  async function supprimer(extra: PrestationExtra) {
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('prestations_extra').delete().eq('id', extra.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
  }

  return (
    <Modale titre={`Extra · ${nomProfesseur}`} onFermer={onFermer} largeurMax={660}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Total libelle="Planifié" montant={totaux.planifie} ton="var(--muted)" />
          <Total libelle="Validé, à payer" montant={totaux.aPayer} ton="var(--accent-gold, #e9cf94)" />
          <Total libelle="Déjà payé" montant={totaux.paye} ton="var(--accent-teal)" />
        </div>

        <section>
          <TitreBloc>{enEdition ? 'Corriger cette prestation' : 'Attribuer une prestation'}</TitreBloc>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Champ label="Type de prestation" obligatoire>
              <input
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="Atelier, traduction, jury…"
                style={champStyle}
              />
            </Champ>
            {/* « Coût de la prestation », pas « Montant » seul — demande client du 2026-11-17,
                capture à l'appui : un montant isolé ne dit pas s'il s'agit d'un coût pour
                l'établissement ou d'un autre chiffre lié à la prestation. */}
            <Champ label="Coût de la prestation" obligatoire>
              <input type="number" min={1} value={montant} onChange={(e) => setMontant(e.target.value)} style={champStyle} />
            </Champ>
            <Champ label="Durée (minutes)" aide="Facultative : certaines prestations se paient au forfait.">
              <input type="number" min={1} max={1440} value={duree} onChange={(e) => setDuree(e.target.value)} style={champStyle} />
            </Champ>
            <Champ label="Date de la prestation" obligatoire>
              <ChampDate value={datePrestation} onChange={(e) => setDatePrestation(e.target.value)} style={champStyle} />
            </Champ>
            <Champ label="Lieu">
              <input value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="En ligne, locaux du client…" style={champStyle} />
            </Champ>
            {/* Seule « Validée » ouvre le paiement : le dire ici évite de croire qu'attribuer
                une prestation suffit à la faire payer. */}
            <Champ label="Statut" aide="Seule une prestation validée part au relevé d’heures.">
              <ListeChoix
                options={STATUTS_EXTRA.map((s) => ({ id: s.valeur, libelle: s.libelle }))}
                valeur={statut}
                onChange={(v) => setStatut(v as StatutExtra)}
              />
            </Champ>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {enEdition && (
              <button onClick={reinitialiser} disabled={enCours} style={{ ...boutonNeutreStyle, flexGrow: 1, fontSize: 12.5, padding: 9 }}>
                Annuler la correction
              </button>
            )}
            <button
              onClick={enregistrer}
              disabled={enCours}
              className="btn-shine"
              style={{ ...boutonPrimaireStyle, flexGrow: 1, fontSize: 12.5, padding: 9, opacity: enCours ? 0.6 : 1 }}
            >
              {enCours ? 'Enregistrement…' : enEdition ? 'Enregistrer la correction' : 'Attribuer la prestation'}
            </button>
          </div>
        </section>

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        <section>
          <TitreBloc>Historique · {extras.length} prestation{extras.length > 1 ? 's' : ''}</TitreBloc>
          {extras.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0 }}>Aucune prestation attribuée pour le moment.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {extras.map((extra) => (
                <LigneExtra
                  key={extra.id}
                  extra={extra}
                  onCorriger={() => ouvrirEdition(extra)}
                  onSupprimer={() => supprimer(extra)}
                  enCours={enCours}
                />
              ))}
            </div>
          )}
        </section>

        <MessageInfo>
          Les prestations <strong>validées</strong> sont reprises sur le relevé d'heures du professeur au moment où vous
          le validez : elles s'ajoutent alors à sa rémunération et à sa facture, et passent à « payé ».
        </MessageInfo>
      </div>
    </Modale>
  )
}

/* Une ligne d'historique, partagée entre l'admin (avec ses deux boutons) et le professeur (sans
   aucun) — même présentation des deux côtés, pour qu'ils parlent de la même chose. */
export function LigneExtra({
  extra,
  onCorriger,
  onSupprimer,
  enCours,
}: {
  extra: PrestationExtra
  onCorriger?: () => void
  onSupprimer?: () => void
  enCours?: boolean
}) {
  const paye = estPaye(extra)
  const ton =
    paye || extra.statut === 'validee'
      ? { couleur: 'var(--accent-teal)', fond: 'rgba(111,227,192,.14)', bord: 'rgba(111,227,192,.4)' }
      : extra.statut === 'annulee'
        ? { couleur: 'var(--danger)', fond: 'rgba(224,88,88,.12)', bord: 'rgba(224,88,88,.35)' }
        : { couleur: 'var(--accent-gold, #e9cf94)', fond: 'rgba(233,207,148,.14)', bord: 'rgba(233,207,148,.4)' }
  const duree = formaterDuree(extra.duree_minutes)

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 9, background: 'var(--voile-doux, rgba(255,255,255,.03))', border: '1px solid var(--border-soft)', flexWrap: 'wrap' }}
    >
      <span
        style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, borderRadius: 999, padding: '3px 9px', flexShrink: 0, color: ton.couleur, background: ton.fond, border: `1px solid ${ton.bord}` }}
      >
        {paye ? 'Payée' : LIBELLE_STATUT_EXTRA[extra.statut]}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flexGrow: 1, minWidth: 170 }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{libelleExtra(extra)}</span>
        {duree && <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Durée : {duree}</span>}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{formaterMontant(Number(extra.montant))}</span>
      {/* Payée : plus aucun bouton. Son montant est parti dans une rémunération et sur une
          facture, toutes deux figées. */}
      {!paye && (onCorriger || onSupprimer) && (
        <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {onCorriger && (
            <button
              onClick={onCorriger}
              title="Corriger cette prestation"
              style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}
            >
              <Icone nom="contrats" taille={14} />
            </button>
          )}
          {onSupprimer && (
            <button
              onClick={onSupprimer}
              disabled={enCours}
              title="Retirer cette prestation"
              style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}
            >
              <Icone nom="supprimer" taille={14} />
            </button>
          )}
        </span>
      )}
    </div>
  )
}

export function TitreBloc({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--accent-blue)', marginBottom: 7 }}
    >
      {children}
    </span>
  )
}

export function Total({ libelle, montant, ton }: { libelle: string; montant: number; ton: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="brand-font" style={{ fontSize: 17, color: ton }}>
        {formaterMontant(montant)}
      </span>
      <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{libelle}</span>
    </div>
  )
}
