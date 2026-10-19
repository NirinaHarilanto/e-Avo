import { useState, type CSSProperties } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import type { Database, TypePrestationExterne } from '../../types/database.types'
import { formaterHeures } from '../../lib/heures'
import { formaterMontant } from '../../lib/paiements'
import {
  COLONNE_TAUX_PRESTATION,
  heuresDepuisMinutes,
  LIBELLE_STATUT_PRESTATION,
  LIBELLE_TYPE_PRESTATION,
  montantEstime,
  peutEtreCloturee,
  peutEtreModifiee,
} from '../../lib/prestationsExternes'
import { usePrestationsExternes, type PrestationExterne } from '../../hooks/usePrestationsExternes'
import { Section } from '../ui/Section'
import { Modale } from '../ui/Modale'
import { ModaleConfirmation } from '../ui/ModaleConfirmation'
import { Champ, champStyle } from '../ui/Champ'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonDangerStyle, boutonNeutreStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

type Profile = Database['public']['Tables']['profiles']['Row']

/* Cours corporate et chat & chill d'un professeur — demande client du 2026-10-19 : « un bloc
   spécifique pour ces taux dans la fiche professeur de l'espace admin, à partir de laquelle
   l'admin pourra créer et suivre l'historique [...]. Le bloc devra être également visible dans
   l'espace professeur. Une fois une séance terminée, la séance pourra être facturée dans la
   timesheet du professeur. »

   Ces prestations sont données HORS cursus HOC : aucun élève inscrit, aucun forfait entamé,
   aucun compteur d'heures côté étudiant. Seul le crédit d'heures du professeur rejoint le
   registre commun à la clôture, ce qui les fait entrer dans son TimeSheet exactement comme une
   séance (voir api/prestations/cloturer.ts).

   Un seul composant pour les deux espaces, comme la liste des étudiants : `peutGerer` ouvre la
   création, la modification et l'annulation à l'admin ; le professeur, lui, consulte et clôture
   ce qu'il vient de donner. */

const TYPES: TypePrestationExterne[] = ['corporate', 'chat_chill']

function pastilleStatut(statut: PrestationExterne['statut']): CSSProperties {
  const tons = {
    planifiee: { color: 'var(--accent-blue)', bg: 'rgba(169,140,255,.14)', border: 'rgba(169,140,255,.32)' },
    terminee: { color: 'var(--accent-teal)', bg: 'rgba(111,227,192,.14)', border: 'rgba(111,227,192,.32)' },
    annulee: { color: 'var(--muted)', bg: 'rgba(255,255,255,.04)', border: 'var(--border)' },
  }[statut]
  return {
    fontSize: 10,
    fontWeight: 700,
    color: tons.color,
    background: tons.bg,
    border: `1px solid ${tons.border}`,
    borderRadius: 999,
    padding: '2px 8px',
    whiteSpace: 'nowrap',
  }
}

/* `datetime-local` veut « AAAA-MM-JJTHH:MM » en heure LOCALE : les conversions passent par les
   composantes locales, jamais par `toISOString()`, qui décalerait l'heure du fuseau. */
