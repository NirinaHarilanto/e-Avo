import { useMemo, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useHeuresDeclarables, useTimesheets, type TimesheetAvecProfesseur } from '../../hooks/useTimesheets'
import { FUSEAU_ETABLISSEMENT, formaterDansFuseauEtablissement } from '../../lib/etablissement'
import { formaterHeures } from '../../lib/heures'
import { Section } from '../ui/Section'
import { Champ, champStyle } from '../ui/Champ'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur, MessageSucces } from '../ui/Etats'
import { boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'
import { OverlayImpression, type ActionImpression } from '../facturation/OverlayImpression'
import { LABEL_STATUT_TIMESHEET, TimesheetDocument } from '../timesheets/TimesheetDocument'
import { ChampDate } from '../ui/ChampDate'

const jourLocal = (d: Date) => new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU_ETABLISSEMENT }).format(d)

function premierDuMois(): string {
  return `${jourLocal(new Date()).slice(0, 8)}01`
}

const COULEUR_STATUT = { soumis: 'var(--accent-gold, #e9cf94)', valide: 'var(--accent-teal)', refuse: 'var(--danger)' } as const

/* TimeSheet du professeur (demande client du 2026-09-29) : il rassemble ses heures clôturées et
   non payées d'une période, les vérifie, et les envoie à l'administration, qui les reçoit sous
   forme de facture à valider. */
