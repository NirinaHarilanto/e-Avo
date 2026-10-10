import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useProfileContext } from '../../context/ProfileContext'
import { useCacheRequete } from '../../hooks/useCacheRequete'
import { peutEcrireDansAgenda } from '../../hooks/useGoogleCalendarPersonnel'
import { useDemandesAgendaGoogleAdmin } from '../../hooks/useDemandeAgendaGoogle'
import type { Database } from '../../types/database.types'
import { Section } from '../ui/Section'
import { champStyle } from '../ui/Champ'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { EtatChargement, MessageAvertissement, MessageErreur, MessageInfo } from '../ui/Etats'
import { EtatVide } from '../ui/EtatVide'

type LigneAgenda = Database['public']['Views']['google_agendas_professeurs_statut']['Row']
type DemandeAdmin = Database['public']['Views']['demandes_agenda_google_admin']['Row']

/* Suivi, pour l'administration, des agendas Google des professeurs (0107).

   Demande client du 2026-10-09 : « chaque professeur doit avoir son propre compte google gmail »,
   et « chaque professeur doit synchroniser son agenda gmail avec son agenda de l'application
   HOC ». C'est l'admin qui doit relancer ceux qui manquent à l'appel, or l'écart est invisible à
   l'usage : un professeur sans compte connecté voit ses cours créés par le compte de
   l'établissement, exactement comme avant, sans que rien ne le signale.

   La vue lue ici n'expose que l'ÉTAT de la connexion — quelle adresse, quel jour, quelles
   permissions — jamais le contenu de l'agenda ni le jeton. Elle est restreinte aux admins et aux
   professeurs de leur établissement par sa propre clause WHERE (migration 0107). */

type Etat = 'ecriture' | 'lecture' | 'absent'

/* Mêmes teintes et mêmes opacités que BadgeStatutSeance — fond à 14 %, bordure à 30 % — pour que
   ces pastilles se lisent comme les autres badges de l'application : teal quand c'est en ordre, or
   quand il manque quelque chose, corail quand rien n'est fait. */
const PRESENTATION: Record<Etat, { libelle: string; couleur: string; fond: string; bordure: string }> = {
  ecriture: { libelle: 'Synchronisé', couleur: 'var(--accent-teal)', fond: 'rgba(111,227,192,.14)', bordure: 'rgba(111,227,192,.3)' },
  lecture: { libelle: 'Lecture seule', couleur: 'var(--warning)', fond: 'rgba(233,207,148,.14)', bordure: 'rgba(233,207,148,.32)' },
  absent: { libelle: 'Non connecté', couleur: 'var(--danger)', fond: 'rgba(255,138,112,.12)', bordure: 'rgba(255,138,112,.3)' },
}

function etatDe(ligne: LigneAgenda): Etat {
  if (!ligne.google_email) return 'absent'
  return peutEcrireDansAgenda(ligne.scope) ? 'ecriture' : 'lecture'
}

function nomComplet(ligne: LigneAgenda): string {
  return `${ligne.prenom ?? ''} ${ligne.nom ?? ''}`.trim() || (ligne.email ?? 'Professeur')
}

