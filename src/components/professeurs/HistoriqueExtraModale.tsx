import { totauxExtra } from '../../lib/prestationsExtra'
import type { Database } from '../../types/database.types'
import { Modale } from '../ui/Modale'
import { MessageInfo } from '../ui/Etats'
import { EtatVide } from '../ui/EtatVide'
import { LigneExtra, Total } from './PrestationsExtraModale'

type PrestationExtra = Database['public']['Tables']['prestations_extra']['Row']

/* Prestations « Extra », vues par le PROFESSEUR — demande client du 2026-11-17 : « ce bloc sera
   visible du côté professeur en mode LECTURE UNIQUEMENT ».
 *
 * La ligne d'historique est le MÊME composant que côté admin (LigneExtra), appelé sans ses
 * boutons : les deux côtés doivent décrire une prestation de la même façon, et deux rendus
 * jumeaux finiraient par diverger. Aucun formulaire ici — attribuer ou corriger une prestation
 * reste une décision de l'administration, et la RLS (0163) ne donne au professeur qu'un droit
 * de lecture. */
export function HistoriqueExtraModale({
  nomProfesseur,
  extras,
  onFermer,
}: {
  nomProfesseur: string
  extras: PrestationExtra[]
  onFermer: () => void
}) {
  const totaux = totauxExtra(extras)

  return (
    <Modale titre={`Extra · ${nomProfesseur}`} onFermer={onFermer} largeurMax={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Total libelle="Planifié" montant={totaux.planifie} ton="var(--muted)" />
          <Total libelle="Validé, à payer" montant={totaux.aPayer} ton="var(--accent-gold, #e9cf94)" />
          <Total libelle="Déjà payé" montant={totaux.paye} ton="var(--accent-teal)" />
        </div>

        {extras.length === 0 ? (
          <EtatVide
            icone="heures"
            titre="Aucune prestation pour le moment"
            description="L'établissement peut vous attribuer une prestation ponctuelle, hors de vos cours habituels. Elle apparaîtra ici avec son montant et son statut."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {extras.map((extra) => (
              <LigneExtra key={extra.id} extra={extra} />
            ))}
          </div>
        )}

        <MessageInfo>
          Une prestation <strong>validée</strong> est ajoutée à votre relevé d'heures lorsque l'établissement le
          valide : elle s'ajoute alors à votre rémunération et à votre facture, et passe à « payée ».
        </MessageInfo>
      </div>
    </Modale>
  )
}
