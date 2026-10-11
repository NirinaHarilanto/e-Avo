import { useState } from 'react'
import { fraisInscriptionCollectif, LABEL_NIVEAU_CLASSE, categorieDepuisNiveauEstime } from '../../lib/classesCollectif'
import { useTarifs } from '../../hooks/useTarifs'
import { Modale } from '../ui/Modale'
import { Champ, champStyle } from '../ui/Champ'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { MessageErreur, MessageInfo } from '../ui/Etats'

export interface FraisInscription {
  montant: number
  regle: boolean
  moyenPaiement: string
  reference: string
  notes: string
}

/* Trois situations réutilisent cette même fenêtre, chacune avec un sens différent pour « valider »
   — repéré en vérifiant à l'écran le 2026-10-11 : le texte « avant que [...] ne devienne
   étudiant·e » et le bouton « Enregistrer et convertir » n'avaient aucun sens pour un étudiant déjà
   converti (frais manquants à compléter, ou réévaluation de fin de parcours). */
export type ContexteFraisInscription = 'conversion' | 'reevaluation' | 'complement'

const TEXTES_CONTEXTE: Record<ContexteFraisInscription, { intro: (nom: string) => string; bouton: string }> = {
  conversion: {
    intro: (nom) => `Les frais d'inscription sont enregistrés avant que ${nom} ne devienne étudiant·e. Le montant proposé est celui de son niveau dans la grille des tarifs.`,
    bouton: 'Enregistrer et convertir',
  },
  reevaluation: {
    intro: (nom) => `Les frais d'inscription du nouveau niveau sont enregistrés avant que le nouveau placement de ${nom} ne soit validé. Le montant proposé est celui de son niveau dans la grille des tarifs.`,
    bouton: 'Enregistrer et valider le placement',
  },
  complement: {
    intro: (nom) => `Enregistrez les frais d'inscription de ${nom}. Le montant proposé est celui de son niveau dans la grille des tarifs.`,
    bouton: 'Enregistrer',
  },
}

/* Frais d'inscription au collectif, à enregistrer AVANT la conversion en étudiant — demande
   client du 2026-10-11. Partagée par les deux chemins de conversion (Cours collectifs › Session
   orale, et le glisser-déposer du pipeline) pour que la règle et le montant proposé soient les
   mêmes partout ; le serveur la fait respecter de son côté (api/admin/convert-prospect.ts).

   Même principe que la fenêtre de paiement d'une décision d'essai (DecisionHeureEssai.tsx) : le
   paiement part dans le MÊME appel que la conversion, jamais en deux temps — l'admin valide une
   fois, et il n'existe pas d'état intermédiaire où l'étudiant serait créé sans ses frais. */
export function FraisInscriptionCollectifModale({
  nomCandidat,
  niveau,
  etablissementId,
  contexte = 'conversion',
  enCours,
  erreur,
  onFermer,
  onValider,
}: {
  nomCandidat: string
  /* Niveau retenu pour ce candidat : celui du test oral s'il a été arrêté, sinon celui du quiz.
     C'est lui qui désigne le tarif de la grille, donc le montant proposé. */
  niveau: string | null
  etablissementId: string | undefined
  contexte?: ContexteFraisInscription
  enCours: boolean
  erreur: string | null
  onFermer: () => void
  onValider: (frais: FraisInscription) => void
}) {
  const { tarifs, loading } = useTarifs(etablissementId)
  const categorie = categorieDepuisNiveauEstime(niveau)
  const montantSuggere = fraisInscriptionCollectif(tarifs, niveau)
  /* `montantSuggere` arrive après le chargement de la grille : le champ se laisse initialiser
     une fois celle-ci connue, sans écraser une saisie déjà faite par l'admin. */
  const [montantSaisi, setMontantSaisi] = useState<string | null>(null)
  const montant = montantSaisi ?? (montantSuggere != null ? String(montantSuggere) : '')
  const [regle, setRegle] = useState(true)
  const [moyenPaiement, setMoyenPaiement] = useState('')
  const [reference, setReference] = useState('')
  const pret = !!montant && Number(montant) > 0

  return (
    <Modale titre={`Frais d'inscription · ${nomCandidat}`} onFermer={onFermer} largeurMax={450}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--muted)', margin: 0 }}>{TEXTES_CONTEXTE[contexte].intro(nomCandidat)}</p>

        {!loading && montantSuggere == null && (
          <MessageInfo>
            {categorie
              ? `Aucun tarif collectif « ${LABEL_NIVEAU_CLASSE[categorie]} » dans la page Tarifs : saisissez le montant à la main.`
              : 'Niveau d’anglais inconnu : aucun montant ne peut être proposé automatiquement.'}
          </MessageInfo>
        )}

        <Champ
          label="Montant des frais (Ar)"
          obligatoire
          aide={categorie ? `Niveau ${LABEL_NIVEAU_CLASSE[categorie]}${montantSuggere != null ? ' — montant de la grille' : ''}` : undefined}
        >
          <input
            type="number"
            min={0}
            step="0.01"
            value={montant}
            onChange={(e) => setMontantSaisi(e.target.value)}
            style={champStyle}
          />
        </Champ>

        {/* Un candidat peut rejoindre la vague sans avoir encore payé : la ligne existe alors
            comme montant à encaisser, au lieu de ne pas exister du tout. */}
        <Champ label="État du paiement">
          <select value={regle ? 'paye' : 'attendu'} onChange={(e) => setRegle(e.target.value === 'paye')} style={champStyle}>
            <option value="paye">Réglé — encaissé aujourd’hui</option>
            <option value="attendu">Attendu — pas encore payé</option>
          </select>
        </Champ>

        {regle && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Champ label="Moyen (facultatif)">
              <input value={moyenPaiement} onChange={(e) => setMoyenPaiement(e.target.value)} placeholder="Espèces, Mvola…" style={champStyle} />
            </Champ>
            <Champ label="Référence (facultatif)">
              <input value={reference} onChange={(e) => setReference(e.target.value)} style={champStyle} />
            </Champ>
          </div>
        )}

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onFermer} disabled={enCours} style={{ ...boutonNeutreStyle, flexGrow: 1 }}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() =>
              onValider({
                montant: Number(montant),
                regle,
                moyenPaiement: regle ? moyenPaiement : '',
                reference: regle ? reference : '',
                notes: "Frais d'inscription — cours collectifs",
              })
            }
            disabled={enCours || !pret}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, flexGrow: 1.4, opacity: enCours || !pret ? 0.6 : 1 }}
          >
            {enCours ? 'Enregistrement…' : TEXTES_CONTEXTE[contexte].bouton}
          </button>
        </div>
      </div>
    </Modale>
  )
}
