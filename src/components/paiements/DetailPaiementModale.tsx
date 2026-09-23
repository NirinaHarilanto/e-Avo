import { useCallback, useEffect, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { acompteSuggere, arrondi, formaterMontant, resteAPayer, statutReglement } from '../../lib/paiements'
import { useEtablissement } from '../../hooks/useEtablissement'
import { formaterHeures } from '../../lib/heures'
import { nomAvecDuo } from '../../lib/duo'
import { EcheancierPaiement } from './EcheancierPaiement'
import { FUSEAU_ETABLISSEMENT } from '../../lib/etablissement'
import type { Database } from '../../types/database.types'
import { BadgeStatutPaiement } from '../shared/BadgeStatutPaiement'
import { Modale } from '../ui/Modale'
import { Champ, champStyle, LigneInfo } from '../ui/Champ'
import { boutonDangerStyle, boutonNeutreStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'
import { EtatChargement, MessageErreur } from '../ui/Etats'

type StudentPayment = Database['public']['Tables']['student_payments']['Row']
type TeacherPayment = Database['public']['Tables']['teacher_payments']['Row']
type Package = Database['public']['Tables']['packages']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Versement = Database['public']['Tables']['paiement_versements']['Row']
type Invoice = Database['public']['Tables']['invoices']['Row']

/* Trois points d'entrée pour une même fenêtre : une ligne de paiement étudiant, une
   rémunération professeur, ou un forfait souscrit dont la ligne de paiement n'existe pas
   encore en base (voir `ForfaitAPayer` dans usePaiementsEtudiants). Ce dernier cas ne se
   distingue des deux autres que le temps du premier enregistrement : dès que la ligne est
   créée, la fenêtre affiche exactement la même chose qu'un paiement étudiant ordinaire. */
export type CiblePaiement =
  | {
      type: 'etudiant'
      paiement: StudentPayment
      personne: Profile | null
      forfait: Package | null
      professeur: Profile | null
      /* Partenaire DUO de la personne concernée (0054) — demande client du 2026-09-23 : « dans
         toutes les fenêtres [...] afficher les deux noms des personnes formant le DUO ». */
      duoPartenaire?: Profile | null
    }
  | { type: 'professeur'; paiement: TeacherPayment; personne: Profile | null }
  | { type: 'forfait'; forfait: Package; personne: Profile | null; professeur: Profile | null; duoPartenaire?: Profile | null }
  /* Forfait réglé AVANT la conversion en étudiant (0056) : la ligne est rattachée au prospect,
     `student_id` reste nul jusqu'à la conversion qui la reprend telle quelle. Rien d'autre ne
     change — acomptes, reste dû, reçu et facture sont ceux de n'importe quel paiement. */
  | { type: 'prospect'; prospect: ProspectAPayer; tarif: TarifChoisi | null; paiement: StudentPayment | null }

export interface ProspectAPayer {
  id: string
  etablissement_id: string
  prenom: string
  nom: string
}

export interface TarifChoisi {
  titre: string
  prix: number
  heures: number | null
}

const LABEL_PROGRAMME: Record<Package['type_programme'], string> = {
  individuel: 'Individuel',
  duo: 'Duo',
  collectif: 'Collectif',
}

/* Date du jour telle que l'admin la lit sur son calendrier, pas la date UTC : `toISOString()`
   renverrait la veille entre minuit et 3 h du matin à Antananarivo (UTC+3), et un acompte
   encaissé en soirée serait daté du jour précédent. */
const dateDuJour = new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU_ETABLISSEMENT }).format(new Date())

interface HeureEnseignee {
  id: string
  heures: number
  debut: string | null
}

