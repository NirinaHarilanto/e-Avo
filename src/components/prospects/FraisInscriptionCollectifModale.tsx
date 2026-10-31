import { useState } from 'react'
import { fraisInscriptionCollectif, LABEL_NIVEAU_CLASSE, categorieDepuisNiveauEstime } from '../../lib/classesCollectif'
import {
  MOIS_CYCLE_COLLECTIF,
  echeancierCollectif,
  montantEncaisseALInscription,
  premiereMensualite,
  totalCycleCollectif,
  type FraisInscription,
  type ModalitePaiementCollectif,
} from '../../lib/paiementCollectif'

/* `FraisInscription` vit dans lib/paiementCollectif.ts et non ici : trois écrans et une route
   serveur le manipulent, et `lib/enregistrerFraisCollectif.ts` en dépendait — une bibliothèque
   qui importe un type depuis un composant inverse la dépendance. Réexporté pour ne pas toucher
   aux imports existants. */
export type { FraisInscription }
import { useTarifs } from '../../hooks/useTarifs'
import { Modale } from '../ui/Modale'
import { Champ, champStyle } from '../ui/Champ'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { MessageErreur, MessageInfo } from '../ui/Etats'
import { SelectMoyenPaiement } from '../paiements/SelectMoyenPaiement'

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
  /* La grille donne un prix MENSUEL (« 150 000 Ar/mois · 2 mois ») : le montant à réclamer est
     celui du cycle entier — demande client du 2026-10-31. La fenêtre proposait jusqu'ici le prix
     mensuel tel quel, donc la moitié de ce qui est dû. */
  const prixMensuel = fraisInscriptionCollectif(tarifs, niveau)
  const montantSuggere = prixMensuel != null ? totalCycleCollectif(prixMensuel) : null
  /* `montantSuggere` arrive après le chargement de la grille : le champ se laisse initialiser
     une fois celle-ci connue, sans écraser une saisie déjà faite par l'admin. */
  const [montantSaisi, setMontantSaisi] = useState<string | null>(null)
  const montant = montantSaisi ?? (montantSuggere != null ? String(montantSuggere) : '')
  const [modalite, setModalite] = useState<ModalitePaiementCollectif>('integral')
  const [regle, setRegle] = useState(true)
  const [moyenPaiement, setMoyenPaiement] = useState('')
  const [moyenValide, setMoyenValide] = useState(true)
  const [reference, setReference] = useState('')
  const total = Number(montant) || 0
  const echeances = echeancierCollectif(total, new Date())
  const pret = !!montant && total > 0 && (!regle || moyenValide)

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
          label={`Montant total du cycle (${MOIS_CYCLE_COLLECTIF} mois, en Ar)`}
          obligatoire
          aide={
            categorie
              ? `Niveau ${LABEL_NIVEAU_CLASSE[categorie]}${
                  prixMensuel != null
                    ? ` — ${prixMensuel.toLocaleString('fr-FR')} Ar par mois × ${MOIS_CYCLE_COLLECTIF} mois, d'après la grille`
                    : ''
                }`
              : undefined
          }
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

        {/* Deux manières de régler le cycle, et deux seulement (demande client du 2026-10-31) :
            tout d'un coup, ou mois par mois. La mensualisation ne change pas le montant dû —
            elle crée un échéancier, que les relances automatiques suivent déjà (0070). */}
        <Champ label="Modalité de paiement">
          <select
            value={modalite}
            onChange={(e) => setModalite(e.target.value as ModalitePaiementCollectif)}
            style={champStyle}
          >
            <option value="integral">En une fois — {total > 0 ? `${total.toLocaleString('fr-FR')} Ar` : 'montant total'}</option>
            <option value="mensuel">
              Par mois — {MOIS_CYCLE_COLLECTIF} × {total > 0 ? `${premiereMensualite(total).toLocaleString('fr-FR')} Ar` : 'mensualité'}
            </option>
          </select>
        </Champ>

        {modalite === 'mensuel' && total > 0 && (
          <MessageInfo>
            Échéancier créé automatiquement :{' '}
            {echeances
              .map((e) => `${e.montant.toLocaleString('fr-FR')} Ar le ${new Date(`${e.date_echeance}T12:00:00`).toLocaleDateString('fr-FR')}`)
              .join(', puis ')}
            . L’élève est relancé avant chaque échéance.
          </MessageInfo>
        )}

        {/* Un candidat peut rejoindre la vague sans avoir encore payé : la ligne existe alors
            comme montant à encaisser, au lieu de ne pas exister du tout. */}
        <Champ label="État du paiement">
          <select value={regle ? 'paye' : 'attendu'} onChange={(e) => setRegle(e.target.value === 'paye')} style={champStyle}>
            <option value="paye">
              {modalite === 'mensuel' ? '1re mensualité réglée — encaissée aujourd’hui' : 'Réglé — encaissé aujourd’hui'}
            </option>
            <option value="attendu">Attendu — pas encore payé</option>
          </select>
        </Champ>

        {regle && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Champ label="Moyen (facultatif)">
              <SelectMoyenPaiement valeur={moyenPaiement} onChange={(v, valide) => { setMoyenPaiement(v); setMoyenValide(valide) }} />
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
                montant: total,
                montantRegle: montantEncaisseALInscription(total, modalite, regle),
                modalite,
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
