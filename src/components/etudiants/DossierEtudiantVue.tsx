import { useState, type ReactNode } from 'react'
import type { DossierEtudiant, PeriodeProfesseur, SeanceDuParcours } from '../../hooks/useDossierEtudiant'
import { useNiveauxEtudiant } from '../../hooks/useNiveauxEtudiant'
import { getJoinUrl } from '../../lib/visio'
import { estRempli } from '../../lib/diagnostic'
import {
  libelleActiviteEtudiant,
  libelleStatutProfil,
  tonActiviteEtudiant,
  tonStatutProfil,
  type ActiviteEtudiant,
} from '../../lib/statutProfil'
import {
  formaterHeures,
  formaterMinutes,
  totalHeuresCumulees as calculerTotalHeuresCumulees,
  heuresRestantes as calculerHeuresRestantes,
} from '../../lib/heures'
import { RecapitulatifDiagnostic } from '../prospects/FormulaireDiagnosticCall'
import type { Database } from '../../types/database.types'
import { LABEL_NIVEAU_CLASSE, LABEL_CRENEAU_CLASSE } from '../../lib/classesCollectif'
import { LABEL_TYPE_PROGRAMME } from '../../lib/paiements'
import { niveauDefinitif } from '../../lib/niveauEtudiant'
import { seancePasseeNonCloturee } from '../../lib/seances'
import { GrilleStats, Stat } from '../ui/Stat'
import { Section } from '../ui/Section'
import { EtatVide } from '../ui/EtatVide'
import { LigneInfo } from '../ui/Champ'
import { Icone } from '../ui/Icones'
import { Onglets, type Onglet } from '../ui/Onglets'
import { ListeRepliable, TexteRepliable } from '../ui/Repliable'
import { HistoriqueNiveauModale } from './HistoriqueNiveauModale'
import { EditerSeancePlanifieeModale } from '../shared/EditerSeancePlanifieeModale'
import { DetailSeanceModale } from '../shared/DetailSeanceModale'

type Profile = Database['public']['Tables']['profiles']['Row']

export function initiales(profile: Pick<Profile, 'nom' | 'prenom'>) {
  return `${(profile.prenom?.[0] ?? '').toUpperCase()}${(profile.nom?.[0] ?? '').toUpperCase()}`
}

const boutonPanneauStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: 'var(--accent-blue)',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '6px 12px',
  cursor: 'pointer',
}

/* Fusionne l'ancien résumé compact (une ligne dans le parcours) et l'ancienne carte « Appel
   diagnostic » détaillée (rythme convenu, notes) : un seul affichage, dans l'onglet Parcours
   pédagogique, plutôt que la même information répétée à deux endroits du dossier. */
function BlocDiagnostic({ diagnostic, tarifChoisi }: { diagnostic: NonNullable<DossierEtudiant['diagnostic']>; tarifChoisi?: DossierEtudiant['tarifChoisi'] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--voile-doux, rgba(255,255,255,.03))', padding: '15px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink-2)', flexGrow: 1 }}>
          Appel diagnostic réalisé{diagnostic.niveau_evalue ? ` · niveau initial ${diagnostic.niveau_evalue}` : ''}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>{new Date(diagnostic.date_appel).toLocaleDateString('fr-FR')}</span>
      </div>
      {diagnostic.rythme_convenu && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Rythme convenu : {diagnostic.rythme_convenu}</span>}
      {/* Programme collectif uniquement (0054) : pour individuel/duo, ce choix a déjà donné lieu
          à un vrai forfait facturable (onglet Programme) — ici, la vague ne portant pas de
          montant, c'est le seul endroit du dossier où ce choix reste visible. */}
      {tarifChoisi && (
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Forfait choisi à l'inscription (indicatif, à reporter sur les paiements manuels) : {tarifChoisi.titre} ·{' '}
          {tarifChoisi.prix.toLocaleString('fr-FR')} Ar{tarifChoisi.unite}
        </span>
      )}
      {diagnostic.notes && (
        <div style={{ background: 'var(--fond-champ, rgba(0,0,0,.22))', borderRadius: 12, padding: '11px 13px' }}>
          <TexteRepliable
            texte={`« ${diagnostic.notes} »`}
            style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--muted)', whiteSpace: 'pre-wrap' }}
          />
        </div>
      )}
      {/* Réponses à la trame remplie pendant l'appel (0050) : elles suivent le prospect dans son
          dossier d'élève, ce qui est précisément ce que la demande client appelle « enregistrer
          les résultats dans les informations des étudiants ». */}
      {estRempli(diagnostic.reponses ?? {}) && (
        <div style={{ background: 'var(--fond-champ, rgba(0,0,0,.22))', borderRadius: 12, padding: '13px 15px' }}>
          <RecapitulatifDiagnostic reponses={diagnostic.reponses} />
        </div>
      )}
    </div>
  )
}

/* Variante DUO de BlocDiagnostic (0065, demande client du 2026-09-23) : « pour les informations
   qui diffèrent entre les deux personnes [profil, objectifs, niveau]... afficher les
   informations des deux personnes formant le DUO ». Chaque membre a désormais son propre
   diagnostic_calls (trame à deux vitesses, 0060) — les deux s'affichent l'un sous l'autre,
   nommés, plutôt qu'un seul comme avant cette séparation. Retombe sur l'affichage simple si
   l'étudiant n'est pas en duo. */
function BlocDiagnosticDuo({
  diagnostic,
  diagnosticPartenaire,
  etudiant,
  duoPartenaire,
  tarifChoisi,
}: {
  diagnostic: DossierEtudiant['diagnostic']
  diagnosticPartenaire: DossierEtudiant['diagnosticPartenaire']
  etudiant: Profile
  duoPartenaire: Profile | null
  tarifChoisi?: DossierEtudiant['tarifChoisi']
}) {
  if (!duoPartenaire) {
    return diagnostic ? <BlocDiagnostic diagnostic={diagnostic} tarifChoisi={tarifChoisi} /> : null
  }
  if (!diagnostic && !diagnosticPartenaire) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {diagnostic && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>
            {etudiant.prenom} {etudiant.nom}
          </span>
          <BlocDiagnostic diagnostic={diagnostic} tarifChoisi={tarifChoisi} />
        </div>
      )}
      {diagnosticPartenaire && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>
            {duoPartenaire.prenom} {duoPartenaire.nom}
          </span>
          <BlocDiagnostic diagnostic={diagnosticPartenaire} />
        </div>
      )}
    </div>
  )
}

/* Historique des forfaits successifs — demande client du 2026-09-21 : « un étudiant peut prendre
   plusieurs forfaits au cours de son apprentissage ». `packages` est déjà trié du plus récent au
   plus ancien par useDossierEtudiant, et sa première ligne est le forfait courant détaillé
   juste au-dessus : on ne répète donc que les précédents. Rien ne s'affiche pour un élève qui
   n'en a souscrit qu'un seul. */
function HistoriqueForfaits({ packages }: { packages: DossierEtudiant['packages'] }) {
  const precedents = packages.slice(1)
  if (precedents.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Forfaits précédents · {precedents.length}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 12, border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
        <ListeRepliable visibles={3} nom="forfaits précédents">
          {precedents.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                padding: '9px 13px',
                borderBottom: '1px solid var(--border-soft)',
              }}
            >
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flexGrow: 1 }}>
                {LABEL_TYPE_PROGRAMME[p.type_programme]} · {formaterHeures(p.total_heures)}
                {p.essai && (
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)', background: 'rgba(233,207,148,.14)', border: '1px solid rgba(233,207,148,.32)', borderRadius: 999, padding: '2px 7px' }}>
                    {/* 'prolonge' (0115) : tranche close par une prolongation, la suivante a pris
                        le relais — à distinguer d'un essai encore en attente de décision. */}
                    Essai{' '}
                    {p.essai_resultat === 'poursuivi'
                      ? '· poursuivi'
                      : p.essai_resultat === 'arrete'
                        ? '· arrêté'
                        : p.essai_resultat === 'prolonge'
                          ? '· prolongé'
                          : ''}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                {p.montant !== null ? `${p.montant.toLocaleString('fr-FR')} Ar` : '—'}
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>
                souscrit le {new Date(p.created_at).toLocaleDateString('fr-FR')}
              </span>
            </div>
          ))}
        </ListeRepliable>
      </div>
    </div>
  )
}

