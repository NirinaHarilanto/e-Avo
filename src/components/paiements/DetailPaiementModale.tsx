import { useCallback, useEffect, useState } from 'react'
import { jetonAcces } from '../../lib/jetonAcces'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { acompteSuggere, arrondi, formaterMontant, resteAPayer, statutReglement, LABEL_TYPE_PROGRAMME } from '../../lib/paiements'
import { useEtablissement } from '../../hooks/useEtablissement'
import { formaterHeures } from '../../lib/heures'
import { nomAvecDuo } from '../../lib/duo'
import { EcheancierPaiement } from './EcheancierPaiement'
import { FactureImprimable, estRecu } from '../facturation/FactureImprimable'
import type { ActionImpression } from '../facturation/OverlayImpression'
import { jourDansFuseauEtablissement } from '../../lib/etablissement'
import type { Database } from '../../types/database.types'
import { BadgeStatutPaiement } from '../shared/BadgeStatutPaiement'
import { Modale } from '../ui/Modale'
import { Champ, champStyle, etiquetteStyle, LigneInfo } from '../ui/Champ'
import { boutonDangerStyle, boutonNeutreStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { ChampDate } from '../ui/ChampDate'
import { SelectMoyenPaiement } from './SelectMoyenPaiement'

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
      /* Plusieurs depuis 0138 : un élève peut avoir deux professeurs sur un même forfait. */
      professeurs: Profile[]
      /* Partenaire DUO de la personne concernée (0054) — demande client du 2026-09-23 : « dans
         toutes les fenêtres [...] afficher les deux noms des personnes formant le DUO ». */
      duoPartenaire?: Profile | null
    }
  | { type: 'professeur'; paiement: TeacherPayment; personne: Profile | null }
  | { type: 'forfait'; forfait: Package; personne: Profile | null; professeurs: Profile[]; duoPartenaire?: Profile | null }
  /* Forfait réglé AVANT la conversion en étudiant (0056) : la ligne est rattachée au prospect,
     `student_id` reste nul jusqu'à la conversion qui la reprend telle quelle. Rien d'autre ne
     change — acomptes, reste dû, reçu et facture sont ceux de n'importe quel paiement. */
  | {
      type: 'prospect'
      prospect: ProspectAPayer
      tarif: TarifChoisi | null
      paiement: StudentPayment | null
      /* Partenaire DUO du prospect (0058/0059) — manquait ici alors qu'il existe déjà pour
         'etudiant'/'forfait' : un binôme pas encore converti ouvrait cette fenêtre sous le seul
         nom du porteur (demande client du 2026-10-16, « il faut toujours mettre les noms des
         deux personnes formant le DUO »). */
      duoPartenaire?: ProspectAPayer | null
    }

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

/* Date du jour telle que l'admin la lit sur son calendrier, pas la date UTC : `toISOString()`
   renverrait la veille entre minuit et 3 h du matin à Antananarivo (UTC+3), et un acompte
   encaissé en soirée serait daté du jour précédent. */
/* Règle client du 2026-09-29 : le paiement en plusieurs fois (acomptes, échéancier) n'est
   accepté que pour un forfait d'au moins 40 heures. Aussi imposée en base (0078). */
export const HEURES_MIN_PAIEMENT_FRACTIONNE = 40

const dateDuJour = jourDansFuseauEtablissement()

/* Un élève peut avoir plusieurs professeurs sur un même forfait (0138) : l'intitulé suit le
   nombre réel, et les noms sont tous donnés — en afficher un seul laisserait croire que le
   forfait n'est consommé qu'avec lui. */
function libelleProfesseurs(professeurs: Profile[]): string {
  return professeurs.length > 1 ? 'Professeurs' : 'Professeur'
}

