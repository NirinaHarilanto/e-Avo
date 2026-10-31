import { useState } from 'react'
import { jetonAcces } from '../../lib/jetonAcces'
import { Modale } from '../ui/Modale'
import { Champ, champStyle } from '../ui/Champ'
import { ChampDate } from '../ui/ChampDate'
import { MessageErreur } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'

/* Prochain quart d'heure à venir, au format attendu par `<input type="datetime-local">` : l'heure
   LOCALE du navigateur, sans « Z » ni décalage. Passer par `toISOString()` reculerait la date d'un
   jour en début de soirée à Madagascar (UTC+3), comme partout ailleurs dans HOC. */
function prochainQuartDHeure(): string {
  const date = new Date()
  date.setMinutes(Math.ceil((date.getMinutes() + 1) / 15) * 15, 0, 0)
  const deuxChiffres = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${deuxChiffres(date.getMonth() + 1)}-${deuxChiffres(date.getDate())}T${deuxChiffres(date.getHours())}:${deuxChiffres(date.getMinutes())}`
}

/**
 * Ajout d'UN créneau à l'élève depuis son onglet Forfait (demande client du 2026-10-31).
 *
 * Complète le planning prévisionnel (PlanifierSeancesForfait), qui génère une série entière selon
 * un rythme : il fallait jusqu'ici rouvrir ce générateur — et donc toucher à toute la série — pour
 * ajouter une seule séance, ou passer par l'agenda et y resaisir l'élève et son professeur. Ici,
 * les deux sont déjà connus : il ne reste que la date, l'heure et la durée à donner.
 *
 * Même route que l'agenda admin (`planifier-seance`), donc mêmes règles : la séance naît
 * « planifiée », son lien de visioconférence est créé dans la foulée, et le professeur comme
 * l'élève la voient aussitôt dans leur agenda. Type « individuel » — un binôme DUO suit sur la
 * séance du principal, il n'est jamais passé en second `studentId` (voir les règles DUO).
 */
export function NouveauCreneauEtudiant({
  studentIds,
  teacherId,
  dureeParDefaut = 60,
  onCree,
}: {
  studentIds: string[]
  teacherId: string
  dureeParDefaut?: number
  onCree: () => void
}) {
  const [ouverte, setOuverte] = useState(false)
  const [debut, setDebut] = useState(prochainQuartDHeure)
  const [dureeMinutes, setDureeMinutes] = useState(dureeParDefaut)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  function ouvrir() {
    setDebut(prochainQuartDHeure())
    setDureeMinutes(dureeParDefaut)
    setErreur(null)
    setOuverte(true)
  }

  async function creer() {
    const instant = new Date(debut)
    if (Number.isNaN(instant.getTime())) {
      setErreur('Indiquez une date et une heure valides.')
      return
    }
    setEnCours(true)
    setErreur(null)
    const jeton = await jetonAcces()
    const reponse = await fetch('/api/professeur/planifier-seance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
      body: JSON.stringify({
        teacherId,
        studentIds,
        type: 'individuel',
        debut: instant.toISOString(),
        dureeMinutes,
      }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
    setEnCours(false)
    if (reponse.error) {
      setErreur(reponse.error)
      return
    }
    setOuverte(false)
    onCree()
  }

  return (
    <>
      <button type="button" onClick={ouvrir} style={boutonPrimaireStyle}>
        Nouveau créneau
      </button>

      {ouverte && (
        <Modale titre="Nouveau créneau" onFermer={() => setOuverte(false)} largeurMax={460}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Champ label="Date et heure de début" obligatoire>
              <ChampDate type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} style={champStyle} />
            </Champ>
            <Champ label="Durée (minutes)" obligatoire>
              <input type="number" min={15} step={15} value={dureeMinutes} onChange={(e) => setDureeMinutes(Number(e.target.value))} style={champStyle} />
            </Champ>

            {erreur && <MessageErreur>{erreur}</MessageErreur>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setOuverte(false)} style={boutonNeutreStyle}>
                Annuler
              </button>
              <button type="button" onClick={creer} disabled={enCours} style={boutonPrimaireStyle}>
                {enCours ? 'Création…' : 'Créer le créneau'}
              </button>
            </div>
          </div>
        </Modale>
      )}
    </>
  )
}
