import { useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { usePaiementsEtudiants, type ForfaitAPayer, type PaiementEtudiant } from '../../hooks/usePaiementsEtudiants'
import { useRemunerationsProfesseurs, type RemunerationProfesseur } from '../../hooks/useRemunerationsProfesseurs'
import { CreerPaiementEtudiant } from '../paiements/CreerPaiementEtudiant'
import { CreerRemunerationProfesseur } from '../paiements/CreerRemunerationProfesseur'
import { DetailPaiementModale, type CiblePaiement } from '../paiements/DetailPaiementModale'
import { BadgeStatutPaiement } from '../shared/BadgeStatutPaiement'
import { formaterMontant, resteAPayer, statutReglement, LABELS_REGLEMENT, type LignePayable, type StatutReglement } from '../../lib/paiements'
import { nomAvecDuo } from '../../lib/duo'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { Onglets } from '../ui/Onglets'
import { ChampRecherche } from '../ui/BarreOutils'
import { Champ, champStyle } from '../ui/Champ'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle, boutonNeutreStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

type Onglet = 'etudiants' | 'professeurs'
type FiltreStatut = StatutReglement | 'tous'

/* Filtres (demande client du 2026-09-22) : statut de règlement, nom de la personne, et
   fourchette de montant. Appliqués aux deux onglets avec le même état — changer d'onglet garde
   les filtres actifs, ce qui est ce qu'on attend en pratique (« montre-moi tout ce qui est en
   retard », par exemple, des deux côtés). */
interface Filtres {
  recherche: string
  statut: FiltreStatut
  montantMin: string
  montantMax: string
}

function correspond(nomPersonne: string, montant: number, ligne: LignePayable, filtres: Filtres): boolean {
  if (filtres.recherche.trim() && !nomPersonne.toLowerCase().includes(filtres.recherche.trim().toLowerCase())) return false
  if (filtres.statut !== 'tous' && statutReglement(ligne) !== filtres.statut) return false
  if (filtres.montantMin && montant < Number(filtres.montantMin)) return false
  if (filtres.montantMax && montant > Number(filtres.montantMax)) return false
  return true
}

/* Totaux dérivés des lignes déjà chargées par les hooks. Les lignes annulées sont exclues, et
   l'encaissé se lit du cumul des acomptes (`montant_regle`) plutôt que du montant total des
   lignes marquées payées : depuis la migration 0049, une ligne peut être réglée à moitié. */
function totaux(lignes: LignePayable[]) {
  const actives = lignes.filter((l) => statutReglement(l) !== 'annule')
  return {
    encaisse: actives.reduce((total, l) => total + l.montant_regle, 0),
    reste: actives.reduce((total, l) => total + resteAPayer(l), 0),
    enRetard: actives.filter((l) => statutReglement(l) === 'en_retard').reduce((total, l) => total + resteAPayer(l), 0),
  }
}

export function PaiementsAdmin() {
  const { profile } = useProfileContext()
  const [onglet, setOnglet] = useState<Onglet>('etudiants')
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [detail, setDetail] = useState<CiblePaiement | null>(null)
  const [filtres, setFiltres] = useState<Filtres>({ recherche: '', statut: 'tous', montantMin: '', montantMax: '' })
  const filtresActifs = !!filtres.recherche || filtres.statut !== 'tous' || !!filtres.montantMin || !!filtres.montantMax

  const paiementsEtudiants = usePaiementsEtudiants()
  const remunerationsProfs = useRemunerationsProfesseurs()

  /* Un forfait souscrit sans ligne de paiement compte comme entièrement dû : c'est justement
     ce que la demande client veut rendre visible. */
  const lignesEtudiants: LignePayable[] = [
    ...paiementsEtudiants.paiements.map((p) => p.paiement),
    ...paiementsEtudiants.forfaitsAPayer.map((f) => ({ montant: f.forfait.montant ?? 0, montant_regle: 0, statut: 'attendu' as const })),
  ]
  const lignesProfesseurs: LignePayable[] = remunerationsProfs.remunerations.map((r) => r.paiement)

  const totauxEtudiants = totaux(lignesEtudiants)
  const totauxProfesseurs = totaux(lignesProfesseurs)

  function rechargerTout() {
    paiementsEtudiants.recharger()
    remunerationsProfs.recharger()
  }

  return (
    <AdminLayout actif="Paiements">
      <EnTetePage
        titre="Paiements"
        description="Le suivi financier de l’établissement dans les deux sens : ce que les étudiants règlent, et ce que vous versez aux professeurs. La saisie est manuelle, aucun prélèvement n’est automatisé."
        actions={
          <button onClick={() => setFormulaireOuvert((v) => !v)} className="btn-shine" style={boutonPrimaireStyle}>
            <Icone nom="plus" taille={15} />
            {formulaireOuvert ? 'Fermer' : onglet === 'etudiants' ? 'Enregistrer un paiement' : 'Enregistrer une rémunération'}
          </button>
        }
      />

      <GuidePage
        id="admin-paiements"
        etapes={[
          <>
            Choisissez l’onglet <strong>Étudiants</strong> pour suivre les encaissements, ou <strong>Professeurs</strong>{' '}
            pour les rémunérations à verser.
          </>,
          <>
            Tout élève ayant un <strong>forfait et un professeur</strong> apparaît automatiquement dans la liste, avec le
            tag « À payer », même si aucune ligne de paiement n’a encore été créée.
          </>,
          <>
            <strong>Cliquez sur une ligne</strong> pour ouvrir son détail : montant dû, acomptes déjà encaissés, reste à
            payer. Vous y enregistrez un acompte (le solde restant est pré-rempli) et le statut suit tout seul : à payer,
            payé partiellement, puis payé.
          </>,
          <>
            Depuis ce même détail, <strong>générez la facture</strong> correspondante, ou supprimez la ligne en indiquant
            un motif — la trace de la suppression est conservée.
          </>,
        ]}
      />

      <div style={{ marginBottom: 18 }}>
        <Onglets
          etiquette="Type de mouvement financier"
          actif={onglet}
          onChange={(valeur) => {
            setOnglet(valeur)
            setFormulaireOuvert(false)
          }}
          onglets={[
            { value: 'etudiants', label: 'Étudiants', compteur: lignesEtudiants.length },
            { value: 'professeurs', label: 'Professeurs', compteur: lignesProfesseurs.length },
          ]}
        />
      </div>

      {onglet === 'etudiants' && !paiementsEtudiants.loading && lignesEtudiants.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <GrilleStats min={180}>
            <Stat libelle="Encaissé" valeur={totauxEtudiants.encaisse.toFixed(2)} unite="Ar" ton="teal" aide="Acomptes et soldes reçus" />
            <Stat libelle="Reste à encaisser" valeur={totauxEtudiants.reste.toFixed(2)} unite="Ar" ton="or" />
            <Stat
              libelle="En retard"
              valeur={totauxEtudiants.enRetard.toFixed(2)}
              unite="Ar"
              ton={totauxEtudiants.enRetard > 0 ? 'alerte' : 'neutre'}
              aide="À relancer en priorité"
            />
            <Stat libelle="Lignes suivies" valeur={lignesEtudiants.length} ton="neutre" />
          </GrilleStats>
        </div>
      )}

      {onglet === 'professeurs' && !remunerationsProfs.loading && lignesProfesseurs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <GrilleStats min={180}>
            <Stat libelle="Versé" valeur={totauxProfesseurs.encaisse.toFixed(2)} unite="Ar" ton="teal" />
            <Stat libelle="Reste à verser" valeur={totauxProfesseurs.reste.toFixed(2)} unite="Ar" ton="or" />
            <Stat
              libelle="En retard"
              valeur={totauxProfesseurs.enRetard.toFixed(2)}
              unite="Ar"
              ton={totauxProfesseurs.enRetard > 0 ? 'alerte' : 'neutre'}
            />
            <Stat libelle="Lignes suivies" valeur={lignesProfesseurs.length} ton="neutre" />
          </GrilleStats>
        </div>
      )}

      {formulaireOuvert && profile && onglet === 'etudiants' && (
        <CreerPaiementEtudiant
          etablissementId={profile.etablissement_id}
          onAnnuler={() => setFormulaireOuvert(false)}
          onCree={() => {
            setFormulaireOuvert(false)
            paiementsEtudiants.recharger()
          }}
        />
      )}
      {formulaireOuvert && profile && onglet === 'professeurs' && (
        <CreerRemunerationProfesseur
          etablissementId={profile.etablissement_id}
          onAnnuler={() => setFormulaireOuvert(false)}
          onCree={() => {
            setFormulaireOuvert(false)
            remunerationsProfs.recharger()
          }}
        />
      )}

      <BarreFiltres filtres={filtres} onChange={setFiltres} placeholderNom={onglet === 'etudiants' ? 'Rechercher un étudiant…' : 'Rechercher un professeur…'} />

      {onglet === 'etudiants' ? (
        <ListePaiementsEtudiants
          paiements={paiementsEtudiants.paiements.filter((p) => correspond(p.etudiant ? nomAvecDuo(p.etudiant, p.duoPartenaire) : '', p.paiement.montant, p.paiement, filtres))}
          forfaitsAPayer={paiementsEtudiants.forfaitsAPayer.filter((f) =>
            correspond(f.etudiant ? nomAvecDuo(f.etudiant, f.duoPartenaire) : '', f.forfait.montant ?? 0, { montant: f.forfait.montant ?? 0, montant_regle: 0, statut: 'attendu' }, filtres),
          )}
          loading={paiementsEtudiants.loading}
          erreur={paiementsEtudiants.erreur}
          onOuvrir={setDetail}
          filtresActifs={filtresActifs}
        />
      ) : (
        <ListeRemunerationsProfesseurs
          remunerations={remunerationsProfs.remunerations.filter((r) =>
            correspond(r.professeur ? `${r.professeur.prenom} ${r.professeur.nom}` : '', r.paiement.montant, r.paiement, filtres),
          )}
          loading={remunerationsProfs.loading}
          erreur={remunerationsProfs.erreur}
          onOuvrir={setDetail}
          filtresActifs={filtresActifs}
        />
      )}

      {detail && <DetailPaiementModale cible={detail} onFermer={() => setDetail(null)} onChange={rechargerTout} />}
    </AdminLayout>
  )
}

