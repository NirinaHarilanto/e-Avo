import type { Database } from '../../types/database.types'
import type { ProgrammeEtudiant } from '../../hooks/useTypesProgrammeEtudiants'
import type { StatutSignatureContrat } from '../shared/BadgeStatutContrat'
import { BadgeStatutContrat } from '../shared/BadgeStatutContrat'
import { libelleStatutProfil } from '../../lib/statutProfil'

type Profile = Database['public']['Tables']['profiles']['Row']

const FOND_TON: Record<'teal' | 'bleu' | 'or', { color: string; bg: string; border: string }> = {
  teal: { color: 'var(--accent-teal)', bg: 'rgba(111,227,192,.14)', border: 'rgba(111,227,192,.3)' },
  bleu: { color: 'var(--accent-blue)', bg: 'rgba(169,140,255,.14)', border: 'rgba(169,140,255,.3)' },
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

/* Signale, dans l'en-tête de la fiche de l'étudiant, des informations personnelles (téléphone,
   adresse, ville — voir informationsPersonnellesCompletes) encore incomplètes. Même vocabulaire
   de couleur que BadgeStatutContrat côté « en attente » : ambre, pas rouge — ce n'est pas
   bloquant, seulement à surveiller avant de générer un contrat ou une facture. Déplacé de la
   carte de la liste vers la fiche le 2026-10-11 (capture client, « le badge incomplet, il faut
   le mettre sur la fiche étudiant ») : là où il y a la place pour l'écrire en toutes lettres,
   même gabarit que les badges « Actif »/« Anglais » voisins (DossierEtudiantVue.tsx). */
export function TagDossierIncomplet() {
  return (
    <span
      style={{
        fontSize: 11.5,
        fontWeight: 700,
        color: 'var(--warning)',
        background: 'rgba(233,207,148,.12)',
        border: '1px solid rgba(233,207,148,.32)',
        borderRadius: 999,
        padding: '4px 11px',
        whiteSpace: 'nowrap',
      }}
    >
      Dossier incomplet
    </span>
  )
}

/* Tag « Ancien élève » — demande client du 2026-09-30 : « quand un étudiant change de professeur,
   l'étudiant aura un tag visible du côté de l'ancien professeur comme "Ancien élève" pour aider le
   professeur à l'identifier rapidement dans son espace personnel ». N'existe QUE côté professeur :
   pour l'admin, un élève transféré reste un élève actif de l'établissement, et son changement de
   professeur se lit déjà dans les périodes de son parcours. Gris neutre plutôt qu'une couleur
   d'alerte : ce n'est ni un problème ni une action à mener, seulement un repère de lecture. */
export function TagAncienEleve({ transfereLe }: { transfereLe?: string | null }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--muted)',
        background: 'rgba(255,255,255,.05)',
        border: '1px solid var(--border)',
        borderRadius: 999,
        padding: '2px 8px',
        whiteSpace: 'nowrap',
      }}
    >
      Ancien élève{transfereLe ? ` · transféré le ${new Date(transfereLe).toLocaleDateString('fr-FR')}` : ''}
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
  /* Élève transféré à un autre professeur, vu depuis l'espace de son ANCIEN professeur (date du
     transfert). La carte est alors estompée et porte le tag « Ancien élève » — même bloc de liste
     que les élèves en cours, plutôt qu'un rendu parallèle qui divergeait au fil des retouches. */
  ancienEleve?: { transfereLe: string } | null
}

/* Bloc d'une ligne de liste étudiant — identité et badges du dossier. Un seul composant, partagé
   par l'espace admin (EtudiantsAdmin.tsx) ET l'espace professeur (EtudiantsProfesseur.tsx)
   plutôt que deux rendus qui divergent au fil du temps — demande client du 2026-09-23, « il faut
   que le bloc étudiant dans l'espace admin soit repris exactement » côté professeur.

   Épuré une seconde fois le 2026-10-11 (capture client) : plus d'avatar à initiales (« pas du
   tout utile »), plus de statut « Actif » affiché (déjà visible dans la fiche — réapparaît
   seulement si l'étudiant N'EST PAS actif, le seul cas où l'information manque ailleurs dans la
   liste), et un binôme DUO ne montre plus le détail des deux membres (noms complets, avatars,
   statuts) : juste « Prénom1/Prénom2 » + le badge DUO + le glyphe de contrat, sur une seule
   ligne — le détail complet reste dans la fiche du binôme. Le dossier incomplet n'apparaît plus
   du tout ici, déplacé dans la fiche (TagDossierIncomplet, utilisé par EtudiantsAdmin.tsx /
   EtudiantsProfesseur.tsx via badgesSupplementaires).

   Le nom se tronque en premier (`whiteSpace: nowrap` + ellipsis, `minWidth: 0` sur toute la
   chaîne de conteneurs flex parents) si la place manque, jamais les badges (`flexShrink: 0`). */
export function CarteListeEtudiant({ principal, secondaire, selectionne, onClick, programme, statutContrat, ancienEleve }: CarteListeEtudiantProps) {
  return (
    <button
      onClick={onClick}
      aria-current={selectionne ? 'true' : undefined}
      className="carte-ligne"
      style={{
        textAlign: 'left',
        borderRadius: 12,
        border: selectionne ? '1px solid rgba(169,140,255,.5)' : secondaire ? '1px solid rgba(233,207,148,.32)' : '1px solid var(--border)',
        background: 'var(--surface)',
        padding: '9px 11px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 4,
        cursor: 'pointer',
        color: 'inherit',
        width: '100%',
        minWidth: 0,
        // Estompé sans être illisible : l'élève reste cliquable (son historique se consulte
        // toujours), il passe simplement au second plan des élèves en cours.
        opacity: ancienEleve ? 0.68 : 1,
      }}
    >
      {secondaire ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, width: '100%' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            {principal.prenom}/{secondaire.prenom}
          </span>
          {programme && <TagProgramme programme={programme} />}
          {statutContrat && <BadgeStatutContrat statut={statutContrat} glyphe />}
        </span>
      ) : (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, width: '100%' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
              {principal.prenom} {principal.nom}
            </span>
            {programme && <TagProgramme programme={programme} />}
            {statutContrat && <BadgeStatutContrat statut={statutContrat} glyphe />}
          </span>
          {principal.status !== 'approved' && (
            <span style={{ fontSize: 10.5, color: principal.status === 'en_pause' ? 'var(--warning)' : 'var(--muted)' }}>
              {libelleStatutProfil(principal.status)}
            </span>
          )}
        </span>
      )}

      {ancienEleve && <TagAncienEleve transfereLe={ancienEleve.transfereLe} />}
    </button>
  )
}
