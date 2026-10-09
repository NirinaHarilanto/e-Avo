import { useMemo } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useProfileContext } from '../../context/ProfileContext'
import { useCacheRequete } from '../../hooks/useCacheRequete'
import { peutEcrireDansAgenda } from '../../hooks/useGoogleCalendarPersonnel'
import type { Database } from '../../types/database.types'
import { Section } from '../ui/Section'
import { EtatChargement, MessageErreur, MessageInfo } from '../ui/Etats'
import { EtatVide } from '../ui/EtatVide'

type LigneAgenda = Database['public']['Views']['google_agendas_professeurs_statut']['Row']

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
      </div>
    </Section>
  )
}
