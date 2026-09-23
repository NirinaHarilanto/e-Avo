import type { Database } from '../../types/database.types'
import type { ProgrammeEtudiant } from '../../hooks/useTypesProgrammeEtudiants'
import type { StatutSignatureContrat } from '../shared/BadgeStatutContrat'
import { BadgeStatutContrat } from '../shared/BadgeStatutContrat'
import { libelleStatutProfil } from '../../lib/statutProfil'
import { initiales } from './DossierEtudiantVue'

type Profile = Database['public']['Tables']['profiles']['Row']

const FOND_TON: Record<'teal' | 'bleu' | 'or', { color: string; bg: string; border: string }> = {
  teal: { color: 'var(--accent-teal)', bg: 'rgba(111,227,192,.14)', border: 'rgba(111,227,192,.3)' },
  bleu: { color: 'var(--accent-blue)', bg: 'rgba(94,179,255,.14)', border: 'rgba(94,179,255,.3)' },
  or: { color: 'var(--accent-gold, #e9cf94)', bg: 'rgba(233,207,148,.14)', border: 'rgba(233,207,148,.32)' },
}

/* Petit tag discret indiquant si l'étudiant suit des cours particuliers (individuel/duo) ou un
   cours collectif, et dans ce cas laquelle vague — demande client du 2026-09-21. */
export function TagProgramme({ programme }: { programme: ProgrammeEtudiant }) {
  const style = FOND_TON[programme.ton]
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: style.color, background: style.bg, border: `1px solid ${style.border}`, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>
      {programme.libelle}
    </span>
  )
}

/* Signale, dans la liste de gauche, un étudiant dont les informations personnelles (téléphone,
   adresse, ville, date et lieu de naissance — voir informationsPersonnellesCompletes) sont
   encore incomplètes. Même vocabulaire de couleur que BadgeStatutContrat côté « en attente » :
   ambre, pas rouge — ce n'est pas bloquant, seulement à surveiller avant de générer un contrat
   ou une facture. */
export function TagDossierIncomplet() {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--warning)',
        background: 'rgba(233,207,148,.12)',
        border: '1px solid rgba(233,207,148,.32)',
        borderRadius: 999,
        padding: '2px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      Dossier à compléter
    </span>
  )
}

interface CarteListeEtudiantProps {
  principal: Profile
  /* Second membre d'un binôme DUO (0054), s'il y en a un — le dossier ouvert au clic reste
     toujours celui du principal, qui porte le forfait/planning/heures partagés. */
  secondaire?: Profile | null
  selectionne: boolean
  onClick: () => void
  programme?: ProgrammeEtudiant | null
  statutContrat?: StatutSignatureContrat
  dossierIncomplet?: boolean
}

/* Bloc d'une ligne de liste étudiant — identité, statut, binôme DUO regroupé et badges du
   dossier. Un seul composant, partagé par l'espace admin (EtudiantsAdmin.tsx) ET l'espace
   professeur (EtudiantsProfesseur.tsx) plutôt que deux rendus qui divergent au fil du temps —
   demande client du 2026-09-23, « il faut que le bloc étudiant dans l'espace admin soit repris
   exactement » côté professeur.
   Nom et prénom TOUJOURS sur une seule ligne (`whiteSpace: nowrap` + `textOverflow: ellipsis`,
   `minWidth: 0` sur toute la chaîne de conteneurs flex parents — sans lui, un item flex refuse
   de rétrécir sous la taille de son contenu et l'ellipsis ne s'applique jamais) : demande client
   du 2026-09-23, un nom long faisait déborder sur deux lignes et percutait les badges. */
export function CarteListeEtudiant({ principal, secondaire, selectionne, onClick, programme, statutContrat, dossierIncomplet }: CarteListeEtudiantProps) {
  const membres = secondaire ? [principal, secondaire] : [principal]
  const nomGroupe = principal.duo_nom_groupe || secondaire?.duo_nom_groupe || (secondaire ? `${principal.prenom} & ${secondaire.prenom}` : null)

  return (
    <button
      onClick={onClick}
      aria-current={selectionne ? 'true' : undefined}
      className="carte-ligne"
      style={{
        textAlign: 'left',
        borderRadius: 12,
        border: selectionne ? '1px solid rgba(94,179,255,.5)' : secondaire ? '1px solid rgba(233,207,148,.32)' : '1px solid var(--border)',
        background: 'var(--surface)',
        padding: '9px 11px',
        display: 'flex',
        alignItems: secondaire ? 'stretch' : 'center',
        flexDirection: secondaire ? 'column' : 'row',
        gap: secondaire ? 6 : 10,
        cursor: 'pointer',
        color: 'inherit',
        width: '100%',
        minWidth: 0,
      }}
    >
      {nomGroupe && (
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--accent-gold, #e9cf94)' }}>
          Duo · {nomGroupe}
        </span>
      )}

      {membres.map((membre) => (
        <div key={membre.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ width: secondaire ? 26 : 30, height: secondaire ? 26 : 30, borderRadius: 999, background: 'rgba(255,255,255,.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: secondaire ? 10.5 : 11.5, fontWeight: 800, flexShrink: 0 }}>
            {initiales(membre)}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {membre.prenom} {membre.nom}
            </span>
            <span style={{ fontSize: 10.5, color: membre.status === 'en_pause' ? 'var(--warning)' : 'var(--muted)' }}>{libelleStatutProfil(membre.status)}</span>
          </div>
        </div>
      ))}

      {/* Badges du dossier — un seul jeu par bloc : forfait, contrat et heures sont communs au
          binôme, seules les informations personnelles restent propres à chacun (signalées
          ci-dessous pour l'un comme pour l'autre). */}
      {(programme || statutContrat || dossierIncomplet) && (
        <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {!secondaire && programme && <TagProgramme programme={programme} />}
          {statutContrat && <BadgeStatutContrat statut={statutContrat} compact />}
          {dossierIncomplet && <TagDossierIncomplet />}
        </span>
      )}
    </button>
  )
}