function BarreFiltres({
  filtres,
  onChange,
  placeholderNom,
}: {
  filtres: Filtres
  onChange: (f: Filtres) => void
  placeholderNom: string
}) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
      <div style={{ minWidth: 200 }}>
        <ChampRecherche
          valeur={filtres.recherche}
          onChange={(v) => onChange({ ...filtres, recherche: v })}
          placeholder={placeholderNom}
          etiquette="Rechercher par nom"
        />
      </div>
      <Champ label="Statut">
        <select value={filtres.statut} onChange={(e) => onChange({ ...filtres, statut: e.target.value as FiltreStatut })} style={{ ...champStyle, minWidth: 150 }}>
          <option value="tous">Tous les statuts</option>
          {(Object.keys(LABELS_REGLEMENT) as StatutReglement[]).map((s) => (
            <option key={s} value={s}>
              {LABELS_REGLEMENT[s]}
            </option>
          ))}
        </select>
      </Champ>
      <Champ label="Montant min (Ar)">
        <input type="number" min={0} value={filtres.montantMin} onChange={(e) => onChange({ ...filtres, montantMin: e.target.value })} style={{ ...champStyle, width: 130 }} />
      </Champ>
      <Champ label="Montant max (Ar)">
        <input type="number" min={0} value={filtres.montantMax} onChange={(e) => onChange({ ...filtres, montantMax: e.target.value })} style={{ ...champStyle, width: 130 }} />
      </Champ>
      {(filtres.recherche || filtres.statut !== 'tous' || filtres.montantMin || filtres.montantMax) && (
        <button onClick={() => onChange({ recherche: '', statut: 'tous', montantMin: '', montantMax: '' })} style={boutonNeutreStyle}>
          Réinitialiser
        </button>
      )}
    </div>
  )
}

