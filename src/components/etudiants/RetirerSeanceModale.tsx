import { useState } from 'react'
import { jetonAcces } from '../../lib/jetonAcces'
import { formaterMinutes } from '../../lib/heures'
import type { SeanceDuParcours } from '../../hooks/useDossierEtudiant'
import { Modale } from '../ui/Modale'
import { MessageErreur } from '../ui/Etats'
import { boutonDangerStyle, boutonNeutreStyle } from '../ui/Boutons'

/* Confirmation avant de retirer une séance du parcours — demande client du 2026-11-05 : « un
   icône qui permet de retirer visuellement la séance. Quand le bouton est sélectionné, un pop-up
   apparaît pour demander confirmation. »

   Le pop-up ne se contente pas de demander « êtes-vous sûr ? » : il annonce ce qui part avec la
   séance. Une séance CLÔTURÉE a déjà débité l'élève et crédité son professeur — la retirer
   ramène ces compteurs à leur valeur d'avant, et c'est exactement ce que l'admin doit savoir
   avant de cliquer. */
export function RetirerSeanceModale({
  seance,
  nomEleve,
  onFermer,
  onRetiree,
}: {
  seance: SeanceDuParcours
  nomEleve: string
  onFermer: () => void
  onRetiree: () => void
}) {
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  /* « terminee » : la clôture a écrit au grand livre. « reportee » (0085) n'a rien écrit — ni
     l'élève ni le professeur n'ont été impactés —, et « planifiee »/« annulee » non plus. */
  const aCompteDesHeures = seance.session.statut === 'terminee'
  const date = new Date(seance.session.debut).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const heure = new Date(seance.session.debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  async function retirer() {
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/professeur/retirer-seance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonAcces()}` },
      body: JSON.stringify({ sessionId: seance.session.id }),
    })
    const corps = (await reponse.json().catch(() => ({}))) as { error?: string }
    setEnCours(false)
    if (!reponse.ok) {
      setErreur(corps.error ?? 'Le retrait de la séance a échoué.')
      return
    }
    onRetiree()
    onFermer()
  }

  return (
    <Modale titre="Retirer cette séance" onFermer={onFermer} largeurMax={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2, var(--ink))', lineHeight: 1.6 }}>
          La séance du <strong style={{ color: 'var(--ink)' }}>{date} à {heure}</strong> (
          {formaterMinutes(seance.session.duree_minutes)}) sera retirée du parcours de {nomEleve}.
        </p>

        <div style={{ borderRadius: 12, border: '1px solid var(--border)', padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>
            Ce qui part avec elle
          </span>
          <ul style={{ margin: 0, paddingLeft: 17, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7 }}>
            {aCompteDesHeures ? (
              <li>
                <strong style={{ color: 'var(--ink-2, var(--ink))' }}>
                  Les {formaterMinutes(seance.session.duree_minutes)} comptés à l’élève et à son professeur
                </strong>{' '}
                : les deux compteurs reviennent à leur valeur d’avant la clôture.
              </li>
            ) : (
              <li>Aucune heure n’a été comptée : cette séance n’a jamais été clôturée.</li>
            )}
            <li>Son compte rendu et son enquête de satisfaction, s’il y en a.</li>
            <li>Son créneau dans l’agenda Google du professeur ou de l’établissement.</li>
          </ul>
        </div>

        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted-2)', lineHeight: 1.5 }}>
          Cette action est définitive : la séance ne sera pas récupérable. Si ses heures ont déjà
          été payées, le retrait sera refusé — corrigez alors le compteur depuis
          « Heures suivies › Modifier ».
        </p>

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onFermer} disabled={enCours} style={boutonNeutreStyle}>
            Annuler
          </button>
          <button
            type="button"
            onClick={retirer}
            disabled={enCours}
            style={{ ...boutonDangerStyle, opacity: enCours ? 0.6 : 1 }}
          >
            {enCours ? 'Retrait…' : 'Retirer la séance'}
          </button>
        </div>
      </div>
    </Modale>
  )
}
