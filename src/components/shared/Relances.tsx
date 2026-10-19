import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { MotifRelance } from '../../types/database.types'
import { useRelances, type Relance } from '../../hooks/useRelances'
import { MessageErreur } from '../ui/Etats'

/* Relances d'un prospect ou d'un étudiant : le bouton qui déclenche l'envoi et l'historique de ce
   qui est déjà parti — demandes client 2, 4 et 7 du 2026-10-19.

   Un seul composant pour les trois motifs : c'est trois fois le même geste du point de vue de
   l'admin (un clic, un e-mail, une trace), et l'écart entre eux se résume à un libellé et à une
   route. Les trois partagent surtout la propriété qui a motivé la demande : une relance peut être
   répétée, donc le bouton ne se désarme jamais — il affiche seulement combien de fois il a déjà
   servi, et quand pour la dernière fois.

   Journal réservé à l'administration (`relances_admin_all`, 0130) : ce composant ne s'affiche
   donc que dans l'espace admin. */

const LIBELLE_MOTIF: Record<MotifRelance, string> = {
  forfait_a_choisir: 'Choix du forfait',
  absence_diagnostic: 'Absence au diagnostic',
  reprise_apres_pause: 'Reprise après pause',
}

type Cible = { prospectId: string; motif: Exclude<MotifRelance, 'reprise_apres_pause'> } | { studentId: string }

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

/* Les deux routes attendent un corps différent ; l'appelant n'a pas à le savoir. */
async function envoyerRelance(cible: Cible, jeton: string): Promise<{ ok: boolean; erreur?: string }> {
  const [url, corps] =
    'prospectId' in cible
      ? ['/api/admin/relancer-prospect', { prospectId: cible.prospectId, motif: cible.motif }]
      : ['/api/admin/relancer-etudiant', { studentId: cible.studentId }]

  const reponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
    body: JSON.stringify(corps),
  }).catch(() => null)

  if (!reponse) return { ok: false, erreur: 'Envoi impossible. Vérifiez votre connexion.' }
  const detail = await reponse.json().catch(() => null)
  if (!reponse.ok) return { ok: false, erreur: detail?.error ?? "La relance n'a pas pu être envoyée." }
  return { ok: true }
}

export function BoutonRelance({
  cible,
  libelle,
  style,
  onEnvoyee,
}: {
  cible: Cible
  libelle: string
  style?: React.CSSProperties
  onEnvoyee?: () => void
}) {
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState(false)

  async function cliquer() {
    setEnCours(true)
    setErreur(null)
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      setEnCours(false)
      setErreur('Session expirée. Reconnectez-vous.')
      return
    }
    const resultat = await envoyerRelance(cible, data.session.access_token)
    setEnCours(false)
    if (!resultat.ok) {
      setErreur(resultat.erreur ?? null)
      return
    }
    /* Confirmation passagère, et non un état « déjà relancé » définitif : relancer une seconde
       fois est précisément ce que la demande rend possible. Le compte réel vit dans
       l'historique juste en dessous, qui se recharge via `onEnvoyee`. */
    setSucces(true)
    window.setTimeout(() => setSucces(false), 2500)
    onEnvoyee?.()
  }

  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          void cliquer()
        }}
        disabled={enCours}
        className="btn-shine btn-secondary"
        style={{ opacity: enCours ? 0.65 : 1, ...style }}
      >
        {enCours ? 'Envoi…' : succes ? 'Relance envoyée ✓' : libelle}
      </button>
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
    </span>
  )
}

/* Historique en lecture. Compact par défaut : il vit dans une carte de pipeline ou un panneau de
   dossier, pas sur une page à lui. Les envois en échec y figurent avec leur motif d'échec — sans
   eux, l'admin lirait « aucune relance » alors que l'envoi a bien été tenté. */
export function HistoriqueRelances({ relances, loading }: { relances: Relance[]; loading?: boolean }) {
  if (loading) return <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Chargement de l’historique…</span>
  if (relances.length === 0) {
    return <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Aucune relance envoyée pour l’instant.</span>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
        {relances.length} relance{relances.length > 1 ? 's' : ''} · dernière le {dateCourte(relances[0].envoyee_le)}
      </span>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {relances.map((relance) => (
          <li
            key={relance.id}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 7,
              flexWrap: 'wrap',
              fontSize: 11,
              color: relance.succes ? 'var(--muted)' : 'var(--danger)',
            }}
          >
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{dateCourte(relance.envoyee_le)}</span>
            <span style={{ color: 'var(--muted-2)' }}>·</span>
            <span>{LIBELLE_MOTIF[relance.motif]}</span>
            {!relance.succes && <span style={{ fontWeight: 700 }}>— échec : {relance.erreur ?? 'inconnu'}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* Bouton + historique d'un seul tenant, pour les appelants qui n'ont pas besoin de les séparer
   (dossier étudiant, fiche de prospect). Le `recharger` du hook est branché sur l'envoi : le
   nouvel envoi apparaît dans la liste sans rien faire de plus. */
export function PanneauRelances({ cible, libelle }: { cible: Cible; libelle: string }) {
  const { relances, loading, recharger } = useRelances(
    'prospectId' in cible ? { prospectId: cible.prospectId } : { studentId: cible.studentId },
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <BoutonRelance cible={cible} libelle={libelle} onEnvoyee={recharger} />
      <HistoriqueRelances relances={relances} loading={loading} />
    </div>
  )
}