function EtapeAvancement({ fait, label }: { fait: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: fait ? '#1a0f38' : 'var(--muted-2)',
          background: fait ? 'var(--accent-teal)' : 'transparent',
          border: fait ? 'none' : '1px dashed var(--muted-2)',
        }}
      >
        {fait && <Icone nom="valide" taille={11} />}
      </span>
      <span style={{ fontSize: 12, color: fait ? 'var(--ink-2)' : 'var(--muted)' }}>{label}</span>
    </div>
  )
}

function StatutSeance({
  enrollment,
  statutSession,
  seance,
}: {
  enrollment: { present: boolean | null }
  statutSession: string
  /* Horaire de la séance : une séance encore « planifiée » dont l'heure est passée attend sa
     clôture, elle n'est plus à venir. Sans cette distinction, le parcours affichait « Planifiée »
     pour une séance d'hier pendant que l'en-tête du même dossier alertait « Aucun cours
     planifié » — contradiction signalée par le client le 2026-10-19, capture à l'appui. */
  seance?: { debut: string; duree_minutes: number }
}) {
  if (seance && seancePasseeNonCloturee({ statut: statutSession, ...seance })) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning, #e0a94d)' }}>À clôturer</span>
  }
  if (statutSession === 'planifiee') {
    return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-cyan)' }}>Planifiée</span>
  }
  if (statutSession === 'annulee') {
    return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>Annulée</span>
  }
  // 0085 : absence à la clôture, séance reportée — ni l'élève ni le professeur ne sont
  // impactés. À distinguer d'« Absent(e) » (ci-dessous) : celui-ci vaudrait pour une séance
  // COMPTÉE malgré l'absence (choix « Comptabiliser »), qui reste bien « terminée ».
  if (statutSession === 'reportee') {
    return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning, #e0a94d)' }}>Reportée</span>
  }
  if (enrollment.present === true) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-teal)' }}>Présent(e)</span>
  }
  if (enrollment.present === false) {
    return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>Absent(e)</span>
  }
  return <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>—</span>
}

/* Bloc d'identité du professeur d'une période, repris par la carte latérale et l'en-tête de
   période — il était jusqu'ici recopié trois fois à l'identique dans ce fichier. */
function IdentiteProfesseur({ periode, taille = 46 }: { periode: PeriodeProfesseur; taille?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
      <span
        style={{
          width: taille,
          height: taille,
          borderRadius: taille / 3,
          background: 'var(--accent-blue-gradient)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 14,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {periode.professeur ? initiales(periode.professeur) : '?'}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span className="brand-font" style={{ fontSize: 15, color: 'var(--ink)' }}>
          {periode.professeur ? `${periode.professeur.prenom} ${periode.professeur.nom}` : 'Professeur supprimé'}
          {periode.professeur?.status === 'suspended' && <BadgeProfesseurSupprime />}
        </span>
      </div>
    </div>
  )
}

/* Un professeur dont le nom est restauré dans ce parcours (demande client du 2026-10-10, voir
   useDossierEtudiant.ts) n'en reste pas moins un compte supprimé : ce badge le rappelle, pour que
   le nom retrouvé se lise comme une TRACE historique, jamais comme un professeur qu'on pourrait
   recontacter ou réaffecter depuis cette fiche. */
function BadgeProfesseurSupprime() {
  return (
    <span
      style={{
        marginLeft: 8,
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--muted)',
        background: 'var(--voile, rgba(255,255,255,.06))',
        border: '1px solid var(--border-soft)',
        borderRadius: 999,
        padding: '2px 8px',
        verticalAlign: 'middle',
      }}
    >
      Compte supprimé
    </span>
  )
}

function BlocPeriode({
  periode,
  estActuelle,
  onClickSeance,
  professeursDesSeances,
  afficherProfesseur,
}: {
  periode: PeriodeProfesseur
  estActuelle: boolean
  professeursDesSeances: Record<string, Profile>
  afficherProfesseur: boolean
  /* Toujours fourni (même en lecture seule élève/professeur) — demande client du 2026-10-19 :
     une séance clôturée n'avait plus aucune ligne cliquable, donc plus aucun moyen de revoir son
     compte rendu depuis le parcours. L'appelant (DossierEtudiantVue) décide lui-même, par
     séance, s'il ouvre la reprogrammation (encore planifiée, autorisé) ou la fiche en lecture
     seule (tous les autres cas) — voir onClickSeance ci-dessous. */
  onClickSeance: (seance: SeanceDuParcours) => void
}) {
  // « enseignées » ne doit compter que les séances réellement COMPTÉES (statut « terminée ») —
  // avant ce filtre, une séance encore planifiée (future) ou reportée (0085, demande client du
  // 2026-09-30 : « il ne faut pas la comptabiliser comme une heure enseignée ») gonflait ce
  // total au même titre qu'une séance effectivement tenue. `heuresConsommees`/`heuresEnseignees`
  // globaux (vues `student_hours_summary`/`teacher_hours_summary`, dérivées de `hour_ledger`)
  // n'avaient PAS ce bug : `hour_ledger` n'écrit jamais rien pour une séance reportée
  // (api/professeur/cloturer-seance.ts) — seul ce total PAR PÉRIODE, recalculé ici depuis les
  // séances brutes plutôt que depuis le grand livre, y était exposé.
  const heures = periode.seances.filter((s) => s.session.statut === 'terminee').reduce((total, s) => total + s.session.duree_minutes / 60, 0)
  return (
    <div
      style={{
        borderRadius: 16,
        border: estActuelle ? '1px solid rgba(169,140,255,.3)' : '1px solid var(--border)',
        background: estActuelle ? 'var(--hoc-pastille, rgba(42,26,82,.6))' : 'var(--surface)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '16px 18px', borderBottom: periode.seances.length ? '1px solid var(--border-soft)' : 'none' }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: estActuelle ? 'var(--accent-blue-gradient)' : 'var(--voile, rgba(255,255,255,.06))',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: estActuelle ? '#fff' : 'var(--muted)',
            fontSize: 14,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {periode.professeur ? initiales(periode.professeur) : '?'}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexGrow: 1, minWidth: 160 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <span className="brand-font" style={{ fontSize: 16, color: 'var(--ink)' }}>
              {periode.professeur ? `${periode.professeur.prenom} ${periode.professeur.nom}` : 'Professeur supprimé'}
            </span>
            {periode.professeur?.status === 'suspended' && <BadgeProfesseurSupprime />}
            {estActuelle && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-teal)', background: 'rgba(111,227,192,.14)', border: '1px solid rgba(111,227,192,.3)', borderRadius: 999, padding: '3px 9px' }}>
                Professeur actuel
              </span>
            )}
          </div>
          {/* La langue n'est plus affichée (demande client du 2026-10-30) : l'établissement
              n'enseigne que l'anglais, la préciser à chaque période n'apportait rien. */}
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Depuis le {new Date(periode.affectation.date_debut).toLocaleDateString('fr-FR')}
            {periode.affectation.date_fin ? ` jusqu'au ${new Date(periode.affectation.date_fin).toLocaleDateString('fr-FR')}` : ''}
          </span>
          {periode.affectation.motif_changement && (
            <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>Motif du changement : {periode.affectation.motif_changement}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            <span className="brand-font" style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>
              {periode.seances.length}
            </span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>séances</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            <span className="brand-font" style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>
              {formaterHeures(heures)}
            </span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>enseignées</span>
          </div>
        </div>
      </div>

      {periode.seances.length > 0 && (
        <TableauSeances
          seances={periode.seances}
          onClickSeance={onClickSeance}
          professeursDesSeances={professeursDesSeances}
          afficherProfesseur={afficherProfesseur}
        />
      )}
    </div>
  )
}

/* Étiquette du professeur qui a donné une séance, pour les élèves qui en ont plusieurs
   (demande client du 2026-10-27). Initiales plus prénom, et jamais le nom complet : la colonne
   doit tenir à côté du libellé de la séance, et deux professeurs se distinguent d'un coup d'œil
   par leurs initiales. */
function ProfesseurDeSeance({ professeur }: { professeur: Profile | null }) {
  if (!professeur) {
    return <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>Professeur supprimé</span>
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: 'var(--voile, rgba(255,255,255,.06))',
          border: '1px solid var(--border)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-blue)',
          fontSize: 9.5,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {initiales(professeur)}
      </span>
      <span
        className="prof-de-seance-nom"
        style={{ fontSize: 11.5, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {professeur.prenom}
      </span>
    </span>
  )
}

/* Extrait de BlocPeriode le 2026-10-19 pour servir aussi la classe de niveau d'un élève
   collectif (BlocClasseCollective ci-dessous) : les deux listent les mêmes séances, de la même
   façon, avec la même ligne cliquable — un seul rendu à maintenir. */
function TableauSeances({
  seances,
  onClickSeance,
  professeursDesSeances = {},
  afficherProfesseur = false,
}: {
  seances: SeanceDuParcours[]
  onClickSeance: (seance: SeanceDuParcours) => void
  professeursDesSeances?: Record<string, Profile>
  /* Qui a donné quoi, ligne par ligne — demande client du 2026-10-27 : « pour chaque séance, il
     faut afficher visuellement le professeur qui a fait la séance ».
     Décidé par l'appelant, et non déduit du contenu de la liste : chaque bloc de période ne
     contient par construction que les séances d'un seul professeur, une détection automatique ne
     se déclencherait donc jamais. L'en-tête du bloc le nomme déjà, mais il sort de l'écran dès
     qu'on fait défiler une longue liste — c'est précisément là que la colonne sert. Faux par
     défaut : un élève à professeur unique, de loin le cas courant, garde le tableau d'avant. */
  afficherProfesseur?: boolean
}) {
  return (
    <div>
      {/* En-têtes purement visuels : chaque ligne reste lisible seule à la lecture d'écran
          (une date, un libellé, une durée, un statut), donc les répéter en rôles ARIA de
          tableau n'apporterait rien et imposerait un balisage de cellules complet. */}
      <div
        aria-hidden
        style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '7px 18px', background: 'var(--fond-champ, rgba(0,0,0,.22))', borderBottom: '1px solid var(--border-soft)' }}
      >
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.5, width: 90, flexShrink: 0 }}>
          Date
        </span>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.5, flexGrow: 1 }}>
          Séance
        </span>
        {afficherProfesseur && (
          <span
            className="colonne-prof-seance"
            style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}
          >
            {/* Même classe que le prénom dans la cellule : sur écran étroit la colonne se réduit
                aux initiales, un intitulé tronqué à « PROI » y serait pire que pas d'intitulé. */}
            <span className="prof-de-seance-nom">Professeur</span>
          </span>
        )}
        {/* Largeur fixe comme les colonnes Date et Présence : sans elle, « Séance » (flexible)
            absorbait l'écart entre le mot « Durée » et la valeur « 1h », et toutes les colonnes
            suivantes se décalaient de leur propre en-tête — mesuré à 18 px une fois la colonne
            Professeur ajoutée à côté. */}
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.5, width: 64, flexShrink: 0 }}>
          Durée
        </span>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: 0.5, width: 72, textAlign: 'right' }}>
          Présence
        </span>
      </div>
      {/* Une période peut compter des dizaines de séances : n'en montrer que les premières
          garde le parcours lisible quand plusieurs périodes s'enchaînent. */}
      <ListeRepliable visibles={3} nom="séances">
        {seances.map((seance) => (
          <div
            key={seance.enrollment.id}
            className="row-hl"
            onClick={() => onClickSeance(seance)}
            style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '11px 18px', borderBottom: '1px solid var(--border-soft)', cursor: 'pointer' }}
          >
            <span style={{ fontSize: 12, color: 'var(--muted)', width: 90, flexShrink: 0 }}>
              {new Date(seance.session.debut).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
            </span>
            {/* L'enquête de satisfaction par séance a été retirée le 2026-10-19 (demande
                client 8) : elle n'est plus demandée à chaque cours mais deux fois par
                parcours, à la moitié des heures puis à trois heures de la fin — voir
                EnqueteParcours.tsx et EnquetesParcoursAffichage.tsx. */}
            <span style={{ fontSize: 13, color: 'var(--ink)', flexGrow: 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {seance.session.type === 'individuel' ? 'Séance individuelle' : 'Séance collective'}
            </span>
            {afficherProfesseur && (
              <span className="colonne-prof-seance">
                <ProfesseurDeSeance professeur={professeursDesSeances[seance.session.teacher_id] ?? null} />
              </span>
            )}
            <span style={{ fontSize: 12, color: 'var(--ink-2)', width: 64, flexShrink: 0 }}>
              {formaterMinutes(seance.session.duree_minutes)}
            </span>
            <span style={{ width: 72, textAlign: 'right' }}>
              <StatutSeance enrollment={seance.enrollment} statutSession={seance.session.statut} seance={seance.session} />
            </span>
          </div>
        ))}
      </ListeRepliable>
    </div>
  )
}