function valeurProfesseurs(professeurs: Profile[]): string {
  if (professeurs.length === 0) return 'Non attribué'
  return professeurs.map((p) => `${p.prenom} ${p.nom}`).join(', ')
}

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
  const [documents, setDocuments] = useState<Invoice[]>([])
  const [documentOuvert, setDocumentOuvert] = useState<{ facture: Invoice; action: ActionImpression } | null>(null)
  const facture = documents.find((d) => !estRecu(d)) ?? null
  const recus = documents.filter(estRecu)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const estProfesseur = cible.type === 'professeur'
  const heuresCouvertes =
    cible.type === 'etudiant' ? (cible.forfait?.total_heures ?? null)
    : cible.type === 'forfait' ? cible.forfait.total_heures
    : cible.type === 'prospect' ? (cible.tarif?.heures ?? null)
    : null
  const paiementUnique = heuresCouvertes != null && heuresCouvertes < HEURES_MIN_PAIEMENT_FRACTIONNE
  const colonneCible = estProfesseur ? 'teacher_payment_id' : 'student_payment_id'
  // Binôme DUO toujours affiché ensemble, y compris dans une fenêtre qui ne concerne
  // financièrement qu'un seul des deux (forfait partagé porté par un seul, ou heure d'essai
  // individuelle) — demande client du 2026-09-23.
  const duoPartenaire = cible.type === 'etudiant' || cible.type === 'forfait' ? (cible.duoPartenaire ?? null) : null
  /* Pour le titre uniquement : un prospect (pas encore un `Profile`) a son propre partenaire,
     de forme différente mais compatible avec `nomAvecDuo` (prénom/nom). La facture/le reçu
     imprimés, eux, n'existent jamais tant que `cible.type === 'prospect'` (aucune facture n'est
     émise avant conversion, voir generer-facture.ts) : `duoPartenaire` ci-dessus reste donc du
     bon type (`Profile | null`) pour `FactureImprimable`. */
  const nomPersonne =
    cible.type === 'prospect'
      ? nomAvecDuo(cible.prospect, cible.duoPartenaire ?? null)
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
        .order('created_at'),
    ])
    setVersements(lignes ?? [])
    setDocuments(factures ?? [])

    if (estProfesseur) {
      const { data: ecritures } = await supabase
        .from('hour_ledger')
        .select('id, heures, session_id, prestation_externe_id')
        .eq('teacher_payment_id', paiement.id)
      /* Une écriture payée peut venir d'une séance HOC ou d'une prestation externe (0131) : les
         deux portent une date, lue dans leur table respective. */
      const sessionIds = [...new Set((ecritures ?? []).map((e) => e.session_id).filter((id): id is string => id !== null))]
      const prestationIds = [
        ...new Set((ecritures ?? []).map((e) => e.prestation_externe_id).filter((id): id is string => id !== null)),
      ]
      const [{ data: seances }, { data: prestations }] = await Promise.all([
        sessionIds.length
          ? supabase.from('sessions').select('id, debut').in('id', sessionIds)
          : Promise.resolve({ data: [] as { id: string; debut: string }[] }),
        prestationIds.length
          ? supabase.from('prestations_externes').select('id, debut').in('id', prestationIds)
          : Promise.resolve({ data: [] as { id: string; debut: string }[] }),
      ])
      const debutParSeance = new Map((seances ?? []).map((s) => [s.id, s.debut]))
      const debutParPrestation = new Map((prestations ?? []).map((p) => [p.id, p.debut]))
      setHeures(
        (ecritures ?? [])
          .map((e) => ({
            id: e.id,
            heures: e.heures,
            debut: e.prestation_externe_id
              ? (debutParPrestation.get(e.prestation_externe_id) ?? null)
              : e.session_id
                ? (debutParSeance.get(e.session_id) ?? null)
                : null,
          }))
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

  async function genererFacture(type: 'facture' | 'recu' = 'facture') {
    if (!session || !paiement) return
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/generer-facture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonAcces()}` },
      body: JSON.stringify({ table: estProfesseur ? 'teacher_payments' : 'student_payments', id: paiement.id, type }),
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
                    { label: 'Forfait', valeur: `${LABEL_TYPE_PROGRAMME[cible.forfait.type_programme]} · ${cible.forfait.total_heures} h` },
                    { label: libelleProfesseurs(cible.professeurs), valeur: valeurProfesseurs(cible.professeurs) },
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
                {/* « Déjà encaissé » et non « Déjà réglé » — demande client du 2026-10-31 :
                    « pourquoi c'est marqué que la totalité est déjà réglé alors que ce n'est pas
                    le cas ? Il faut que ce soit très clair. » Ces deux lignes ne comptent QUE
                    l'argent reçu, c'est-à-dire la somme des acomptes listés juste en dessous ;
                    une échéance planifiée n'y entre jamais. Le mot « réglé » laissait croire à un
                    état du dossier, là où il s'agit d'une caisse. */}
                <LigneInfo label="Montant dû" valeur={formaterMontant(paiement.montant, paiement.devise)} />
                <LigneInfo
                  label="Déjà encaissé"
                  valeur={`${formaterMontant(paiement.montant_regle, paiement.devise)}${(versements ?? []).length > 0 ? ` · ${(versements ?? []).length} acompte${(versements ?? []).length > 1 ? 's' : ''}` : ''}`}
                />
                <LigneInfo
                  label="Reste à encaisser"
                  valeur={
                    <strong style={{ color: resteAPayer(ligne) > 0 ? 'var(--accent-gold, #e9cf94)' : 'var(--accent-teal)' }}>
                      {formaterMontant(resteAPayer(ligne), paiement.devise)}
                    </strong>
                  }
                />
                {cible.type === 'etudiant' && cible.forfait && (
                  <LigneInfo
                    label="Forfait"
                    valeur={`${LABEL_TYPE_PROGRAMME[cible.forfait.type_programme]} · ${cible.forfait.total_heures} h`}
                  />
                )}
                {cible.type === 'etudiant' && (
                  <LigneInfo label={libelleProfesseurs(cible.professeurs)} valeur={valeurProfesseurs(cible.professeurs)} />
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

              {estProfesseur && heures.length > 0 && <BlocHeures heures={heures} />}

              <BlocVersements
                versements={versements}
                devise={paiement.devise}
                enCours={enCours}
                onSupprimer={supprimerVersement}
              />

              {resteAPayer(ligne) > 0 && (
                <FormulaireAcompte
                  suggestion={paiementUnique ? resteAPayer(ligne) : acompteSuggere(ligne)}
                  devise={paiement.devise}
                  enCours={enCours}
                  estProfesseur={estProfesseur}
                  paiementUnique={paiementUnique ? heuresCouvertes : null}
                  onValider={ajouterVersement}
                />
              )}

              {/* L'échéancier ne concerne que les élèves : une rémunération de professeur se
                  règle en une fois, on ne lui planifie pas un calendrier de versements. */}
              {!estProfesseur && paiementUnique && (
                <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                  Pas d’échéancier : le paiement en plusieurs fois est réservé aux forfaits de {HEURES_MIN_PAIEMENT_FRACTIONNE} h et plus.
                </p>
              )}
              {!estProfesseur && !paiementUnique && (
                <EcheancierPaiement
                  studentPaymentId={paiement.id}
                  etablissementId={paiement.etablissement_id}
                  devise={paiement.devise}
                  resteDu={resteAPayer(ligne)}
                  relanceJours={etablissement?.relance_echeance_jours ?? 3}
                />
              )}

              <BlocDocuments
                facture={facture}
                recus={recus}
                estProfesseur={estProfesseur}
                enCours={enCours}
                /* Une facture (comme un reçu) suppose un destinataire identifié : côté élève,
                   `student_id` — vide tant qu'un prospect n'est pas converti (student_payments
                   peut être créé dès la réservation, avant toute conversion, voir 0056). Sans
                   ce garde-fou, cliquer « Générer une facture » pour un tel paiement renvoyait
                   l'erreur brute de la contrainte `invoices_destinataire_unique` (signalé par le
                   client le 2026-09-29) au lieu d'un bouton désactivé et expliqué, comme pour le
                   reçu juste en dessous. */
                facturePossible={estProfesseur || !!(paiement as StudentPayment).student_id}
                recuPossible={
                  !estProfesseur &&
                  !!(paiement as StudentPayment).student_id &&
                  Number(paiement.montant_regle) > recus.reduce((t, r) => t + Number(r.montant_ttc), 0)
                }
                onGenerer={genererFacture}
                onOuvrir={(doc, action) => setDocumentOuvert({ facture: doc, action })}
              />

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
                <SuppressionPaiement enCours={enCours} onSupprimer={supprimerPaiement} />
              </div>
            </>
          )
        )}
      </div>
      {documentOuvert && (
        <FactureImprimable
          facture={documentOuvert.facture}
          destinataire={cible.type === 'prospect' ? null : cible.personne}
          destinatairePartenaire={duoPartenaire}
          action={documentOuvert.action}
          onFermer={() => setDocumentOuvert(null)}
        />
      )}
    </Modale>
  )
}

/* Facture et reçus du paiement, chacun avec ses trois actions (demande client du 2026-09-29 :
   « activer tous les boutons liés aux factures : imprimer, télécharger, voir, générer une
   facture ou un reçu »). */
function BlocDocuments({
  facture,
  recus,
  estProfesseur,
  enCours,
  facturePossible,
  recuPossible,
  onGenerer,
  onOuvrir,
}: {
  facture: Invoice | null
  recus: Invoice[]
  estProfesseur: boolean
  enCours: boolean
  facturePossible: boolean
  recuPossible: boolean
  onGenerer: (type: 'facture' | 'recu') => void
  onOuvrir: (document: Invoice, action: ActionImpression) => void
}) {
  const petit = { ...boutonSecondaireStyle, fontSize: 11.5, padding: '5px 11px' }
  const ligneDocument = (doc: Invoice) => (
    <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '7px 10px', borderRadius: 8, background: 'var(--voile-doux, rgba(255,255,255,.03))' }}>
      <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 700, flexGrow: 1, minWidth: 0 }}>
        {estRecu(doc) ? 'Reçu' : 'Facture'} {doc.numero}
        <span style={{ fontWeight: 400, color: 'var(--muted)' }}> · {formaterMontant(doc.montant_ttc)}</span>
      </span>
      <button onClick={() => onOuvrir(doc, 'voir')} style={petit}>
        Voir
      </button>
      <button onClick={() => onOuvrir(doc, 'imprimer')} style={petit}>
        Imprimer
      </button>
      <button onClick={() => onOuvrir(doc, 'telecharger')} style={petit}>
        Télécharger
      </button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
      <span style={etiquetteStyle}>{estProfesseur ? 'Facture' : 'Facture et reçus'}</span>
      {facture && ligneDocument(facture)}
      {recus.map(ligneDocument)}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {!facture && (
          <button
            onClick={() => onGenerer('facture')}
            disabled={enCours || !facturePossible}
            style={{ ...boutonSecondaireStyle, opacity: facturePossible ? 1 : 0.55 }}
          >
            {estProfesseur ? 'Générer la facture de rémunération' : 'Générer une facture'}
          </button>
        )}
        {!estProfesseur && (
          <button onClick={() => onGenerer('recu')} disabled={enCours || !recuPossible} style={{ ...boutonSecondaireStyle, opacity: recuPossible ? 1 : 0.55 }}>
            Générer un reçu
          </button>
        )}
      </div>
      {!facture && !facturePossible && (
        <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>
          La facture sera disponible une fois le prospect converti en étudiant.
        </span>
      )}
      {!estProfesseur && !recuPossible && (
        <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>
          Un reçu couvre ce qui a été encaissé depuis le dernier reçu : enregistrez d’abord un paiement.
        </span>
      )}
    </div>
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
          <ChampDate type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} style={champStyle} />
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

/* Pas de « × taux horaire » ici depuis 0126 : un paiement peut couvrir des séances individuelles,
   duo et collectives mélangées, chacune à son propre taux — un seul multiplicateur affiché
   induirait en erreur. Le montant total du règlement reste affiché ailleurs dans cette fenêtre
   (ligne.montant), calculé séance par séance au moment du paiement. */
function BlocHeures({ heures }: { heures: HeureEnseignee[] }) {
  const total = arrondi(heures.reduce((somme, h) => somme + h.heures, 0))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={etiquetteStyle}>Heures enseignées couvertes</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 180, overflowY: 'auto' }}>
        {heures.map((h) => (
          <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5, color: 'var(--ink-2)', padding: '5px 8px', borderRadius: 7, background: 'var(--voile-doux, rgba(255,255,255,.03))' }}>
            <span>{h.debut ? new Date(h.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Date inconnue'}</span>
            <span style={{ color: 'var(--muted)' }}>{formaterHeures(h.heures)}</span>
          </div>
        ))}
      </div>
      <span style={{ fontSize: 12.5, color: 'var(--ink-2)', textAlign: 'right' }}>
        Total : <strong>{formaterHeures(total)}</strong>
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
      <span style={etiquetteStyle}>Acomptes enregistrés</span>
      {versements.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0 }}>Aucun acompte pour l’instant.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {versements.map((v) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 10px', borderRadius: 8, background: 'var(--voile-doux, rgba(255,255,255,.03))' }}>
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
  paiementUnique,
  onValider,
}: {
  suggestion: number
  devise: string
  enCours: boolean
  estProfesseur: boolean
  /* Nombre d'heures du forfait quand il est sous le seuil du paiement fractionné : le montant est
     alors figé sur le solde, à régler en une fois. `null` sinon. */
  paiementUnique: number | null
  onValider: (valeurs: { montant: number; date: string; moyen: string; reference: string; notes: string }) => void
}) {
  const [montant, setMontant] = useState(String(suggestion))
  const [date, setDate] = useState(dateDuJour)
  const [moyen, setMoyen] = useState('')
  const [moyenValide, setMoyenValide] = useState(true)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  /* Le solde restant change à chaque acompte enregistré : sans cette resynchronisation, le
     champ garderait la suggestion du premier affichage et proposerait de payer deux fois.

     Les AUTRES champs sont remis à blanc en même temps (2026-10-31) : seul le montant se
     resynchronisait, si bien qu'un second acompte héritait en silence du moyen, de la référence
     et de la note du premier. Constaté en production sur une ligne de 1 100 000 Ar — deux
     versements de 500 000 et 600 000 Ar enregistrés à trente secondes d'intervalle, tous deux
     estampillés « Virement · AZ3424 », alors qu'ils ne peuvent pas venir du même virement. Une
     référence fausse sur un encaissement rend le rapprochement bancaire impossible. */
  useEffect(() => {
    setMontant(String(suggestion))
    setMoyen('')
    setReference('')
    setNotes('')
  }, [suggestion])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
      <span style={etiquetteStyle}>
        {estProfesseur ? 'Enregistrer un versement' : paiementUnique != null ? 'Enregistrer le règlement' : 'Enregistrer un acompte'}
      </span>
      {!estProfesseur && (
        <>
          <span style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
            {paiementUnique != null
              ? `Forfait de ${paiementUnique} h : il se règle en une seule fois. Le paiement en plusieurs fois est réservé aux forfaits de ${HEURES_MIN_PAIEMENT_FRACTIONNE} h et plus.`
              : `Forfait de ${HEURES_MIN_PAIEMENT_FRACTIONNE} h ou plus : le paiement en plusieurs fois (acomptes) est possible.`}
          </span>
          {/* La distinction qui manquait — demande client du 2026-10-31. Relevé en base : une
              échéance planifiée à 16:19:02, puis un acompte du même montant enregistré à
              16:19:08. Six secondes : le formulaire ci-dessous était resté pré-rempli avec le
              solde entier sous un bouton « Enregistrer » qui ne disait pas ce qu'il
              enregistrait, juste au-dessus de l'échéancier qu'on venait de remplir. */}
          <span
            style={{
              fontSize: 11.5,
              lineHeight: 1.55,
              color: 'var(--ink-2)',
              padding: '8px 10px',
              borderRadius: 9,
              border: '1px dashed var(--border)',
              background: 'var(--surface-alt)',
            }}
          >
            Un acompte constate de l’argent <strong>déjà reçu</strong> : il augmente le « déjà encaissé » ci-dessus.
            Pour annoncer un règlement <strong>à venir</strong>, ne remplissez pas ce formulaire — planifiez une
            échéance dans l’échéancier.
          </span>
        </>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <Champ label={`Montant (${devise})`} obligatoire aide={paiementUnique != null ? 'Solde complet, non modifiable.' : 'Pré-rempli avec le solde restant.'}>
          <input
            type="number"
            min={0}
            step="0.01"
            value={montant}
            readOnly={paiementUnique != null}
            onChange={(e) => setMontant(e.target.value)}
            style={{ ...champStyle, ...(paiementUnique != null ? { opacity: 0.7, cursor: 'not-allowed' } : {}) }}
          />
        </Champ>
        <Champ label="Date">
          <ChampDate type="date" value={date} onChange={(e) => setDate(e.target.value)} style={champStyle} />
        </Champ>
        <Champ label="Moyen">
          <SelectMoyenPaiement valeur={moyen} onChange={(v, valide) => { setMoyen(v); setMoyenValide(valide) }} />
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
        disabled={enCours || !montant || Number(montant) <= 0 || !moyenValide}
        className="btn-shine"
        style={{ ...boutonPrimaireStyle, opacity: enCours || !montant || !moyenValide ? 0.6 : 1 }}
      >
        {/* « Enregistrer l'acompte », demandé explicitement le 2026-10-31 — remplace le montant
            dynamique (« Encaisser 300 000,00 Ar ») que ce bouton portait depuis le correctif de
            la veille sur « Déjà encaissé/réglé » : plus simple à lire d'un coup d'œil, et le
            montant exact reste visible juste au-dessus dans le champ qu'on vient de remplir. */}
        {enCours ? 'Enregistrement…' : estProfesseur ? 'Enregistrer le versement' : 'Enregistrer l’acompte'}
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