function versChampDateHeure(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const dd = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}T${dd(d.getHours())}:${dd(d.getMinutes())}`
}

function FormulairePrestation({
  professeur,
  prestation,
  onFermer,
  onEnregistre,
}: {
  professeur: Profile
  /* `null` pour une création. */
  prestation: PrestationExterne | null
  onFermer: () => void
  onEnregistre: () => void
}) {
  const { profile } = useProfileContext()
  const [type, setType] = useState<TypePrestationExterne>(prestation?.type ?? 'corporate')
  const [client, setClient] = useState(prestation?.client ?? '')
  const [debut, setDebut] = useState(versChampDateHeure(prestation?.debut ?? null))
  const [duree, setDuree] = useState(String(prestation?.duree_minutes ?? 60))
  const [lieu, setLieu] = useState(prestation?.lieu ?? '')
  const [notes, setNotes] = useState(prestation?.notes ?? '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const dureeMinutes = Number(duree)
  const dureeValide = Number.isFinite(dureeMinutes) && dureeMinutes > 0 && dureeMinutes <= 600
  const complet = client.trim().length > 0 && debut.length > 0 && dureeValide

  const taux = professeur[COLONNE_TAUX_PRESTATION[type]]
  const estimation = dureeValide ? montantEstime(dureeMinutes, taux) : null

  async function enregistrer() {
    if (!complet || !profile) return
    setEnCours(true)
    setErreur(null)

    const champs = {
      type,
      client: client.trim(),
      debut: new Date(debut).toISOString(),
      duree_minutes: dureeMinutes,
      lieu: lieu.trim() || null,
      notes: notes.trim() || null,
    }

    const { error } = prestation
      ? await supabase.from('prestations_externes').update(champs).eq('id', prestation.id)
      : await supabase.from('prestations_externes').insert({
          ...champs,
          etablissement_id: professeur.etablissement_id,
          teacher_id: professeur.id,
          cree_par: profile.id,
        })

    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onEnregistre()
  }

  return (
    <Modale
      titre={prestation ? 'Modifier la prestation' : 'Nouvelle prestation'}
      onFermer={onFermer}
      largeurMax={520}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        <Champ label="Type" obligatoire>
          <div style={{ display: 'flex', gap: 8 }}>
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                style={{
                  flexGrow: 1,
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: `1px solid ${type === t ? 'var(--accent-blue)' : 'var(--border)'}`,
                  background: type === t ? 'rgba(169,140,255,.12)' : 'transparent',
                  color: type === t ? 'var(--ink)' : 'var(--ink-2)',
                  fontWeight: type === t ? 700 : 500,
                  fontSize: 12.5,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {LIBELLE_TYPE_PRESTATION[t]}
              </button>
            ))}
          </div>
        </Champ>

        <Champ label="Client" obligatoire aide="L’entreprise ou la personne pour qui la prestation est donnée. C’est l’intitulé de la ligne au TimeSheet.">
          <input value={client} onChange={(e) => setClient(e.target.value)} style={champStyle} placeholder="Ex. Telma, ou Jean Rakoto" />
        </Champ>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 11 }}>
          <Champ label="Date et heure" obligatoire>
            <input type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="Durée (minutes)" obligatoire>
            <input type="number" min={15} max={600} step={15} value={duree} onChange={(e) => setDuree(e.target.value)} style={champStyle} />
          </Champ>
        </div>

        <Champ label="Lieu" aide="« En ligne », « Locaux du client »… Facultatif.">
          <input value={lieu} onChange={(e) => setLieu(e.target.value)} style={champStyle} />
        </Champ>

        <Champ label="Notes" aide="Visibles du professeur et de l’administration. Facultatives.">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </Champ>

        {/* Estimation et non montant : le montant définitif est recalculé à la validation du
            TimeSheet, avec le taux en vigueur à ce moment-là (même règle que les séances). */}
        <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-alt)', border: '1px solid var(--border-soft, var(--border))', fontSize: 12, lineHeight: 1.55, color: 'var(--ink-2)' }}>
          {taux == null ? (
            <>
              Aucun taux <strong>{LIBELLE_TYPE_PRESTATION[type].toLowerCase()}</strong> n’est renseigné sur la fiche de ce
              professeur. La prestation peut être créée, mais son TimeSheet ne pourra pas être validé tant que le taux
              manque — renseignez-le dans « Informations personnelles ».
            </>
          ) : (
            <>
              Estimation : <strong>{formaterHeures(heuresDepuisMinutes(dureeValide ? dureeMinutes : 0))}</strong> à{' '}
              {formaterMontant(taux)}/h, soit <strong>{estimation === null ? '—' : formaterMontant(estimation)}</strong>.
            </>
          )}
        </div>

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
          <button type="button" onClick={onFermer} style={boutonNeutreStyle}>
            Annuler
          </button>
          <button
            type="button"
            onClick={enregistrer}
            disabled={enCours || !complet}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, fontSize: 12.5, padding: '9px 18px', opacity: enCours || !complet ? 0.6 : 1 }}
          >
            {enCours ? 'Enregistrement…' : prestation ? 'Enregistrer' : 'Créer la prestation'}
          </button>
        </div>
      </div>
    </Modale>
  )
}

function LignePrestation({
  prestation,
  professeur,
  peutGerer,
  peutCloturer,
  sansCadre = false,
  onChange,
}: {
  prestation: PrestationExterne
  professeur: Profile | null
  peutGerer: boolean
  peutCloturer: boolean
  /* Dans une pop-up, la Modale porte déjà le cadre : un second ferait une carte dans une carte
     (même traitement que CarteSeance, qui a la même prop pour la même raison). */
  sansCadre?: boolean
  onChange: () => void
}) {
  const { session } = useProfileContext()
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [annulationOuverte, setAnnulationOuverte] = useState(false)
  const [motifAnnulation, setMotifAnnulation] = useState('')

  const heures = heuresDepuisMinutes(prestation.duree_minutes)
  const taux = professeur ? professeur[COLONNE_TAUX_PRESTATION[prestation.type]] : null
  const estimation = montantEstime(prestation.duree_minutes, taux)
  const cloturable = peutCloturer && peutEtreCloturee(prestation, new Date())
  const modifiable = peutGerer && peutEtreModifiee(prestation)

  async function cloturer() {
    if (!session) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/prestations/cloturer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ prestationId: prestation.id }),
    }).catch(() => null)
    setEnCours(false)
    if (!reponse || !reponse.ok) {
      const detail = reponse ? await reponse.json().catch(() => null) : null
      setErreur(detail?.error ?? 'La clôture a échoué. Réessayez dans un instant.')
      return
    }
    onChange()
  }

  async function annuler() {
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase
      .from('prestations_externes')
      .update({ statut: 'annulee', motif_annulation: motifAnnulation.trim() || null })
      .eq('id', prestation.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setAnnulationOuverte(false)
    setMotifAnnulation('')
    onChange()
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        padding: sansCadre ? 0 : '11px 13px',
        borderRadius: sansCadre ? 0 : 11,
        border: sansCadre ? 'none' : '1px solid var(--border-soft, var(--border))',
        background: sansCadre ? 'transparent' : 'var(--surface)',
        opacity: prestation.statut === 'annulee' ? 0.65 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{prestation.client}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)', background: 'rgba(233,207,148,.14)', border: '1px solid rgba(233,207,148,.32)', borderRadius: 999, padding: '2px 8px' }}>
          {LIBELLE_TYPE_PRESTATION[prestation.type]}
        </span>
        <span style={pastilleStatut(prestation.statut)}>{LIBELLE_STATUT_PRESTATION[prestation.statut]}</span>
      </div>

      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
        {new Date(prestation.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
        {formaterHeures(heures)}
        {prestation.lieu ? ` · ${prestation.lieu}` : ''}
      </span>

      {/* Le montant n'est affiché que s'il peut l'être : « 0 Ar » faute de taux renseigné serait
          un montant faux, pas une absence. */}
      <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
        {estimation === null
          ? 'Taux non renseigné pour ce type de prestation'
          : prestation.statut === 'terminee'
            ? `${formaterMontant(estimation)} — facturable sur le TimeSheet`
            : `Estimation : ${formaterMontant(estimation)}`}
      </span>

      {prestation.notes && <span style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>{prestation.notes}</span>}
      {prestation.statut === 'annulee' && prestation.motif_annulation && (
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Motif : {prestation.motif_annulation}</span>
      )}

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {(cloturable || modifiable) && (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {cloturable && (
            <button type="button" onClick={cloturer} disabled={enCours} className="btn-shine btn-secondary" style={{ opacity: enCours ? 0.6 : 1 }}>
              {enCours ? 'Clôture…' : 'Marquer comme terminée'}
            </button>
          )}
          {modifiable && (
            <>
              <button type="button" onClick={() => setFormulaireOuvert(true)} style={boutonSecondaireStyle}>
                Modifier
              </button>
              <button type="button" onClick={() => setAnnulationOuverte(true)} style={boutonDangerStyle}>
                Annuler
              </button>
            </>
          )}
        </div>
      )}

      {/* Une prestation planifiée dont l'heure n'est pas encore passée ne peut pas être clôturée :
          créditer des heures jamais données les enverrait en facturation. Le dire plutôt que de
          masquer un bouton sans explication. */}
      {peutCloturer && prestation.statut === 'planifiee' && !cloturable && (
        <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Clôturable une fois l’heure de début passée.</span>
      )}

      {formulaireOuvert && professeur && (
        <FormulairePrestation
          professeur={professeur}
          prestation={prestation}
          onFermer={() => setFormulaireOuvert(false)}
          onEnregistre={() => {
            setFormulaireOuvert(false)
            onChange()
          }}
        />
      )}

      {annulationOuverte && (
        <ModaleConfirmation
          titre="Annuler cette prestation ?"
          description={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span>
                La prestation pour « {prestation.client} » sera marquée annulée. Elle ne créditera aucune heure et ne
                pourra plus être clôturée.
              </span>
              <input
                value={motifAnnulation}
                onChange={(e) => setMotifAnnulation(e.target.value)}
                placeholder="Motif (facultatif)"
                style={champStyle}
              />
            </div>
          }
          libelleConfirmer="Annuler la prestation"
          libelleEnCours="Annulation…"
          enCours={enCours}
          erreur={erreur}
          onConfirmer={annuler}
          onFermer={() => setAnnulationOuverte(false)}
        />
      )}
    </div>
  )
}

/* La même fiche, sortie de sa liste : ouverte au clic sur une prestation dans l'agenda du
   professeur (CalendrierProfesseur.tsx). Clôture possible, modification non — celle-ci se fait
   depuis la fiche du professeur côté admin, où vit la gestion. */
export function FichePrestation({
  prestation,
  professeur,
  onChange,
}: {
  prestation: PrestationExterne
  professeur: Profile | null
  onChange: () => void
}) {
  return <LignePrestation prestation={prestation} professeur={professeur} peutGerer={false} peutCloturer sansCadre onChange={onChange} />
}

export function PrestationsExternes({
  professeur,
  peutGerer = false,
  peutCloturer = false,
  padding,
}: {
  professeur: Profile | null
  /* Création, modification et annulation : l'admin seulement. */
  peutGerer?: boolean
  /* Clôture : l'admin, et le professeur pour les siennes. */
  peutCloturer?: boolean
  /* Repassé tel quel à `Section` — demande client du 2026-10-19 : ce bloc doit avoir
     « exactement » le même style que ses voisins directs. Dans la fiche professeur de l'espace
     admin, il suit immédiatement « Élèves attribués » (padding={22}) ; dans « Mes heures » côté
     professeur, ses voisins (« Répartition par élève », « Satisfaction des élèves ») n'en passent
     aucun — chaque appelant demande donc le padding de SES propres voisins plutôt qu'une valeur
     unique qui ne collerait qu'à l'un des deux contextes. */
  padding?: number | string
}) {
  const { prestations, loading, recharger } = usePrestationsExternes(professeur?.id)
  const [creationOuverte, setCreationOuverte] = useState(false)

  const terminees = prestations.filter((p) => p.statut === 'terminee')
  const aVenir = prestations.filter((p) => p.statut === 'planifiee')

  return (
    <Section
      titre="Cours corporate & chat & chill"
      compteur={prestations.length}
      padding={padding}
      actions={
        peutGerer && professeur ? (
          <button type="button" onClick={() => setCreationOuverte(true)} style={boutonSecondaireStyle}>
            <Icone nom="plus" taille={13} />
            Nouvelle prestation
          </button>
        ) : undefined
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--muted)' }}>
          Prestations données hors cursus HOC, sans élève inscrit ni forfait. Une fois terminée, la séance crédite les
          heures du professeur et se déclare sur son TimeSheet, au taux {''}
          {LIBELLE_TYPE_PRESTATION.corporate.toLowerCase()} ou {LIBELLE_TYPE_PRESTATION.chat_chill.toLowerCase()} de sa
          fiche.
        </p>

        {prestations.length > 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {aVenir.length} à venir · {terminees.length} terminée{terminees.length > 1 ? 's' : ''} ·{' '}
            {formaterHeures(terminees.reduce((total, p) => total + heuresDepuisMinutes(p.duree_minutes), 0))} au total
          </span>
        )}

        {loading && <EtatChargement lignes={2} hauteur={74} />}

        {!loading && prestations.length === 0 && (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted-2)', lineHeight: 1.55 }}>
            {peutGerer
              ? 'Aucune prestation pour l’instant. « Nouvelle prestation » en crée une.'
              : 'Aucune prestation corporate ou chat & chill ne vous est rattachée.'}
          </p>
        )}

        {!loading &&
          prestations.map((prestation) => (
            <LignePrestation
              key={prestation.id}
              prestation={prestation}
              professeur={professeur}
              peutGerer={peutGerer}
              peutCloturer={peutCloturer}
              onChange={recharger}
            />
          ))}
      </div>

      {creationOuverte && professeur && (
        <FormulairePrestation
          professeur={professeur}
          prestation={null}
          onFermer={() => setCreationOuverte(false)}
          onEnregistre={() => {
            setCreationOuverte(false)
            recharger()
          }}
        />
      )}
    </Section>
  )
}