export function DetailPaiementModale({ cible, onFermer, onChange }: { cible: CiblePaiement; onFermer: () => void; onChange: () => void }) {
  const { profile, session } = useProfileContext()
  const etablissement = useEtablissement(profile?.etablissement_id)
  /* La ligne de paiement d'un forfait pas encore facturé naît dans cette fenêtre : son
     identifiant n'existe qu'à partir de sa création, d'où cet état local plutôt qu'une
     remontée immédiate au parent (qui refermerait la fenêtre en rechargeant sa liste). */
  const [paiement, setPaiement] = useState<StudentPayment | TeacherPayment | null>(
    cible.type === 'forfait' ? null : cible.paiement,
  )
  const [versements, setVersements] = useState<Versement[] | null>(null)
  const [heures, setHeures] = useState<HeureEnseignee[]>([])
  const [facture, setFacture] = useState<Invoice | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const estProfesseur = cible.type === 'professeur'
  const colonneCible = estProfesseur ? 'teacher_payment_id' : 'student_payment_id'
  // Binôme DUO toujours affiché ensemble, y compris dans une fenêtre qui ne concerne
  // financièrement qu'un seul des deux (forfait partagé porté par un seul, ou heure d'essai
  // individuelle) — demande client du 2026-09-23.
  const duoPartenaire = cible.type === 'etudiant' || cible.type === 'forfait' ? (cible.duoPartenaire ?? null) : null
  const nomPersonne =
    cible.type === 'prospect'
      ? `${cible.prospect.prenom} ${cible.prospect.nom}`
      : cible.personne
        ? nomAvecDuo(cible.personne, duoPartenaire)
        : 'Personne inconnue'

  const charger = useCallback(async () => {
    if (!paiement) {
      setVersements([])
      return
    }
    const [{ data: lignes }, { data: factures }] = await Promise.all([
      supabase.from('paiement_versements').select('*').eq(colonneCible, paiement.id).order('date_versement'),
      supabase
        .from('invoices')
        .select('*')
        .eq(estProfesseur ? 'teacher_payment_id' : 'payment_id', paiement.id)
        .limit(1),
    ])
    setVersements(lignes ?? [])
    setFacture(factures?.[0] ?? null)

    if (estProfesseur) {
      const { data: ecritures } = await supabase
        .from('hour_ledger')
        .select('id, heures, session_id')
        .eq('teacher_payment_id', paiement.id)
      const sessionIds = [...new Set((ecritures ?? []).map((e) => e.session_id))]
      const { data: seances } = sessionIds.length
        ? await supabase.from('sessions').select('id, debut').in('id', sessionIds)
        : { data: [] as { id: string; debut: string }[] }
      const debutParSeance = new Map((seances ?? []).map((s) => [s.id, s.debut]))
      setHeures(
        (ecritures ?? [])
          .map((e) => ({ id: e.id, heures: e.heures, debut: debutParSeance.get(e.session_id) ?? null }))
          .sort((a, b) => (a.debut ?? '').localeCompare(b.debut ?? '')),
      )
    }
  }, [paiement, colonneCible, estProfesseur])

  useEffect(() => {
    charger()
  }, [charger])

  const ligne = paiement
    ? { montant: paiement.montant, montant_regle: paiement.montant_regle, statut: paiement.statut }
    : null

  async function rafraichirPaiement() {
    if (!paiement) return
    const { data } = estProfesseur
      ? await supabase.from('teacher_payments').select('*').eq('id', paiement.id).single()
      : await supabase.from('student_payments').select('*').eq('id', paiement.id).single()
    if (data) setPaiement(data)
  }

  async function creerLignePaiement(montant: number, dateEcheance: string) {
    if (!profile || (cible.type !== 'forfait' && cible.type !== 'prospect')) return
    setEnCours(true)
    setErreur(null)
    /* Prospect : ni `student_id` ni `package_id` n'existent encore — ils seront posés par
       api/admin/convert-prospect.ts au moment de la conversion, sur cette même ligne. */
    const rattachement =
      cible.type === 'forfait'
        ? { etablissement_id: cible.forfait.etablissement_id, student_id: cible.forfait.student_id, package_id: cible.forfait.id }
        : { etablissement_id: cible.prospect.etablissement_id, prospect_id: cible.prospect.id }
    const { data, error } = await supabase
      .from('student_payments')
      .insert({
        ...rattachement,
        montant,
        date_echeance: dateEcheance || null,
        created_by_profile_id: profile.id,
      })
      .select('*')
      .single()
    setEnCours(false)
    if (error || !data) {
      setErreur(error?.message ?? 'La création a échoué.')
      return
    }
    setPaiement(data)
    onChange()
  }

  async function ajouterVersement(valeurs: { montant: number; date: string; moyen: string; reference: string; notes: string }) {
    if (!profile || !paiement) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('paiement_versements').insert({
      etablissement_id: paiement.etablissement_id,
      student_payment_id: estProfesseur ? null : paiement.id,
      teacher_payment_id: estProfesseur ? paiement.id : null,
      montant: valeurs.montant,
      date_versement: valeurs.date,
      moyen_paiement: valeurs.moyen || null,
      reference: valeurs.reference || null,
      notes: valeurs.notes || null,
      created_by_profile_id: profile.id,
    })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    await Promise.all([rafraichirPaiement(), charger()])
    onChange()
  }

  async function supprimerVersement(id: string) {
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('paiement_versements').delete().eq('id', id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    await Promise.all([rafraichirPaiement(), charger()])
    onChange()
  }

  async function supprimerPaiement(motif: string) {
    if (!profile || !paiement) return
    setEnCours(true)
    setErreur(null)
    /* Suppression douce : la ligne sort des listes mais reste en base avec son motif et son
       auteur. Un vrai DELETE ferait disparaître sans trace un mouvement financier, et casserait
       les factures déjà émises qui le référencent. */
    const champs = { supprime_le: new Date().toISOString(), supprime_par: profile.id, motif_suppression: motif }
    const { error } = estProfesseur
      ? await supabase.from('teacher_payments').update(champs).eq('id', paiement.id)
      : await supabase.from('student_payments').update(champs).eq('id', paiement.id)
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onChange()
    onFermer()
  }

  async function genererFacture() {
    if (!session || !paiement) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/generer-facture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ table: estProfesseur ? 'teacher_payments' : 'student_payments', id: paiement.id }),
    })
      .then((r) => r.json())
      .catch(() => ({ error: 'Le serveur n’a pas répondu.' }))
    setEnCours(false)
    if (reponse.error) {
      setErreur(reponse.error)
      return
    }
    await charger()
    onChange()
  }

  return (
    <Modale titre={`Paiement · ${nomPersonne}`} onFermer={onFermer} largeurMax={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        {!paiement && (cible.type === 'forfait' || cible.type === 'prospect') ? (
          <CreationLignePaiement
            introduction={
              cible.type === 'forfait'
                ? 'Ce forfait est souscrit et un professeur est attribué, mais aucun paiement n’a encore été enregistré. Créez la ligne pour pouvoir y saisir des acomptes et générer une facture.'
                : 'Enregistrez ici le règlement du forfait choisi par ce prospect. Le paiement le suivra tel quel dans son dossier d’étudiant après la conversion : acomptes, reçu et facture restent rattachés à cette même ligne.'
            }
            lignes={
              cible.type === 'forfait'
                ? [
                    { label: 'Forfait', valeur: `${LABEL_PROGRAMME[cible.forfait.type_programme]} · ${cible.forfait.total_heures} h` },
                    { label: 'Professeur', valeur: cible.professeur ? `${cible.professeur.prenom} ${cible.professeur.nom}` : 'Non attribué' },
                  ]
                : [
                    {
                      label: 'Forfait choisi',
                      valeur: cible.tarif
                        ? `${cible.tarif.titre}${cible.tarif.heures != null ? ` · ${cible.tarif.heures} h` : ''}`
                        : 'Aucun forfait choisi',
                    },
                  ]
            }
            montantInitial={cible.type === 'forfait' ? cible.forfait.montant : (cible.tarif?.prix ?? null)}
            echeanceInitiale={cible.type === 'forfait' ? cible.forfait.echeance : null}
            enCours={enCours}
            onCreer={creerLignePaiement}
          />
        ) : (
          ligne &&
          paiement && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <BadgeStatutPaiement statut={statutReglement(ligne)} />
                  {facture && (
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      Facture {facture.numero} émise
                    </span>
                  )}
                </div>
                <LigneInfo label="Montant dû" valeur={formaterMontant(paiement.montant, paiement.devise)} />
                <LigneInfo label="Déjà réglé" valeur={formaterMontant(paiement.montant_regle, paiement.devise)} />
                <LigneInfo
                  label="Reste à payer"
                  valeur={
                    <strong style={{ color: resteAPayer(ligne) > 0 ? 'var(--accent-gold, #e9cf94)' : 'var(--accent-teal)' }}>
                      {formaterMontant(resteAPayer(ligne), paiement.devise)}
                    </strong>
                  }
                />
                {cible.type === 'etudiant' && cible.forfait && (
                  <LigneInfo
                    label="Forfait"
                    valeur={`${LABEL_PROGRAMME[cible.forfait.type_programme]} · ${cible.forfait.total_heures} h`}
                  />
                )}
                {cible.type === 'etudiant' && (
                  <LigneInfo label="Professeur" valeur={cible.professeur ? `${cible.professeur.prenom} ${cible.professeur.nom}` : 'Non attribué'} />
                )}
                {cible.type === 'professeur' && 'periode_debut' in paiement && paiement.periode_debut && (
                  <LigneInfo
                    label="Période"
                    valeur={`${new Date(paiement.periode_debut).toLocaleDateString('fr-FR')}${paiement.periode_fin ? ` → ${new Date(paiement.periode_fin).toLocaleDateString('fr-FR')}` : ''}`}
                  />
                )}
                {paiement.date_echeance && (
                  <LigneInfo label="Échéance" valeur={new Date(paiement.date_echeance).toLocaleDateString('fr-FR')} />
                )}
              </div>

              {estProfesseur && heures.length > 0 && (
                <BlocHeures heures={heures} tauxHoraire={cible.type === 'professeur' ? (cible.personne?.taux_horaire ?? null) : null} />
              )}

              <BlocVersements
                versements={versements}
                devise={paiement.devise}
                enCours={enCours}
                onSupprimer={supprimerVersement}
              />

              {resteAPayer(ligne) > 0 && (
                <FormulaireAcompte
                  suggestion={acompteSuggere(ligne)}
                  devise={paiement.devise}
                  enCours={enCours}
                  estProfesseur={estProfesseur}
                  onValider={ajouterVersement}
                />
              )}

              {/* L'échéancier ne concerne que les élèves : une rémunération de professeur se
                  règle en une fois, on ne lui planifie pas un calendrier de versements. */}
              {!estProfesseur && (
                <EcheancierPaiement
                  studentPaymentId={paiement.id}
                  etablissementId={paiement.etablissement_id}
                  devise={paiement.devise}
                  resteDu={resteAPayer(ligne)}
                  relanceJours={etablissement?.relance_echeance_jours ?? 3}
                />
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
                <button onClick={genererFacture} disabled={enCours || !!facture} style={boutonSecondaireStyle}>
                  {facture ? `Facture ${facture.numero} générée` : estProfesseur ? 'Générer la facture de rémunération' : 'Générer une facture'}
                </button>
                <SuppressionPaiement enCours={enCours} onSupprimer={supprimerPaiement} />
              </div>
            </>
          )
        )}
      </div>
    </Modale>
  )
}

/* Première étape pour un forfait encore jamais facturé : la ligne de paiement est proposée
   avec le montant et l'échéance déjà convenus sur le forfait, à confirmer ou corriger. */
/* Création de la ligne de paiement, partagée par le forfait d'un étudiant et le forfait choisi
   par un prospect (0056) : seuls le texte d'introduction et les lignes de rappel changent, le
   reste (montant, échéance, écriture) est identique. */
function CreationLignePaiement({
  introduction,
  lignes,
  montantInitial,
  echeanceInitiale,
  enCours,
  onCreer,
}: {
  introduction: string
  lignes: { label: string; valeur: string }[]
  montantInitial: number | null
  echeanceInitiale: string | null
  enCours: boolean
  onCreer: (montant: number, dateEcheance: string) => void
}) {
  const [montant, setMontant] = useState(montantInitial != null ? String(montantInitial) : '')
  const [echeance, setEcheance] = useState(echeanceInitiale ?? '')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)', margin: 0 }}>{introduction}</p>
      {lignes.map((l) => (
        <LigneInfo key={l.label} label={l.label} valeur={l.valeur} />
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Champ label="Montant dû (Ar)" obligatoire aide={montantInitial == null ? 'Aucun montant connu : saisissez-le.' : undefined}>
          <input type="number" min={0} step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} style={champStyle} />
        </Champ>
        <Champ label="Échéance">
          <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} style={champStyle} />
        </Champ>
      </div>
      <button
        onClick={() => onCreer(Number(montant), echeance)}
        disabled={enCours || !montant || Number(montant) <= 0}
        className="btn-shine"
        style={{ ...boutonPrimaireStyle, opacity: enCours || !montant ? 0.6 : 1 }}
      >
        {enCours ? 'Création…' : 'Créer la ligne de paiement'}
      </button>
    </div>
  )
}