export function AgendasProfesseursAdmin() {
  const { profile } = useProfileContext()
  const { valeur, loading } = useCacheRequete(profile ? 'agendas-professeurs' : null, async () => {
    const { data } = await supabase.from('google_agendas_professeurs_statut').select('*')
    return (data ?? []) as LigneAgenda[]
  })
  /* Demandes de changement d'adresse à trancher (0112) : « la validation sera faite uniquement par
     l'admin ». Elles vivent dans cet écran et pas ailleurs — c'est déjà celui qui dit quel
     professeur a connecté quel compte, donc le seul endroit où l'admin a sous les yeux le contexte
     nécessaire pour décider. */
  const { enAttente: demandesEnAttente, recharger: rechargerDemandes } = useDemandesAgendaGoogleAdmin()

  const lignes = useMemo(() => {
    /* Les comptes à régler d'abord : non connectés, puis lecture seule, puis le reste, et par nom
       à l'intérieur de chaque groupe. L'admin ouvre cet écran pour savoir QUI relancer. */
    const rang: Record<Etat, number> = { absent: 0, lecture: 1, ecriture: 2 }
    return [...(valeur ?? [])].sort(
      (a, b) => rang[etatDe(a)] - rang[etatDe(b)] || nomComplet(a).localeCompare(nomComplet(b), 'fr'),
    )
  }, [valeur])

  const aRegler = lignes.filter((l) => etatDe(l) !== 'ecriture').length

  if (loading) return <EtatChargement lignes={1} hauteur={180} />

  return (
    <Section
      titre="Agendas Google des professeurs"
      description="Chaque professeur connecte son propre compte Gmail depuis « Mon profil ». C'est depuis ce compte que partent les réunions de ses cours et les invitations à ses élèves."
      compteur={lignes.length}
      style={{ maxWidth: 680 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {demandesEnAttente.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MessageAvertissement>
              {demandesEnAttente.length === 1
                ? 'Un professeur demande à changer le compte Google relié à son agenda. Vous seul pouvez l’autoriser.'
                : `${demandesEnAttente.length} professeurs demandent à changer le compte Google relié à leur agenda. Vous seul pouvez les autoriser.`}
            </MessageAvertissement>
            {demandesEnAttente.map((demande) => (
              <CarteDemande key={demande.id} demande={demande} onDecide={rechargerDemandes} />
            ))}
          </div>
        )}

        {lignes.length === 0 ? (
          <EtatVide
            compact
            icone="professeurs"
            titre="Aucun professeur"
            description="La liste se remplira dès qu’un professeur rejoindra l’établissement."
          />
        ) : (
          <>
            {aRegler > 0 && (
              <MessageErreur>
                {aRegler === 1
                  ? 'Un professeur n’a pas encore d’agenda Google pleinement synchronisé : ses cours sont créés par le compte de l’établissement, et ses élèves reçoivent donc leurs invitations de sa part et non de celle du professeur.'
                  : `${aRegler} professeurs n’ont pas encore d’agenda Google pleinement synchronisé : leurs cours sont créés par le compte de l’établissement, et leurs élèves reçoivent donc leurs invitations de sa part et non de celle du professeur.`}
              </MessageErreur>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lignes.map((ligne) => {
                const etat = etatDe(ligne)
                const presentation = PRESENTATION[etat]
                return (
                  <div
                    key={ligne.profile_id}
                    style={{
                      display: 'flex',
                      /* En haut, pas centré : dès qu'un incident Google s'affiche, la ligne fait
                         trois hauteurs de texte et une pastille centrée verticalement flotterait
                         au milieu de nulle part. */
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                      border: '1px solid var(--border-soft)',
                      borderRadius: 12,
                      padding: '11px 13px',
                    }}
                  >
                    {/* `flex: 1` avec une base de 220 px : le texte occupe la place disponible et
                        la pastille reste à droite, au lieu de passer à la ligne dès que le message
                        d'incident s'allonge. En dessous de cette largeur — mobile — le passage à
                        la ligne redevient le bon comportement. */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: '1 1 220px' }}>
                      <span style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600 }}>{nomComplet(ligne)}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>
                        {ligne.google_email ?? 'Aucun compte Google connecté'}
                        {ligne.connecte_le
                          ? ` · depuis le ${new Date(ligne.connecte_le).toLocaleDateString('fr-FR', { dateStyle: 'long' })}`
                          : ''}
                      </span>
                      {ligne.derniere_erreur && (
                        <span style={{ fontSize: 11.5, color: 'var(--danger)', lineHeight: 1.5 }}>
                          Dernier incident Google : {ligne.derniere_erreur}
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: 999,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        color: presentation.couleur,
                        background: presentation.fond,
                        border: `1px solid ${presentation.bordure}`,
                      }}
                    >
                      {presentation.libelle}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <MessageInfo>
          Vous ne pouvez pas connecter un agenda à la place d’un professeur : Google exige que chacun autorise son
          propre compte. Demandez-lui d’ouvrir « Mon profil », de cliquer « Connecter mon agenda Google » et de
          cocher la permission de modification des agendas sur l’écran Google. Un compte en « lecture seule » a été
          branché avant cette permission : il doit être reconnecté.
        </MessageInfo>

        {/* Même instruction que dans « Mon agenda Google » des deux espaces (demande client du
            2026-10-10) : elle a une conséquence pratique pour l'admin aussi — autoriser un
            changement d'adresse consomme une place, et refuser un essai « pour voir » en préserve
            une. */}
        <MessageAvertissement>
          <strong>Un professeur est libre de sa première connexion, pas du changement.</strong> Tant que l’application
          n’a pas reçu la validation officielle de Google, chaque compte Google <em>différent</em> connecté à Hari
          Online Club occupe une place définitive dans son autorisation Google — place qui n’est pas rendue si le
          compte est ensuite déconnecté ou si le professeur est supprimé. Les changements d’adresse passent donc par
          votre validation, et reconnecter la <em>même</em> adresse reste libre et sans coût.
        </MessageAvertissement>
      </div>
    </Section>
  )
}

/* Une demande de changement d'adresse à trancher. Approuver n'écrit rien dans l'intégration : cela
   ouvre, pour CETTE adresse et une seule fois, le droit pour le professeur de relancer la connexion
   Google — personne ne peut autoriser un agenda à la place de son titulaire. */
function CarteDemande({ demande, onDecide }: { demande: DemandeAdmin; onDecide: () => void }) {
  const { session } = useProfileContext()
  const [refusOuvert, setRefusOuvert] = useState(false)
  const [motifRefus, setMotifRefus] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function decider(decision: 'approuver' | 'refuser') {
    if (!session) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/decider-demande-agenda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ demandeId: demande.id, decision, motifRefus: motifRefus.trim() || undefined }),
    })
    setEnCours(false)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'La décision n’a pas pu être enregistrée.')
      return
    }
    onDecide()
  }

  const nom = `${demande.prenom ?? ''} ${demande.nom ?? ''}`.trim() || demande.email || 'Professeur'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        border: '1px solid rgba(233,207,148,.32)',
        background: 'rgba(233,207,148,.06)',
        borderRadius: 12,
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600 }}>{nom}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>
          {demande.google_email_actuel ? `${demande.google_email_actuel} → ` : 'Nouvelle liaison → '}
          <strong style={{ color: 'var(--ink-2)' }}>{demande.google_email_souhaite}</strong>
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>
          Demandé le {new Date(demande.created_at).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
        </span>
        {demande.motif && (
          <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', margin: '3px 0 0', lineHeight: 1.5 }}>
            « {demande.motif} »
          </p>
        )}
      </div>

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {refusOuvert ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            autoFocus
            value={motifRefus}
            onChange={(e) => setMotifRefus(e.target.value)}
            rows={2}
            placeholder="Motif du refus (facultatif, transmis au professeur)"
            style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setRefusOuvert(false)} disabled={enCours} style={boutonNeutreStyle}>
              Annuler
            </button>
            <button
              type="button"
              onClick={() => decider('refuser')}
              disabled={enCours}
              style={{ ...boutonNeutreStyle, color: 'var(--danger)' }}
            >
              {enCours ? 'Enregistrement…' : 'Confirmer le refus'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => decider('approuver')}
            disabled={enCours}
            className="btn-shine"
            style={boutonPrimaireStyle}
          >
            {enCours ? 'Enregistrement…' : 'Autoriser ce changement'}
          </button>
          <button
            type="button"
            onClick={() => setRefusOuvert(true)}
            disabled={enCours}
            style={{ ...boutonNeutreStyle, color: 'var(--danger)' }}
          >
            Refuser
          </button>
        </div>
      )}
    </div>
  )
}