export function TimesheetProfesseur() {
  const { profile, session } = useProfileContext()
  const { heures, loading, recharger: rechargerHeures } = useHeuresDeclarables(profile?.id)
  const { timesheets, recharger: rechargerTimesheets } = useTimesheets(profile?.id)
  const [debut, setDebut] = useState(premierDuMois)
  const [fin, setFin] = useState(() => jourLocal(new Date()))
  const [exclues, setExclues] = useState<Set<string>>(new Set())
  const [commentaire, setCommentaire] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)
  const [ouvert, setOuvert] = useState<{ item: TimesheetAvecProfesseur; action: ActionImpression } | null>(null)

  const dansPeriode = useMemo(
    () => heures.filter((h) => h.debut && jourLocal(new Date(h.debut)) >= debut && jourLocal(new Date(h.debut)) <= fin),
    [heures, debut, fin],
  )
  const retenues = dansPeriode.filter((h) => !exclues.has(h.id))
  const total = Math.round(retenues.reduce((t, h) => t + h.heures, 0) * 100) / 100
  const taux = profile?.taux_horaire ?? null

  function basculer(id: string) {
    setExclues((actuel) => {
      const suivant = new Set(actuel)
      if (suivant.has(id)) suivant.delete(id)
      else suivant.add(id)
      return suivant
    })
  }

  async function envoyer() {
    if (!session || retenues.length === 0) return
    setEnCours(true)
    setErreur(null)
    setSucces(null)
    const reponse = await fetch('/api/professeur/soumettre-timesheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ periodeDebut: debut, periodeFin: fin, hourLedgerIds: retenues.map((h) => h.id), commentaire }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
    setEnCours(false)
    if (reponse.error) {
      setErreur(reponse.error)
      return
    }
    setSucces(`TimeSheet ${reponse.numero} envoyé à l’administration pour validation.`)
    setCommentaire('')
    setExclues(new Set())
    rechargerHeures()
    rechargerTimesheets()
  }

  const nomProfesseur = [profile?.prenom, profile?.nom].filter(Boolean).join(' ')

  return (
    <>
      <Section
        titre="TimeSheet"
        description="Rassemblez vos heures clôturées et non encore payées sur une période, puis envoyez-les à l’administration. Une fois validé, votre TimeSheet devient votre facture de rémunération."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Champ label="Du">
              <ChampDate type="date" value={debut} max={fin} onChange={(e) => setDebut(e.target.value)} style={champStyle} />
            </Champ>
            <Champ label="Au">
              <ChampDate type="date" value={fin} min={debut} onChange={(e) => setFin(e.target.value)} style={champStyle} />
            </Champ>
          </div>

          {loading ? (
            <EtatChargement lignes={3} hauteur={36} />
          ) : dansPeriode.length === 0 ? (
            <EtatVide
              icone="timesheet"
              titre="Aucune heure à déclarer sur cette période"
              description="Seules les séances clôturées, non payées et pas encore déclarées apparaissent ici. Élargissez la période ou clôturez vos séances passées depuis votre agenda."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {dansPeriode.map((h) => (
                <label
                  key={h.id}
                  className="row-hl"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderBottom: '1px solid var(--border-soft)', cursor: 'pointer' }}
                >
                  <input type="checkbox" checked={!exclues.has(h.id)} onChange={() => basculer(h.id)} />
                  <span style={{ fontSize: 12.5, color: 'var(--ink)', minWidth: 150 }}>
                    {h.debut ? formaterDansFuseauEtablissement(h.debut, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.eleves || '—'}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>{formaterHeures(h.heures)}</span>
                </label>
              ))}
            </div>
          )}

          {dansPeriode.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, flexWrap: 'wrap', fontSize: 13, color: 'var(--ink-2)' }}>
                <span>
                  {retenues.length} séance{retenues.length > 1 ? 's' : ''} · <strong>{formaterHeures(total)}</strong>
                </span>
                <span>
                  Montant estimé :{' '}
                  <strong style={{ color: 'var(--accent-gold, #e9cf94)' }}>
                    {taux ? `${(total * taux).toLocaleString('fr-FR')} Ar` : 'taux horaire non renseigné'}
                  </strong>
                </span>
              </div>
              <Champ label="Commentaire pour l’administration (facultatif)">
                <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} rows={2} style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }} />
              </Champ>
              {erreur && <MessageErreur>{erreur}</MessageErreur>}
              <button onClick={envoyer} disabled={enCours || retenues.length === 0} className="btn-shine" style={{ ...boutonPrimaireStyle, alignSelf: 'flex-end', opacity: enCours || retenues.length === 0 ? 0.6 : 1 }}>
                {enCours ? 'Envoi…' : 'Envoyer pour validation'}
              </button>
            </>
          )}
          {succes && <MessageSucces>{succes}</MessageSucces>}
        </div>
      </Section>

      {timesheets.length > 0 && (
        <Section titre="Mes TimeSheets envoyés" compteur={timesheets.length}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {timesheets.map((item) => {
              const t = item.timesheet
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 6px', borderBottom: '1px solid var(--border-soft)' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{t.numero}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', flexGrow: 1 }}>
                    {new Date(`${t.periode_debut}T12:00:00`).toLocaleDateString('fr-FR')} → {new Date(`${t.periode_fin}T12:00:00`).toLocaleDateString('fr-FR')} ·{' '}
                    {formaterHeures(Number(t.total_heures))}
                    {t.statut === 'refuse' && t.motif_refus ? ` · motif : ${t.motif_refus}` : ''}
                  </span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: COULEUR_STATUT[t.statut] }}>{LABEL_STATUT_TIMESHEET[t.statut]}</span>
                  {(['voir', 'imprimer', 'telecharger'] as const).map((a) => (
                    <button key={a} onClick={() => setOuvert({ item, action: a })} style={{ ...boutonSecondaireStyle, fontSize: 11.5, padding: '5px 11px' }}>
                      {a === 'voir' ? 'Voir' : a === 'imprimer' ? 'Imprimer' : 'Télécharger'}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {ouvert && (
        <OverlayImpression onFermer={() => setOuvert(null)} nomFichier={`TimeSheet ${ouvert.item.timesheet.numero}`} actionInitiale={ouvert.action}>
          <TimesheetDocument timesheet={ouvert.item.timesheet} nomProfesseur={nomProfesseur} tauxCourant={taux} />
        </OverlayImpression>
      )}
    </>
  )
}