const LABEL_PROGRAMME: Record<'individuel' | 'duo' | 'collectif', string> = {
  individuel: 'Individuel',
  duo: 'Duo',
  collectif: 'Collectif',
}

function ListePaiementsEtudiants({
  paiements,
  forfaitsAPayer,
  loading,
  erreur,
  onOuvrir,
  filtresActifs,
}: {
  paiements: PaiementEtudiant[]
  forfaitsAPayer: ForfaitAPayer[]
  loading: boolean
  erreur: string | null
  onOuvrir: (cible: CiblePaiement) => void
  filtresActifs: boolean
}) {
  if (loading) return <EtatChargement lignes={4} hauteur={70} />
  if (erreur) return <MessageErreur>{erreur}</MessageErreur>
  if (paiements.length === 0 && forfaitsAPayer.length === 0) {
    return filtresActifs ? (
      <EtatVide icone="recherche" titre="Aucun résultat" description="Aucune ligne ne correspond à ces filtres." />
    ) : (
      <EtatVide
        icone="paiements"
        titre="Aucun paiement à suivre"
        description="Dès qu’un élève a un forfait et un professeur attribué, il apparaît ici avec le tag « À payer ». Vous pouvez aussi créer une ligne à la main avec « Enregistrer un paiement »."
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Les forfaits pas encore facturés passent en tête : ce sont les seuls sur lesquels rien
          n'a encore été fait, donc ceux qui appellent une action. */}
      {forfaitsAPayer.map(({ forfait, etudiant, professeur, duoPartenaire }) => (
        <LigneFinanciere
          key={`forfait-${forfait.id}`}
          nomPersonne={etudiant ? nomAvecDuo(etudiant, duoPartenaire) : 'Étudiant inconnu'}
          sousTitre={[
            `Forfait ${LABEL_PROGRAMME[forfait.type_programme]} · ${forfait.total_heures} h`,
            professeur ? `prof. ${professeur.prenom} ${professeur.nom}` : null,
            'aucun paiement enregistré',
          ]
            .filter(Boolean)
            .join(' · ')}
          montant={forfait.montant ?? 0}
          montantRegle={0}
          statutBase="attendu"
          devise="Ar"
          dateEcheance={forfait.echeance}
          onOuvrir={() => onOuvrir({ type: 'forfait', forfait, personne: etudiant, professeur, duoPartenaire })}
        />
      ))}

      {paiements.map(({ paiement, etudiant, forfait, professeur, duoPartenaire }) => (
        <LigneFinanciere
          key={paiement.id}
          nomPersonne={etudiant ? nomAvecDuo(etudiant, duoPartenaire) : 'Étudiant inconnu'}
          sousTitre={
            [
              forfait ? `Forfait ${LABEL_PROGRAMME[forfait.type_programme]} · ${forfait.total_heures} h` : null,
              paiement.moyen_paiement,
              paiement.reference,
            ]
              .filter(Boolean)
              .join(' · ') || undefined
          }
          montant={paiement.montant}
          montantRegle={paiement.montant_regle}
          statutBase={paiement.statut}
          devise={paiement.devise}
          dateEcheance={paiement.date_echeance}
          onOuvrir={() => onOuvrir({ type: 'etudiant', paiement, personne: etudiant, forfait, professeur, duoPartenaire })}
        />
      ))}
    </div>
  )
}

function ListeRemunerationsProfesseurs({
  remunerations,
  loading,
  erreur,
  onOuvrir,
  filtresActifs,
}: {
  remunerations: RemunerationProfesseur[]
  loading: boolean
  erreur: string | null
  onOuvrir: (cible: CiblePaiement) => void
  filtresActifs: boolean
}) {
  if (loading) return <EtatChargement lignes={4} hauteur={70} />
  if (erreur) return <MessageErreur>{erreur}</MessageErreur>
  if (remunerations.length === 0) {
    return filtresActifs ? (
      <EtatVide icone="recherche" titre="Aucun résultat" description="Aucune ligne ne correspond à ces filtres." />
    ) : (
      <EtatVide
        icone="paiements"
        titre="Aucune rémunération enregistrée"
        description="Utilisez « Enregistrer une rémunération » pour créer un versement. Si le professeur a un taux horaire renseigné dans sa fiche, le montant vous sera proposé automatiquement à partir de ses heures non payées."
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {remunerations.map(({ paiement, professeur }) => (
        <LigneFinanciere
          key={paiement.id}
          nomPersonne={professeur ? `${professeur.prenom} ${professeur.nom}` : 'Professeur inconnu'}
          sousTitre={
            paiement.periode_debut
              ? `${new Date(paiement.periode_debut).toLocaleDateString('fr-FR')}${paiement.periode_fin ? ` → ${new Date(paiement.periode_fin).toLocaleDateString('fr-FR')}` : ''}`
              : paiement.mode_remuneration === 'horaire'
                ? 'Heures enseignées'
                : paiement.reference || undefined
          }
          montant={paiement.montant}
          montantRegle={paiement.montant_regle}
          statutBase={paiement.statut}
          devise={paiement.devise}
          dateEcheance={paiement.date_echeance}
          onOuvrir={() => onOuvrir({ type: 'professeur', paiement, personne: professeur })}
        />
      ))}
    </div>
  )
}

function LigneFinanciere({
  nomPersonne,
  sousTitre,
  montant,
  montantRegle,
  statutBase,
  devise,
  dateEcheance,
  onOuvrir,
}: {
  nomPersonne: string
  sousTitre?: string
  montant: number
  montantRegle: number
  statutBase: LignePayable['statut']
  devise: string
  dateEcheance: string | null
  onOuvrir: () => void
}) {
  const ligne: LignePayable = { montant, montant_regle: montantRegle, statut: statutBase }
  const statut = statutReglement(ligne)
  const reste = resteAPayer(ligne)

  return (
    <button
      type="button"
      onClick={onOuvrir}
      className="card card-lift"
      style={{
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ flexGrow: 1, minWidth: 180 }}>
        <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)' }}>
          {nomPersonne}
        </span>
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          {sousTitre}
          {dateEcheance && `${sousTitre ? ' · ' : ''}échéance ${new Date(dateEcheance).toLocaleDateString('fr-FR')}`}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
        <span className="brand-font" style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>
          {formaterMontant(montant, devise)}
        </span>
        {statut === 'partiel' && (
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>reste {formaterMontant(reste, devise)}</span>
        )}
      </div>
      <BadgeStatutPaiement statut={statut} />
      <Icone nom="chevron" taille={15} />
    </button>
  )
}
