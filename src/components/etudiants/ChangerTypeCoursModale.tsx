import { useState } from 'react'
import { jetonAcces } from '../../lib/jetonAcces'
import { formaterHeures } from '../../lib/heures'
import { Modale } from '../ui/Modale'
import { boutonNeutreStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'
import { MessageErreur, MessageInfo, MessageSucces } from '../ui/Etats'

export type TypeCours = 'individuel' | 'collectif'

interface Resultat {
  seancesAnnulees: number
  inscriptionsRetirees: number
  forfaitsSoldes: { heures: number; type: string; reglementATraiter: boolean }[]
  forfaitsSupprimes: number
}

/* Changement de type de cours — demande client du 2026-11-08 : « quand un étudiant a complètement
   fini son forfait de cours ou n'a pas encore commencé une séance de cours, on doit pouvoir
   changer de type de cours. Par exemple, un étudiant en individuel voudrait changer en cours
   collectif, ou un étudiant en cours collectif. Il faut le rendre techniquement possible de faire
   le basculement sans casser la logique et les mécanismes. »

   La fenêtre ANNONCE avant de faire : un basculement touche l'agenda (séances à venir), le
   professeur attribué et le forfait en cours, et aucune de ces trois conséquences ne se devine
   depuis un bouton. Elle ne RATTACHE rien ensuite — c'est volontaire, et dit en toutes lettres à
   l'admin : choisir une vague et une classe, ou un forfait et un professeur, se fait avec les
   boutons déjà présents sur ce même onglet, qui portent leurs propres garde-fous (capacité d'une
   classe, tarifs, triggers 0071/0074). */
export function ChangerTypeCoursModale({
  studentId,
  nomEleve,
  typeActuel,
  heuresConsommees,
  heuresForfait,
  onChange,
}: {
  studentId: string
  nomEleve: string
  typeActuel: TypeCours
  heuresConsommees: number
  /* Total du forfait en cours, `null` quand aucun n'est connu — un élève sans forfait du tout
     n'a évidemment rien commencé. */
  heuresForfait: number | null
  onChange: () => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [resultat, setResultat] = useState<Resultat | null>(null)

  const cible: TypeCours = typeActuel === 'collectif' ? 'individuel' : 'collectif'
  const pasCommence = heuresConsommees === 0
  const termine = heuresForfait != null && heuresForfait > 0 && heuresConsommees >= heuresForfait
  const possible = pasCommence || termine

  async function basculer() {
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/changer-type-cours', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonAcces()}` },
      body: JSON.stringify({ studentId, cible }),
    })
    const corps = await reponse.json().catch(() => null)
    setEnCours(false)
    if (!reponse.ok) {
      setErreur(corps?.error ?? 'Le changement de type de cours a échoué.')
      return
    }
    setResultat(corps as Resultat)
    onChange()
  }

  if (!ouvert) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={() => setOuvert(true)} disabled={!possible} style={{ ...boutonSecondaireStyle, width: '100%', opacity: possible ? 1 : 0.5, cursor: possible ? 'pointer' : 'not-allowed' }}>
          Changer de type de cours
        </button>
        {!possible && (
          /* Le bouton reste visible, désactivé : le masquer laisserait croire que la
             fonctionnalité n'existe pas, alors qu'elle rouvrira d'elle-même à la fin du forfait. */
          <p style={{ fontSize: 11.5, color: 'var(--muted-2)', margin: 0, lineHeight: 1.5 }}>
            Possible uniquement avant la première séance, ou une fois le forfait terminé
            {heuresForfait != null ? ` (${formaterHeures(heuresConsommees)} sur ${formaterHeures(heuresForfait)} suivies)` : ''}.
          </p>
        )}
      </div>
    )
  }

  const titreCible = cible === 'collectif' ? 'cours collectif' : 'cours individuel'

  return (
    <Modale
      titre={`Changer de type de cours · ${nomEleve}`}
      onFermer={() => {
        if (enCours) return
        setOuvert(false)
        setErreur(null)
        setResultat(null)
      }}
      largeurMax={520}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {resultat ? (
          <>
            <MessageSucces>
              {nomEleve} passe en {titreCible}.
            </MessageSucces>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.7 }}>
              {resultat.seancesAnnulees > 0 && (
                <li>
                  {resultat.seancesAnnulees} séance{resultat.seancesAnnulees > 1 ? 's' : ''} à venir annulée
                  {resultat.seancesAnnulees > 1 ? 's' : ''}, retirée{resultat.seancesAnnulees > 1 ? 's' : ''} de l'agenda.
                </li>
              )}
              {resultat.inscriptionsRetirees > 0 && (
                <li>
                  Retiré·e de {resultat.inscriptionsRetirees} séance{resultat.inscriptionsRetirees > 1 ? 's' : ''} à venir, qui
                  restent au programme des autres élèves.
                </li>
              )}
              {resultat.forfaitsSupprimes > 0 && (
                <li>
                  {resultat.forfaitsSupprimes} forfait{resultat.forfaitsSupprimes > 1 ? 's' : ''} jamais entamé
                  {resultat.forfaitsSupprimes > 1 ? 's' : ''} supprimé{resultat.forfaitsSupprimes > 1 ? 's' : ''}.
                </li>
              )}
              {resultat.forfaitsSoldes.map((f, index) => (
                <li key={index}>
                  Forfait {f.type} de {formaterHeures(f.heures)} soldé.
                  {f.reglementATraiter
                    ? ' Son règlement reste à traiter depuis l’onglet Paiements : il n’a pas été touché.'
                    : ''}
                </li>
              ))}
            </ul>
            <MessageInfo>
              {cible === 'collectif'
                ? 'Il reste à lui assigner une vague et une classe, juste en dessous.'
                : 'Il reste à lui créer un forfait et à lui affecter un professeur, juste en dessous.'}
            </MessageInfo>
            <button
              onClick={() => {
                setOuvert(false)
                setResultat(null)
              }}
              style={boutonPrimaireStyle}
            >
              Fermer
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.6 }}>
              {nomEleve} passe de <strong>{typeActuel === 'collectif' ? 'cours collectif' : 'cours individuel'}</strong> à{' '}
              <strong>{titreCible}</strong>.
            </p>
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--accent-blue)' }}>
                Ce qui va se passer
              </span>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.7 }}>
                {cible === 'collectif' ? (
                  <>
                    <li>Ses séances individuelles encore à venir sont annulées et retirées de l'agenda.</li>
                    <li>Son professeur actuel est retiré ; ses séances passées restent dans son parcours.</li>
                    <li>Son forfait individuel est soldé, ou supprimé s'il n'a jamais été entamé ni réglé.</li>
                  </>
                ) : (
                  <>
                    <li>Il quitte sa vague et sa classe ; les séances à venir de la classe continuent sans lui.</li>
                    <li>Son forfait collectif est soldé, ou supprimé s'il n'a jamais été entamé ni réglé.</li>
                    <li>Les heures déjà suivies et les comptes rendus restent dans son parcours.</li>
                  </>
                )}
              </ul>
            </div>
            <MessageInfo>
              Aucun règlement déjà encaissé n'est modifié — s'il y en a un sur le forfait quitté, il reste à traiter depuis
              l'onglet Paiements.
            </MessageInfo>
            {erreur && <MessageErreur>{erreur}</MessageErreur>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  setOuvert(false)
                  setErreur(null)
                }}
                disabled={enCours}
                style={boutonNeutreStyle}
              >
                Annuler
              </button>
              <button
                onClick={basculer}
                disabled={enCours}
                className="btn-shine"
                style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours ? 0.6 : 1 }}
              >
                {enCours ? 'Basculement…' : `Passer en ${titreCible}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modale>
  )
}
