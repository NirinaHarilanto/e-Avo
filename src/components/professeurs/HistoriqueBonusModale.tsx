import { estPaye, totalBonus } from '../../lib/bonusProfesseur'
import { formaterMontant } from '../../lib/paiements'
import type { Database } from '../../types/database.types'
import { Modale } from '../ui/Modale'
import { MessageInfo } from '../ui/Etats'
import { EtatVide } from '../ui/EtatVide'

type BonusProfesseur = Database['public']['Tables']['bonus_professeur']['Row']

/* Historique des bonus, vu par le PROFESSEUR lui-même — demande client du 2026-11-18 : « est-ce
   que tu as rajouté le bloc Bonus du côté espace professeurs, en mode lecture uniquement ? Au
   lieu de modifier comme bouton, le professeur aurait le bouton "Voir" pour voir l'historique. »
 *
 * Strictement en LECTURE : ni les renouvellements repérés, ni la saisie libre, ni les boutons
 * de correction/suppression de BonusProfesseurModale.tsx (celui de l'admin) n'apparaissent ici —
 * accorder un bonus reste une décision de l'administration, jamais du professeur concerné. La
 * RLS (`bonus_professeur_professeur_select`, 0162) refuserait de toute façon toute écriture
 * depuis ce rôle ; ce composant ne lui montre même pas de bouton qui échouerait. */
export function HistoriqueBonusModale({
  nomProfesseur,
  bonus,
  onFermer,
}: {
  nomProfesseur: string
  bonus: BonusProfesseur[]
  onFermer: () => void
}) {
  const totaux = totalBonus(bonus)

  return (
    <Modale titre={`Bonus · ${nomProfesseur}`} onFermer={onFermer} largeurMax={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <TotalBonus libelle="En attente de paiement" montant={totaux.enAttente} ton="var(--accent-gold, #e9cf94)" />
          <TotalBonus libelle="Déjà payés" montant={totaux.paye} ton="var(--accent-teal)" />
        </div>

        {bonus.length === 0 ? (
          <EtatVide
            icone="heures"
            titre="Aucun bonus pour le moment"
            description="Un bonus vous est accordé par l'établissement, typiquement au renouvellement ou au prolongement du forfait d'un de vos élèves. Il apparaîtra ici dès qu'un premier vous aura été attribué."
          />
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
                </div>
              )
            })}
          </div>
        )}

        <MessageInfo>
          Les bonus en attente sont ajoutés à votre relevé d'heures lorsque l'établissement le valide : ils
          s'ajoutent alors à votre rémunération et à votre facture, et passent à « payé ».
        </MessageInfo>
      </div>
    </Modale>
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
