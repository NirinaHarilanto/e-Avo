import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { MotifRelance } from '../../types/database.types'
import { useRelances, type Relance } from '../../hooks/useRelances'
import { MessageErreur } from '../ui/Etats'
import { Modale } from '../ui/Modale'
import { Champ, champStyle } from '../ui/Champ'
import { boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'

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
  paiement_a_regler: 'Règlement à venir',
}

type Cible = { prospectId: string; motif: Exclude<MotifRelance, 'reprise_apres_pause'> } | { studentId: string }

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

/* Le corps commun aux deux cibles : l'appelant n'a pas à savoir laquelle il manipule. */
function corpsDeLaCible(cible: Cible): Record<string, string> {
  return 'prospectId' in cible ? { prospectId: cible.prospectId, motif: cible.motif } : { studentId: cible.studentId }
}

async function appelAdmin(url: string, corps: Record<string, unknown>): Promise<{ ok: boolean; donnees?: Record<string, unknown>; erreur?: string }> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) return { ok: false, erreur: 'Session expirée. Reconnectez-vous.' }

  const reponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(corps),
  }).catch(() => null)

  if (!reponse) return { ok: false, erreur: 'Envoi impossible. Vérifiez votre connexion.' }
  const detail = (await reponse.json().catch(() => null)) as Record<string, unknown> | null
  if (!reponse.ok) return { ok: false, erreur: (detail?.error as string) ?? "La relance n'a pas pu être envoyée." }
  return { ok: true, donnees: detail ?? {} }
}

interface Apercu {
  destinataire: string
  objet: string
  corps: string
  manquantes: string[]
}

/* Le message tel qu'il partirait, composé par le serveur à partir du modèle enregistré. Rien
   n'est envoyé ni tracé : consulter n'est pas relancer. */
async function chargerApercu(cible: Cible): Promise<{ apercu?: Apercu; erreur?: string }> {
  const r = await appelAdmin('/api/admin/apercu-relance', corpsDeLaCible(cible))
  if (!r.ok) return { erreur: r.erreur }
  const d = r.donnees ?? {}
  return {
    apercu: {
      destinataire: String(d.destinataire ?? ''),
      objet: String(d.objet ?? ''),
      corps: String(d.corps ?? ''),
      manquantes: Array.isArray(d.manquantes) ? (d.manquantes as string[]) : [],
    },
  }
}

async function envoyerRelance(cible: Cible, texte: { objet: string; corps: string }): Promise<{ ok: boolean; erreur?: string }> {
  const url = 'prospectId' in cible ? '/api/admin/relancer-prospect' : '/api/admin/relancer-etudiant'
  /* `corpsEmail` et non `corps` : la route lit déjà `corps` comme le corps de la requête HTTP. */
  return appelAdmin(url, { ...corpsDeLaCible(cible), objet: texte.objet, corpsEmail: texte.corps })
}

/* Relire avant d'envoyer — demande client du 2026-11-21 : « est-ce que l'on peut un deuxième
   pop-up sur lequel se trouve le mail à envoyer au prospect et éventuellement possibilité de
   modifier le contenu du mail avant de valider et envoyer ».

   Le texte est modifiable, mais en TEXTE BRUT, pas en HTML : c'est sous cette forme que les
   modèles sont écrits (0091), et la mise en page est posée à l'envoi. Un éditeur riche
   demanderait à l'administration de manipuler des balises pour ne rien gagner, et laisserait
   partir des messages mal formés.

   Les retouches ne valent que pour CET envoi : corriger le modèle lui-même se fait dans l'écran
   Template e-mails, et doit rester un geste délibéré — sans quoi une correction de circonstance
   s'appliquerait à tous les envois suivants sans que personne ne l'ait voulu. */