function BlocHeures({ heures, tauxHoraire }: { heures: HeureEnseignee[]; tauxHoraire: number | null }) {
  const total = arrondi(heures.reduce((somme, h) => somme + h.heures, 0))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Heures enseignées couvertes
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 180, overflowY: 'auto' }}>
        {heures.map((h) => (
          <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5, color: 'var(--ink-2)', padding: '5px 8px', borderRadius: 7, background: 'rgba(255,255,255,.03)' }}>
            <span>{h.debut ? new Date(h.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Date inconnue'}</span>
            <span style={{ color: 'var(--muted)' }}>{formaterHeures(h.heures)}</span>
          </div>
        ))}
      </div>
      <span style={{ fontSize: 12.5, color: 'var(--ink-2)', textAlign: 'right' }}>
        Total : <strong>{formaterHeures(total)}</strong>
        {tauxHoraire ? ` × ${tauxHoraire} Ar/h` : ''}
      </span>
    </div>
  )
}

function BlocVersements({
  versements,
  devise,
  enCours,
  onSupprimer,
}: {
  versements: Versement[] | null
  devise: string
  enCours: boolean
  onSupprimer: (id: string) => void
}) {
  if (versements === null) return <EtatChargement lignes={2} hauteur={34} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Acomptes enregistrés
      </span>
      {versements.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0 }}>Aucun acompte pour l’instant.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {versements.map((v) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,.03)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 700, minWidth: 90 }}>
                {formaterMontant(v.montant, devise)}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--muted)', flexGrow: 1, minWidth: 0 }}>
                {new Date(v.date_versement).toLocaleDateString('fr-FR')}
                {v.moyen_paiement ? ` · ${v.moyen_paiement}` : ''}
                {v.reference ? ` · ${v.reference}` : ''}
                {v.notes ? ` · ${v.notes}` : ''}
              </span>
              <button onClick={() => onSupprimer(v.id)} disabled={enCours} style={{ ...boutonDangerStyle, padding: '4px 10px' }}>
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FormulaireAcompte({
  suggestion,
  devise,
  enCours,
  estProfesseur,
  onValider,
}: {
  suggestion: number
  devise: string
  enCours: boolean
  estProfesseur: boolean
  onValider: (valeurs: { montant: number; date: string; moyen: string; reference: string; notes: string }) => void
}) {
  const [montant, setMontant] = useState(String(suggestion))
  const [date, setDate] = useState(dateDuJour)
  const [moyen, setMoyen] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  /* Le solde restant change à chaque acompte enregistré : sans cette resynchronisation, le
     champ garderait la suggestion du premier affichage et proposerait de payer deux fois. */
  useEffect(() => {
    setMontant(String(suggestion))
  }, [suggestion])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {estProfesseur ? 'Enregistrer un versement' : 'Enregistrer un acompte'}
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Champ label={`Montant (${devise})`} obligatoire aide="Pré-rempli avec le solde restant.">
          <input type="number" min={0} step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} style={champStyle} />
        </Champ>
        <Champ label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={champStyle} />
        </Champ>
        <Champ label="Moyen">
          <input value={moyen} onChange={(e) => setMoyen(e.target.value)} placeholder="Espèces, Mvola…" style={champStyle} />
        </Champ>
        <Champ label="Référence">
          <input value={reference} onChange={(e) => setReference(e.target.value)} style={champStyle} />
        </Champ>
      </div>
      <Champ label="Note (facultatif)">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} style={champStyle} />
      </Champ>
      <button
        onClick={() => onValider({ montant: Number(montant), date, moyen, reference, notes })}
        disabled={enCours || !montant || Number(montant) <= 0}
        className="btn-shine"
        style={{ ...boutonPrimaireStyle, opacity: enCours || !montant ? 0.6 : 1 }}
      >
        {enCours ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </div>
  )
}

function SuppressionPaiement({ enCours, onSupprimer }: { enCours: boolean; onSupprimer: (motif: string) => void }) {
  const [ouvert, setOuvert] = useState(false)
  const [motif, setMotif] = useState('')

  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)} disabled={enCours} style={boutonDangerStyle}>
        Supprimer ce paiement
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      <Champ label="Motif de la suppression" obligatoire aide="Conservé avec la ligne supprimée, pour justifier la correction plus tard.">
        <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Doublon, erreur de saisie…" style={champStyle} />
      </Champ>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => setOuvert(false)} style={boutonNeutreStyle}>
          Annuler
        </button>
        <button onClick={() => onSupprimer(motif.trim())} disabled={enCours || motif.trim().length === 0} style={boutonDangerStyle}>
          {enCours ? 'Suppression…' : 'Confirmer la suppression'}
        </button>
      </div>
    </div>
  )
}