/* Équivalent de BlocPeriode pour un élève en cours collectif — demande client du 2026-10-19 :
   « il faudrait que tous les étudiants en cours collectifs soient visibles dans la section
   Étudiants afin de bien suivre l'étudiant en cours collectif ». Son parcours affichait jusqu'ici
   « Aucune séance enregistrée » : les périodes se construisent sur `teacher_assignments`, qu'un
   élève collectif n'a pas (son professeur est celui de sa classe de niveau, 0074).

   L'en-tête nomme donc la CLASSE et son professeur, là où BlocPeriode nomme une affectation
   individuelle — mais le tableau de séances est exactement le même. */
function BlocClasseCollective({
  seances,
  professeur,
  classe,
  onClickSeance,
}: {
  seances: SeanceDuParcours[]
  professeur: Profile | null
  classe: Database['public']['Tables']['cohort_classes']['Row'] | null
  onClickSeance: (seance: SeanceDuParcours) => void
}) {
  const heures = seances.filter((s) => s.session.statut === 'terminee').reduce((total, s) => total + s.session.duree_minutes / 60, 0)
  return (
    <div style={{ borderRadius: 16, border: '1px solid rgba(169,140,255,.3)', background: 'var(--hoc-pastille, rgba(42,26,82,.6))', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '16px 18px', borderBottom: seances.length ? '1px solid var(--border-soft)' : 'none' }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: 'var(--accent-blue-gradient)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 14,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {professeur ? initiales(professeur) : '?'}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexGrow: 1, minWidth: 160 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <span className="brand-font" style={{ fontSize: 16, color: 'var(--ink)' }}>
              {professeur ? `${professeur.prenom} ${professeur.nom}` : 'Professeur non désigné'}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-teal)', background: 'rgba(111,227,192,.14)', border: '1px solid rgba(111,227,192,.3)', borderRadius: 999, padding: '3px 9px' }}>
              Cours collectif
            </span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {classe
              ? `${LABEL_NIVEAU_CLASSE[classe.niveau]}${classe.nom ? ` — ${classe.nom}` : ''} · ${LABEL_CRENEAU_CLASSE[classe.creneau]}`
              : 'Classe de niveau non attribuée'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            <span className="brand-font" style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>
              {seances.length}
            </span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>séances</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            <span className="brand-font" style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>
              {formaterHeures(heures)}
            </span>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>suivies</span>
          </div>
        </div>
      </div>

      {seances.length > 0 && <TableauSeances seances={seances} onClickSeance={onClickSeance} />}
    </div>
  )
}

type OngletDossier = 'parcours' | 'informations' | 'enquetes' | 'professeur' | 'programme' | 'planning'

interface DossierEtudiantVueProps {
  dossier: DossierEtudiant
  /* Blocs admin uniquement — absents en vue élève/professeur. */
  panneauProfesseur?: ReactNode
  panneauInformations?: ReactNode
  /* Enquêtes de satisfaction du parcours (0130) — onglet séparé depuis le 2026-10-19 (capture
     client à l'appui) : vivait jusqu'ici sous « Informations personnelles », sans rapport avec le
     contenu de cet onglet (nom, coordonnées, adresse…), ce qui le noyait en bas de page. Même
     contenu qu'avant (EnquetesParcoursAffichage, élève + binôme s'il y en a un), simplement
     déplacé par l'appelant dans ce nouveau prop plutôt que dans panneauInformations. */
  panneauEnquetes?: ReactNode
  /* Choix initial du programme (individuel/duo/collectif), affiché tant que l'étudiant n'a ni
     forfait ni vague. */
  panneauChoixInitial?: ReactNode
  /* Formulaire d'édition du forfait existant, replié derrière le bouton « Modifier ». */
  panneauForfaitEdition?: ReactNode
  /* Bouton « Nouveau créneau » de l'onglet Forfait — admin uniquement, et seulement pour un
     élève hors cohorte : le planning d'un élève collectif se décide par classe, dans Cours
     collectifs (règle du 2026-10-19), jamais depuis son dossier. */
  panneauNouveauCreneau?: ReactNode
  /* Formulaire de planning prévisionnel (individuel/duo), replié derrière un bouton dédié.
     Fonction plutôt que nœud direct : elle reçoit `fermer`, à appeler par l'appelant une fois la
     création réussie, pour que ce composant puisse replier le formulaire et révéler aussitôt le
     résumé en lecture seule (lignes 531+) — demande client du 2026-09-16, « il faut afficher le
     planning prévisionnel créé mais plus les paramètres de planification, instantanément ».
     Avant ce prop, `onCree` ne rechargeait que les données ; rien ne refermait le formulaire, qui
     restait affiché indéfiniment par-dessus le planning qu'il venait de créer. */
  panneauPlanification?: (fermer: () => void) => ReactNode
  /* `panneauVague` (changement de vague depuis la fiche) a été retiré le 2026-10-19 : la vague et
     la classe d'un élève collectif ne se modifient plus que depuis Cours collectifs, par classe
     — voir l'onglet Programme plus bas. */
  /* Décision à prendre après l'heure d'essai (0057) — admin uniquement, absent en lecture seule. */
  panneauDecisionEssai?: ReactNode
  /* Bouton d'ajout de forfait supplémentaire (0061) — admin uniquement. */
  panneauAjoutForfait?: ReactNode
  /* Demande de forfait supplémentaire (0061) — élève uniquement, exclusif avec
     panneauAjoutForfait (jamais les deux à la fois sur un même dossier). */
  panneauDemandeForfait?: ReactNode
  /* Bouton + pop-up de suppression du compte — admin uniquement, comme les autres panneaux. */
  panneauSuppression?: ReactNode
  /* Bouton brillant de synthèse des comptes rendus (demande client du 2026-09-30) — admin et
     professeur, jamais l'élève : rendu dans l'en-tête, à côté des actions de compte. Passé en
     `ReactNode` plutôt que déduit ici d'un booléen, parce que la PORTÉE de la synthèse diffère
     selon l'espace (tout l'établissement pour l'admin, ses propres cours pour le professeur) et
     que c'est l'appelant qui la connaît. */
  panneauSynthese?: ReactNode
  /* Badge(s) ajouté(s) à la ligne d'identité de l'en-tête, après le statut — sert au
     tag « Ancien élève » côté professeur (demande client du 2026-09-30). */
  badgesSupplementaires?: ReactNode
  /* Activité du parcours (2026-10-19), quand l'appelant sait si le forfait est épuisé : elle
     remplace alors le badge de statut de compte dans l'en-tête. Omise côté professeur et côté
     élève, qui n'ont pas ce calcul sous la main. */
  activite?: ActiviteEtudiant | null
  /* Autorise l'ajout d'une réévaluation de niveau depuis la fenêtre d'historique — admin
     uniquement, comme les autres panneaux d'action. */
  peutModifierNiveau?: boolean
  /* Autorise à cliquer une ligne du planning prévisionnel pour la reprogrammer — admin
     uniquement depuis cette vue (le professeur passe par son propre calendrier, voir
     CalendrierProfesseur.tsx : les forfaits/le programme d'un élève ne lui sont pas ouverts,
     scope volontaire déjà en place ailleurs dans le dossier). */
  peutModifierPlanning?: boolean
  /* Restreint l'édition d'une séance à celles de CE professeur (0138) : un élève peut avoir
     plusieurs professeurs, qui voient désormais les séances l'un de l'autre en lecture seule.
     Omis côté admin, qui peut reprogrammer n'importe laquelle. */
  limiterEditionAuProfesseur?: string
  /* Rechargement du dossier après une action qui ne passe pas par un panneau externe (édition
     d'une séance depuis la liste ci-dessous, par exemple) — les panneauXxx gèrent déjà leur
     propre `onCree`/`onTermine`, celui-ci couvre ce que ce composant fait lui-même. */
  onDossierChange?: () => void
  /* Masque l'e-mail de l'élève dans l'en-tête — espace professeur (0061/2026-10-16) : le reste
     du masquage des coordonnées se fait via `panneauInformations` (voir
     InformationsPersonnelles.tsx), mais cette ligne-ci est rendue directement par ce composant,
     hors de ce panneau, donc pas couverte par lui. */
  masquerEmailEnTete?: boolean
}

/* Rendu du dossier étudiant, partagé entre la vue admin (avec actions) et l'espace élève/
   professeur en lecture seule — même contenu, seuls les panneaux d'action admin diffèrent. */
export function DossierEtudiantVue({
  dossier,
  panneauProfesseur,
  panneauInformations,
  panneauEnquetes,
  panneauChoixInitial,
  panneauForfaitEdition,
  panneauNouveauCreneau,
  panneauPlanification,
  panneauDecisionEssai,
  panneauAjoutForfait,
  panneauDemandeForfait,
  panneauSuppression,
  panneauSynthese,
  badgesSupplementaires,
  activite = null,
  peutModifierNiveau,
  peutModifierPlanning,
  limiterEditionAuProfesseur,
  onDossierChange,
  masquerEmailEnTete = false,
}: DossierEtudiantVueProps) {
  const {
    etudiant,
    periodes,
    seancesCollectives,
    periodesActuelles,
    professeursDesSeances,
    diagnostic,
    diagnosticPartenaire,
    packages,
    cohorte,
    cohortClasse,
    professeurClasse,
    heuresConsommees,
    heuresConsommeesClasse,
    heuresReprises,
    prochaineSeance,
    tarifChoisi,
    duoPartenaire,
  } = dossier
  const forfait = packages[0] ?? null
  /* Restant et progression se calculent sur le CUMUL des forfaits, pas seulement le dernier
     souscrit — un ajout de forfait (0061) additionne des heures à un total déjà entamé, il ne
     remplace jamais le précédent. */
  const totalHeuresCumulees = calculerTotalHeuresCumulees(packages)
  const heuresRestantes = calculerHeuresRestantes(packages, heuresConsommees)
  /* Un élève collectif ne lit NI le compteur global NI le cumul des forfaits : son parcours se
     mesure dans sa CLASSE, sur le forfait de la vague (0146, demande client du 2026-10-30 —
     « quand un étudiant est déplacé dans une autre classe, son compteur d'heures suivies repart
     de 0 »). C'est déjà la règle appliquée partout ailleurs pour lui — useEtatsParcoursEtudiants
     (liste Étudiants et écran Heures & forfaits), api/_lib/finDeForfait.ts (relances et jalons),
     FicheCandidatCollectifModale — seule cette fiche lisait encore le cumul de toute sa vie de
     dossier. Sans classe (vague legacy, affectation en attente), on retombe sur l'ancien calcul. */
  const porteeClasse = heuresConsommeesClasse !== null
  const heuresAffichees = heuresConsommeesClasse ?? heuresConsommees
  const totalHeuresAffiche = porteeClasse ? (cohorte?.heures_forfait ?? forfait?.total_heures ?? 0) : totalHeuresCumulees
  const heuresRestantesAffichees = porteeClasse ? Math.max(0, totalHeuresAffiche - heuresAffichees) : heuresRestantes
  const [editionForfaitOuverte, setEditionForfaitOuverte] = useState(false)
  const [planificationOuverte, setPlanificationOuverte] = useState(false)
  const [historiqueNiveauOuvert, setHistoriqueNiveauOuvert] = useState(false)
  const [seanceEnEdition, setSeanceEnEdition] = useState<SeanceDuParcours | null>(null)
  const [seanceEnDetail, setSeanceEnDetail] = useState<SeanceDuParcours | null>(null)
  /* Une séance de classe collective ne se modifie plus depuis la fiche d'UN élève (demande
     client du 2026-10-12) : la classe entière partage le même horaire, donc le seul endroit
     cohérent pour la reprogrammer est « Cours collectifs » › Planning de la classe, qui prévient
     tous ses élèves d'un coup plutôt qu'un seul — ici, elle s'ouvre donc toujours en lecture
     seule, jamais en édition, même encore planifiée. */
  function onClickSeance(seance: SeanceDuParcours) {
    /* Lecture seule stricte sur la séance d'un collègue (0138, décision client du 2026-10-27) :
       un professeur voit maintenant les séances de l'autre professeur de leur élève commun, mais
       ne doit pas pouvoir les reprogrammer. api/professeur/modifier-seance.ts les refuse déjà en
       403 — ouvrir quand même le formulaire aurait proposé à l'écran ce que le serveur rejette,
       exactement le défaut trouvé dans le recrutement le 2026-10-10. */
    const estSienne = !limiterEditionAuProfesseur || seance.session.teacher_id === limiterEditionAuProfesseur
    if (peutModifierPlanning && estSienne && seance.session.statut === 'planifiee' && seance.session.type !== 'collectif') {
      setSeanceEnEdition(seance)
    } else {
      setSeanceEnDetail(seance)
    }
  }
  const [ongletDemande, setOngletDemande] = useState<OngletDossier>('parcours')
  const { evaluations: niveaux } = useNiveauxEtudiant(etudiant.id)
  const niveauActuel = niveauDefinitif(diagnostic, niveaux)
  /* Collectif (0074) : sans diagnostic individuel, c'est le niveau de SA CLASSE qui fait foi —
     demande client du 2026-10-30, « tu as déjà leur niveau qui correspond au niveau de leurs
     classes respectifs ». N'intervient qu'en repli : un élève collectif avec un historique
     individuel antérieur (diagnostic, réévaluation) garde l'affichage de celui-là. */
  const niveauClasseActuel = cohortClasse ? LABEL_NIVEAU_CLASSE[cohortClasse.niveau] : null
  /* Pour un binôme DUO, chaque personne a son propre niveau — jamais un seul niveau fondu pour
     les deux (demande client du 2026-09-23 : « il faut afficher les deux niveaux des deux
     personnes formant le DUO »). `duoPartenaire` peut être `null` (pas de duo), d'où le hook
     appelé avec un id éventuellement `undefined` — comportement déjà prévu par
     useNiveauxEtudiant (retourne un tableau vide tant qu'aucun id n'est fourni). */
  const { evaluations: niveauxPartenaire } = useNiveauxEtudiant(duoPartenaire?.id)
  const niveauActuelPartenaire = duoPartenaire ? niveauDefinitif(diagnosticPartenaire, niveauxPartenaire) : null
  /* Les séances de la classe de niveau comptent comme les autres (2026-10-19) : sans elles,
     l'assiduité d'un élève collectif restait « — » et ses heures suivies à zéro alors qu'il
     suivait bien ses cours. */
  const toutesSeances = [...periodes.flatMap((p) => p.seances), ...seancesCollectives]
  const seancesTerminees = toutesSeances.filter((s) => s.session.statut === 'terminee')
  const assiduite =
    seancesTerminees.length > 0
      ? Math.round((seancesTerminees.filter((s) => s.enrollment.present).length / seancesTerminees.length) * 100)
      : null
  /* Séances déjà planifiées (statut « planifiée »), triées chronologiquement — le planning
     prévisionnel affiché en lecture seule avant que l'admin ne clique « Modifier » pour rouvrir
     le formulaire de génération. Pour un élève collectif, ce sont celles de sa classe : il n'a
     pas de période individuelle, c'est donc `seancesCollectives` qui porte son planning.
     Les séances de TOUS ses professeurs en cours depuis 0138 : prendre celles d'un seul aurait
     montré la moitié du planning réel d'un élève à deux professeurs. */
  const seancesPlanifiees = (cohorte ? seancesCollectives : periodesActuelles.flatMap((p) => p.seances))
    .filter((s) => s.session.statut === 'planifiee')
    .sort((a, b) => a.session.debut.localeCompare(b.session.debut))
  const plusieursProfesseursPlanifies = new Set(seancesPlanifiees.map((s) => s.session.teacher_id)).size > 1
  /* « Le parcours a quelque chose à montrer » : une période individuelle OU des séances de
     classe. Avant le 2026-10-19, seules les périodes comptaient — un élève collectif, qui n'en a
     aucune, tombait donc sur « Aucune séance enregistrée » quoi qu'il ait suivi. */
  const aDuParcours = periodes.length > 0 || seancesCollectives.length > 0

  /* Les quatre blocs auparavant séparés (parcours, informations, professeur, forfait) tiennent
     dans une seule carte à onglets — leur contenu ne change pas, seul l'habillage se
     regroupe. Un onglet n'apparaît que s'il a quelque chose à montrer : en lecture seule
     (espace élève/professeur), « Informations personnelles » n'est par exemple jamais passé. */
  const onglets: Onglet<OngletDossier>[] = [
    { value: 'parcours', label: 'Parcours pédagogique' },
    ...(panneauInformations ? [{ value: 'informations' as const, label: 'Informations personnelles' }] : []),
    /* Onglet séparé depuis le 2026-10-19 — auparavant une section au bas d'« Informations
       personnelles », sans rapport avec son contenu (voir panneauEnquetes ci-dessus). */
    ...(panneauEnquetes ? [{ value: 'enquetes' as const, label: 'Enquêtes de satisfaction' }] : []),
    ...(periodesActuelles.length > 0 || professeurClasse || panneauProfesseur
      ? [{ value: 'professeur' as const, label: periodesActuelles.length > 1 ? 'Professeurs' : 'Professeur' }]
      : []),
    ...(forfait || cohorte || panneauChoixInitial ? [{ value: 'programme' as const, label: cohorte ? 'Programme' : 'Forfait' }] : []),
    /* Forfait et Planning étaient regroupés sous un seul onglet « Forfait & Planning » :
       séparés depuis le 2026-09-21 (demande client), le forfait portant désormais aussi
       l'historique des forfaits successifs.

       Le collectif n'avait pas d'onglet Planning du tout jusqu'au 2026-10-19 : son planning ne
       vient pas d'un forfait mais du calendrier de sa classe. Il l'a désormais, en LECTURE SEULE
       — demande client : « pour les étudiants collectifs, l'onglet professeur, forfait, planning
       doivent être uniquement en mode lecture. Les modifications se font par classe dans la
       section cours collectifs. » */
    ...((cohorte && seancesCollectives.length > 0) || (!cohorte && forfait) ? [{ value: 'planning' as const, label: 'Planning' }] : []),
  ]
  const ongletActif = onglets.some((o) => o.value === ongletDemande) ? ongletDemande : onglets[0].value

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ width: 54, height: 54, borderRadius: 999, background: 'var(--voile, rgba(255,255,255,.06))', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
            {initiales(etudiant)}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            {/* Nom du binôme dans l'en-tête du dossier (0062, demande client du 2026-09-22 :
                « rajoute les noms des deux personnes formant le DUO »). `dossier.duoPartenaire`
                n'existe que côté principal — c'est bien lui qui porte le dossier partagé, voir
                useDossierEtudiant. */}
            {duoPartenaire ? (
              <h2 style={{ fontSize: 22, color: 'var(--ink)', margin: 0 }}>
                {etudiant.prenom} {etudiant.nom} & {duoPartenaire.prenom} {duoPartenaire.nom}
              </h2>
            ) : (
              <h2 style={{ fontSize: 22, color: 'var(--ink)', margin: 0 }}>
                {etudiant.prenom} {etudiant.nom}
              </h2>
            )}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 7 }}>
              {duoPartenaire && (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)', background: 'rgba(233,207,148,.14)', border: '1px solid rgba(233,207,148,.32)', borderRadius: 999, padding: '4px 11px' }}>
                  Duo{etudiant.duo_nom_groupe || duoPartenaire.duo_nom_groupe ? ` · ${etudiant.duo_nom_groupe || duoPartenaire.duo_nom_groupe}` : ''}
                </span>
              )}
              {/* Activité du PARCOURS quand l'appelant la connaît (espace admin depuis le
                  2026-10-19 : un forfait épuisé rend l'élève inactif, alors que son compte reste
                  approuvé), sinon le statut du compte comme avant — l'espace professeur et
                  l'espace étudiant n'ont pas les données du forfait à ce niveau. */}
              {activite ? (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: tonActiviteEtudiant(activite).color, background: tonActiviteEtudiant(activite).bg, border: `1px solid ${tonActiviteEtudiant(activite).border}`, borderRadius: 999, padding: '4px 11px' }}>
                  {libelleActiviteEtudiant(activite)}
                </span>
              ) : (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: tonStatutProfil(etudiant.status).color, background: tonStatutProfil(etudiant.status).bg, border: `1px solid ${tonStatutProfil(etudiant.status).border}`, borderRadius: 999, padding: '4px 11px' }}>
                  {libelleStatutProfil(etudiant.status)}
                </span>
              )}
              {/* La pastille de langue a été retirée (demande client du 2026-10-30) : HOC
                  n'enseigne que l'anglais, la préciser n'apportait aucune information utile. */}
              {badgesSupplementaires}
              {!masquerEmailEnTete && etudiant.email && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{etudiant.email}</span>}
            </div>
          </div>
        </div>
        {(panneauSynthese || panneauSuppression) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {panneauSynthese}
            {panneauSuppression}
          </div>
        )}
      </div>

      <GrilleStats min={160} compact>
        <Stat
          compact
          libelle="Heures suivies"
          valeur={formaterHeures(heuresAffichees)}
          /* Hors collectif : `totalHeuresCumulees` (somme de TOUS les forfaits souscrits), pas
             `forfait.total_heures` (le dernier souscrit seul) — demande client du 2026-10-10 : un
             forfait ajouté en prolongation d'un précédent encore en cours doit s'y voir cumulé.
             Avant ce correctif, un élève ayant consommé 18 h sur 20 puis prolongé de 10 h
             affichait « 18 / 10 h » (plus de 100 %) au lieu de « 18 / 30 h ».
             En collectif, c'est le forfait de la classe en cours : voir `porteeClasse`. */
          unite={forfait || porteeClasse ? `/ ${formaterHeures(totalHeuresAffiche)}` : undefined}
          ton="or"
          aide={
            porteeClasse
              ? `Forfait de ${formaterHeures(totalHeuresAffiche)} sur la classe en cours`
              : forfait
                ? `Forfait${packages.length > 1 ? 's cumulés' : ''} de ${formaterHeures(totalHeuresCumulees)}`
                : 'Aucun forfait rattaché'
          }
        />
        <Stat
          compact
          libelle="Assiduité"
          valeur={assiduite === null ? '—' : `${assiduite} %`}
          ton="teal"
          aide={seancesTerminees.length > 0 ? `Sur ${seancesTerminees.length} séance${seancesTerminees.length > 1 ? 's' : ''} clôturée${seancesTerminees.length > 1 ? 's' : ''}` : 'Aucune séance clôturée'}
        />
        <Stat
          compact
          libelle="Prochaine séance"
          valeur={
            prochaineSeance ? (
              <span style={{ fontSize: 13.5 }}>
                {new Date(prochaineSeance.session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            ) : (
              /* « à venir » plutôt que « planifiée » (2026-10-19) : cette case ne regarde, elle
                 aussi, que l'avenir — le dire évite de contredire le tableau du parcours, où une
                 séance d'hier reste au statut « planifiée » tant qu'elle n'est pas clôturée. */
              <span style={{ fontSize: 13.5 }}>Aucune à venir</span>
            )
          }
          ton="bleu"
          pied={
            prochaineSeance?.video ? (
              <a href={getJoinUrl(prochaineSeance.video)} target="_blank" rel="noreferrer" className="btn-shine btn-secondary" style={{ fontSize: 11, padding: '6px 11px' }}>
                Rejoindre la visio
              </a>
            ) : undefined
          }
        />
        <Stat
          compact
          libelle="Niveau évalué"
          valeur={
            duoPartenaire ? (
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 15 }}>
                <span>
                  {etudiant.prenom} : {niveauActuel ?? '—'}
                </span>
                <span>
                  {duoPartenaire.prenom} : {niveauActuelPartenaire ?? '—'}
                </span>
              </span>
            ) : (
              (niveauActuel ?? niveauClasseActuel ?? '—')
            )
          }
          ton="violet"
          aide={
            diagnostic || niveaux.length > 0 || diagnosticPartenaire || niveauxPartenaire.length > 0
              ? 'Établi lors de l’appel diagnostic'
              : niveauClasseActuel
                ? 'Niveau de sa classe de cours collectif'
                : 'Pas encore de diagnostic'
          }
          pied={
            (diagnostic || niveaux.length > 0) && (
              <button
                type="button"
                onClick={() => setHistoriqueNiveauOuvert(true)}
                style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-violet)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                {peutModifierNiveau ? "Voir l'historique · Modifier" : "Voir l'historique"}
              </button>
            )
          }
        />
        {/* Élève collectif uniquement (demande client du 2026-10-30) : son programme individuel
            n'a pas de « vague ». La classe (niveau, créneau) est déjà nommée juste en dessous
            dans le bloc « Cours collectif » du parcours pédagogique — l'aide reprend donc la
            PÉRIODE de la vague plutôt que de répéter la même information deux fois. */}
        {cohorte && (
          <Stat
            compact
            libelle="Vague"
            valeur={<span style={{ fontSize: 15 }}>{cohorte.nom}</span>}
            ton="or"
            aide={`${new Date(cohorte.date_debut).toLocaleDateString('fr-FR')} → ${new Date(cohorte.date_fin).toLocaleDateString('fr-FR')}`}
          />
        )}
      </GrilleStats>

      {/* Tant que le dossier n'a ni professeur ni programme, ce récapitulatif occupe l'espace
          utilement plutôt que de laisser un onglet « Professeur » ou « Programme » manquant sans
          explication ; il disparaît de lui-même une fois le dossier complet. */}
      {(periodesActuelles.length === 0 || (!forfait && !cohorte)) && (
        <Section titre="Avancement du dossier" padding="14px 16px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <EtapeAvancement fait={!!diagnostic} label="Appel diagnostic réalisé" />
            <EtapeAvancement fait={periodesActuelles.length > 0} label="Professeur attribué" />
            <EtapeAvancement fait={!!(forfait || cohorte)} label="Programme choisi (forfait ou vague)" />
          </div>
        </Section>
      )}

      {/* Les quatre blocs (parcours, informations, professeur, forfait) tenaient auparavant dans
          une grille à deux colonnes ; ils vivent maintenant dans une seule carte à onglets. */}
      <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
        <Onglets etiquette="Sections du dossier" actif={ongletActif} onChange={setOngletDemande} onglets={onglets} compact defilant />

        {ongletActif === 'parcours' && (
          <div>
            {periodes.length > 0 && (
              <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                {periodes.length} période{periodes.length > 1 ? 's' : ''} de suivi
                {periodes.length > 1 ? ` · ${periodes.length} professeurs depuis l’inscription` : ''}. Chaque période liste
                les séances du professeur concerné.
                {/* Deux périodes peuvent désormais courir EN MÊME TEMPS (0138) : sans cette
                    précision, deux blocs côte à côte se lisent comme une succession, et le lecteur
                    conclut à tort qu'un professeur a remplacé l'autre. */}
                {periodesActuelles.length > 1 && (
                  <>
                    {' '}
                    <strong style={{ color: 'var(--ink-2)' }}>
                      {periodesActuelles.length} professeurs enseignent actuellement à cet élève, en parallèle.
                    </strong>
                  </>
                )}
              </p>
            )}
            {!aDuParcours && (diagnostic || diagnosticPartenaire) && (
              <BlocDiagnosticDuo
                diagnostic={diagnostic}
                diagnosticPartenaire={diagnosticPartenaire}
                etudiant={etudiant}
                duoPartenaire={duoPartenaire}
                tarifChoisi={cohorte ? tarifChoisi : null}
              />
            )}
            {!aDuParcours && !diagnostic && !diagnosticPartenaire && (
              <EtatVide
                icone="seances"
                titre="Aucune séance enregistrée"
                description="Le parcours se remplit automatiquement dès qu’un professeur est attribué et que ses séances sont planifiées puis clôturées."
              />
            )}
            {aDuParcours && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* La classe de niveau en premier : c'est le suivi EN COURS d'un élève collectif,
                    là où les périodes individuelles ci-dessous relèvent le plus souvent d'un
                    parcours antérieur (un élève peut avoir eu un professeur individuel avant de
                    rejoindre une vague). */}
                {seancesCollectives.length > 0 && (
                  <BlocClasseCollective
                    seances={seancesCollectives}
                    professeur={professeurClasse}
                    classe={cohortClasse}
                    onClickSeance={onClickSeance}
                  />
                )}
                {periodes.map((periode) => (
                  <BlocPeriode
                    key={periode.affectation.id}
                    periode={periode}
                    /* Reconnue à `date_fin is null`, jamais par comparaison avec « la » période
                       actuelle : depuis 0138 plusieurs périodes sont actives en même temps et
                       chacune doit porter son badge. */
                    estActuelle={!periode.affectation.date_fin}
                    onClickSeance={onClickSeance}
                    professeursDesSeances={professeursDesSeances}
                    afficherProfesseur={periodesActuelles.length > 1}
                  />
                ))}
                {(diagnostic || diagnosticPartenaire) && (
                  <BlocDiagnosticDuo
                    diagnostic={diagnostic}
                    diagnosticPartenaire={diagnosticPartenaire}
                    etudiant={etudiant}
                    duoPartenaire={duoPartenaire}
                    tarifChoisi={cohorte ? tarifChoisi : null}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {ongletActif === 'informations' && panneauInformations}

        {ongletActif === 'enquetes' && panneauEnquetes}

        {ongletActif === 'professeur' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Tous ses professeurs en cours, l'un sous l'autre (demande client du 2026-10-27 :
                « dans l'espace personnel de l'étudiant, il verra les deux professeurs attribués
                à lui »). C'est le même onglet que l'élève voit dans son espace, d'où l'exigence
                remplie ici et nulle part ailleurs. */}
            {periodesActuelles.map((periode) => (
              <IdentiteProfesseur key={periode.affectation.id} periode={periode} />
            ))}
            {/* Élève collectif : son professeur n'est pas une affectation individuelle mais celui
                de sa classe de niveau (0074). Sans ce bloc, l'onglet ne montrait que le bouton
                désactivé d'AttribuerProfesseur, sans jamais dire QUI enseigne à cet élève
                — demande client du 2026-10-19 : « afin de bien suivre l'étudiant en cours
                collectif ». */}
            {periodesActuelles.length === 0 && cohorte && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <LigneInfo
                  collee
                  label="Professeur de la classe"
                  valeur={professeurClasse ? `${professeurClasse.prenom} ${professeurClasse.nom}` : 'Non désigné'}
                />
                <LigneInfo
                  collee
                  label="Classe"
                  valeur={
                    cohortClasse
                      ? `${LABEL_NIVEAU_CLASSE[cohortClasse.niveau]}${cohortClasse.nom ? ` — ${cohortClasse.nom}` : ''}`
                      : 'Non attribuée'
                  }
                />
              </div>
            )}
            {panneauProfesseur}
          </div>
        )}

        {ongletActif === 'programme' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!forfait && !cohorte && panneauChoixInitial}

            {cohorte && (
              <>
                {/* Lecture seule, sans bouton « Changer » depuis le 2026-10-19 — demande client :
                    « pour les étudiants collectifs, l'onglet professeur, forfait, planning
                    doivent être uniquement en mode lecture. Les modifications se font par classe
                    dans la section cours collectifs. » Rien n'est perdu : c'est bien là que
                    l'élève s'ajoute à une classe (CohortesAdmin.tsx), et le faire par classe
                    évite de déplacer un élève seul hors du groupe avec lequel il suit ses
                    cours. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <LigneInfo collee label="Vague" valeur={cohorte.nom} />
                  <LigneInfo
                    collee
                    label="Dates"
                    valeur={`${new Date(cohorte.date_debut).toLocaleDateString('fr-FR')} → ${new Date(cohorte.date_fin).toLocaleDateString('fr-FR')}`}
                  />
                  {cohortClasse && (
                    <>
                      <LigneInfo
                        collee
                        label="Classe"
                        valeur={`${LABEL_NIVEAU_CLASSE[cohortClasse.niveau]}${cohortClasse.nom ? ` — ${cohortClasse.nom}` : ''}`}
                      />
                      <LigneInfo collee label="Créneau" valeur={LABEL_CRENEAU_CLASSE[cohortClasse.creneau]} />
                      <LigneInfo
                        collee
                        label="Professeur de la classe"
                        valeur={professeurClasse ? `${professeurClasse.prenom} ${professeurClasse.nom}` : 'Non désigné'}
                      />
                    </>
                  )}
                  {/* Le forfait collectif est créé automatiquement à l'inscription (0071), un par
                      élève : mêmes compteurs que pour un forfait individuel, au même endroit. */}
                  {forfait && (
                    <>
                      {/* Mêmes libellés que le forfait individuel (« Consommées », jamais « Heures
                          suivies ») : ce dernier nomme déjà la tuile d'en-tête du dossier, deux
                          éléments portant le même texte rendent un test par libellé ambigu. */}
                      <LigneInfo collee label="Forfait de la vague" valeur={formaterHeures(totalHeuresAffiche)} />
                      <LigneInfo collee label="Consommées" valeur={formaterHeures(heuresAffichees)} />
                      {heuresReprises > 0 && (
                        <LigneInfo collee label="dont suivies avant la mise en service" valeur={formaterHeures(heuresReprises)} />
                      )}
                      <LigneInfo collee label="Restantes" valeur={formaterHeures(heuresRestantesAffichees)} />
                      {/* Un élève monté de niveau a derrière lui des forfaits soldés (0146) : sans
                          cette ligne, son compteur repartant de zéro passerait pour une perte de
                          données alors que tout est conservé. */}
                      {porteeClasse && packages.length > 1 && (
                        <LigneInfo
                          collee
                          label="Forfaits précédents"
                          valeur={`${packages.length - 1} cycle${packages.length > 2 ? 's' : ''} déjà suivi${packages.length > 2 ? 's' : ''}`}
                        />
                      )}
                    </>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted-2)', lineHeight: 1.5 }}>
                  Les heures affichées sont celles suivies dans la classe en cours. Vague et classe se modifient depuis Cours
                  collectifs, par classe — jamais élève par élève.
                </p>
              </>
            )}

            {!cohorte && forfait && (
              <>
                {(panneauForfaitEdition || panneauNouveauCreneau) && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    {/* Ajout d'une séance isolée, sans rouvrir le générateur de série — demande
                        client du 2026-10-31. Ici parce que l'élève et son professeur sont déjà
                        connus de cet onglet : il ne reste que l'horaire à saisir. */}
                    {panneauNouveauCreneau}
                    {panneauForfaitEdition && (
                      <button onClick={() => setEditionForfaitOuverte((v) => !v)} style={boutonPanneauStyle}>
                        {editionForfaitOuverte ? 'Annuler' : 'Modifier'}
                      </button>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <LigneInfo collee label="Programme" valeur={LABEL_TYPE_PROGRAMME[forfait.type_programme]} />
                  <LigneInfo collee label="Formule en cours" valeur={formaterHeures(forfait.total_heures)} />
                  <LigneInfo collee label="Montant" valeur={forfait.montant !== null ? `${forfait.montant.toLocaleString('fr-FR')} Ar` : '—'} />
                  <LigneInfo collee label="Consommées" valeur={formaterHeures(heuresConsommees)} />
                  {/* Un dossier repris à la mise en service (0140) affiche des heures consommées
                      sans qu'aucune séance ne figure dans son parcours : sans cette ligne, le
                      compteur passe pour faux. */}
                  {heuresReprises > 0 && (
                    <LigneInfo collee label="dont suivies avant la mise en service" valeur={formaterHeures(heuresReprises)} />
                  )}
                  <LigneInfo collee label="Restantes (tous forfaits cumulés)" valeur={formaterHeures(heuresRestantes)} />
                  <LigneInfo collee label="Échéance" valeur={forfait.echeance ? new Date(forfait.echeance).toLocaleDateString('fr-FR') : '—'} />
                </div>
                <div>
                  {/* Le pourcentage suit son intitulé au lieu d'aller au bout de la barre —
                      demande client du 2026-10-30, capture à l'appui : « il faudrait faire
                      rapprocher les informations de droite à côté de leurs intitulés à gauche ».
                      Même geste que `collee` sur les lignes au-dessus. */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Progression (cumul des forfaits)</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>
                      {Math.round(Math.min(100, (heuresConsommees / totalHeuresCumulees) * 100))} %
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={heuresConsommees}
                    aria-valuemin={0}
                    aria-valuemax={totalHeuresCumulees}
                    aria-label="Heures consommées sur l’ensemble des forfaits"
                    style={{ height: 10, borderRadius: 999, background: 'var(--fond-champ, rgba(0,0,0,.22))', overflow: 'hidden', display: 'flex' }}
                  >
                    <span
                      style={{
                        width: `${Math.min(100, (heuresConsommees / totalHeuresCumulees) * 100)}%`,
                        background: 'var(--accent-blue)',
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </div>
                {editionForfaitOuverte && panneauForfaitEdition}
                {panneauDecisionEssai}
                {panneauAjoutForfait}
                {panneauDemandeForfait}
                <HistoriqueForfaits packages={packages} />
              </>
            )}
          </div>
        )}

        {/* `cohorte` admise depuis le 2026-10-19 : le planning d'un élève collectif est celui de
            sa classe. Aucun bouton n'y apparaît — l'appelant ne fournit `panneauPlanification`
            que pour un forfait individuel — et les lignes passent par `onClickSeance`, qui
            n'ouvre jamais la reprogrammation sur une séance collective. */}
        {ongletActif === 'planning' && (forfait || cohorte) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {panneauPlanification && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setPlanificationOuverte((v) => !v)} style={boutonPanneauStyle}>
                  {planificationOuverte ? 'Annuler' : seancesPlanifiees.length > 0 ? 'Modifier' : 'Planifier les séances'}
                </button>
              </div>
            )}

            {/* Lecture seule tant que l'admin n'a pas cliqué « Modifier » : le planning déjà
                généré (voir PlanifierSeancesForfait) se voit d'un coup d'œil plutôt que de
                rouvrir aveuglément un formulaire vierge qui écraserait le contexte déjà en
                place. */}
            {seancesPlanifiees.length > 0 && !planificationOuverte && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Planning prévisionnel · {seancesPlanifiees.length} séance{seancesPlanifiees.length > 1 ? 's' : ''}
                </span>
                <div style={{ opacity: 0.78, display: 'flex', flexDirection: 'column', gap: 2, borderRadius: 12, border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
                  <ListeRepliable visibles={4} nom="séances planifiées">
                    {seancesPlanifiees.map((s) => (
                      <div
                        key={s.enrollment.id}
                        onClick={() => onClickSeance(s)}
                        className="row-hl"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          padding: '9px 13px',
                          borderBottom: '1px solid var(--border-soft)',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flexGrow: 1 }}>
                          {new Date(s.session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                        {/* Ce planning fond désormais les séances de TOUS les professeurs en
                            cours : sans cette étiquette, deux cours le même jour ne se
                            distingueraient plus l'un de l'autre. */}
                        {plusieursProfesseursPlanifies && (
                          <ProfesseurDeSeance professeur={professeursDesSeances[s.session.teacher_id] ?? null} />
                        )}
                        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{s.session.duree_minutes} min</span>
                      </div>
                    ))}
                  </ListeRepliable>
                </div>
              </div>
            )}

            {seancesPlanifiees.length === 0 && !planificationOuverte && (
              <EtatVide
                compact
                icone="seances"
                titre="Aucune séance planifiée"
                description={
                  cohorte
                    ? 'Le planning de cet élève est celui de sa classe : il se remplit depuis Cours collectifs, dès que les séances de la classe sont programmées.'
                    : 'Générez le planning prévisionnel du forfait pour que l’élève et son professeur voient leurs prochaines échéances.'
                }
              />
            )}

            {planificationOuverte && panneauPlanification?.(() => setPlanificationOuverte(false))}
          </div>
        )}
      </div>

      {historiqueNiveauOuvert && (
        <HistoriqueNiveauModale
          studentId={etudiant.id}
          etablissementId={etudiant.etablissement_id}
          diagnostic={diagnostic}
          peutModifier={peutModifierNiveau}
          onFermer={() => setHistoriqueNiveauOuvert(false)}
        />
      )}

      {seanceEnEdition && (
        <EditerSeancePlanifieeModale
          session={seanceEnEdition.session}
          /* Les DEUX membres d'un binôme, comme partout ailleurs (2026-10-11) : cet écran ne
             passait que l'élève dont on consulte le dossier, si bien qu'une séance de duo s'y
             annonçait « Élève : <un seul nom> » alors que les deux la suivent. */
          etudiants={duoPartenaire ? [etudiant, duoPartenaire] : [etudiant]}
          professeur={periodes.find((p) => p.seances.some((s) => s.session.id === seanceEnEdition.session.id))?.professeur}
          video={seanceEnEdition.video}
          onFermer={() => setSeanceEnEdition(null)}
          onEnregistre={() => {
            setSeanceEnEdition(null)
            onDossierChange?.()
          }}
        />
      )}

      {/* Fiche en lecture seule — toute séance qui n'est pas ouverte en édition ci-dessus
          (clôturée, annulée, reportée, collective, ou simplement en espace sans droit de
          modification) : date, durée, participants, compte rendu si la séance est terminée.
          Demande client du 2026-10-19 : une séance clôturée n'avait plus aucune ligne cliquable
          dans le parcours, donc plus aucun moyen d'y revenir voir ce qui s'est dit. */}
      {seanceEnDetail && (
        <DetailSeanceModale
          session={seanceEnDetail.session}
          professeur={periodes.find((p) => p.seances.some((s) => s.session.id === seanceEnDetail.session.id))?.professeur ?? null}
          eleves={duoPartenaire ? [etudiant, duoPartenaire] : [etudiant]}
          video={seanceEnDetail.video}
          onFermer={() => setSeanceEnDetail(null)}
        />
      )}
    </div>
  )
}