function FenetreRelance({
  cible,
  libelle,
  onFermer,
  onEnvoyee,
}: {
  cible: Cible
  libelle: string
  onFermer: () => void
  onEnvoyee?: () => void
}) {
  const [apercu, setApercu] = useState<Apercu | null>(null)
  const [objet, setObjet] = useState('')
  const [corps, setCorps] = useState('')
  const [chargement, setChargement] = useState(true)
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let annule = false
    async function charger() {
      const { apercu: recu, erreur: souci } = await chargerApercu(cible)
      if (annule) return
      setChargement(false)
      if (!recu) {
        setErreur(souci ?? "Le message n'a pas pu être préparé.")
        return
      }
      setApercu(recu)
      setObjet(recu.objet)
      setCorps(recu.corps)
    }
    charger()
    return () => {
      annule = true
    }
    // La cible ne change pas tant que la fenêtre est ouverte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const modifie = !!apercu && (objet !== apercu.objet || corps !== apercu.corps)
  const pretAEnvoyer = !!apercu && objet.trim().length > 0 && corps.trim().length > 0

  async function envoyer() {
    setEnvoiEnCours(true)
    setErreur(null)
    const resultat = await envoyerRelance(cible, { objet, corps })
    setEnvoiEnCours(false)
    if (!resultat.ok) {
      setErreur(resultat.erreur ?? null)
      return
    }
    onEnvoyee?.()
    onFermer()
  }

  return (
    <Modale titre={libelle} onFermer={onFermer} largeurMax={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {chargement ? (
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Préparation du message…</span>
        ) : !apercu ? (
          <MessageErreur>{erreur ?? "Le message n'a pas pu être préparé."}</MessageErreur>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
              Destinataire : <strong style={{ color: 'var(--ink-2)' }}>{apercu.destinataire}</strong>
            </p>

            {apercu.manquantes.length > 0 && (
              /* Dit AVANT l'envoi, pas après : sans valeur, ces informations laissent un blanc
                 au milieu d'une phrase — « le test oral l'un de ces samedis : , , , . » — et
                 c'est ici, et seulement ici, qu'on peut encore le combler.

                 Le message nomme la conséquence (un blanc dans le texte) plutôt que la cause
                 technique, et dit où la régler une bonne fois : laisser l'administration
                 corriger à la main à chaque envoi reviendrait à lui faire refaire indéfiniment
                 le même geste. */
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--warning, #8a5e12)', lineHeight: 1.55 }}>
                Ces informations manquent et laisseront un blanc dans le message :{' '}
                <strong>{apercu.manquantes.join(', ')}</strong>. Complétez le texte ci-dessous, ou renseignez-les une
                fois pour toutes dans Messages → Template e-mails → « Liens et numéros réutilisés ».
              </p>
            )}

            <Champ label="Objet">
              <input value={objet} onChange={(e) => setObjet(e.target.value)} style={{ ...champStyle, width: '100%' }} />
            </Champ>

            <Champ label="Message">
              <textarea
                value={corps}
                onChange={(e) => setCorps(e.target.value)}
                rows={14}
                style={{ ...champStyle, width: '100%', resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
              />
            </Champ>

            <span style={{ fontSize: 11, color: 'var(--muted-2)', lineHeight: 1.55 }}>
              {modifie
                ? 'Texte modifié : il partira tel quel, sans changer le modèle enregistré.'
                : 'Texte du modèle enregistré. Vos retouches ne vaudront que pour cet envoi.'}
            </span>

            {erreur && <MessageErreur>{erreur}</MessageErreur>}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void envoyer()}
                disabled={envoiEnCours || !pretAEnvoyer}
                className="btn-shine"
                style={{ ...boutonPrimaireStyle, opacity: envoiEnCours || !pretAEnvoyer ? 0.6 : 1 }}
              >
                {envoiEnCours ? 'Envoi…' : 'Envoyer la relance'}
              </button>
              <button type="button" onClick={onFermer} disabled={envoiEnCours} style={boutonSecondaireStyle}>
                Annuler
              </button>
            </div>
          </>
        )}
      </div>
    </Modale>
  )
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
  /* Le clic OUVRE le message au lieu de l'envoyer (2026-11-21). L'envoi part de la fenêtre, une
     fois le texte relu — un e-mail à un prospect mérite un coup d'œil, et c'était jusqu'ici un
     envoi irréversible au premier clic. */
  const [fenetreOuverte, setFenetreOuverte] = useState(false)
  const [succes, setSucces] = useState(false)

  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setFenetreOuverte(true)
        }}
        className="btn-shine btn-secondary"
        style={style}
      >
        {/* Confirmation passagère, et non un état « déjà relancé » définitif : relancer une
            seconde fois est précisément ce que la demande du 2026-10-19 rend possible. Le compte
            réel vit dans l'historique juste en dessous. */}
        {succes ? 'Relance envoyée ✓' : libelle}
      </button>
      {fenetreOuverte && (
        <FenetreRelance
          cible={cible}
          libelle={libelle}
          onFermer={() => setFenetreOuverte(false)}
          onEnvoyee={() => {
            setSucces(true)
            window.setTimeout(() => setSucces(false), 2500)
            onEnvoyee?.()
          }}
        />
      )}
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
