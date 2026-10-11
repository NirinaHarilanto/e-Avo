import { useMemo, useState } from 'react'
import { useCohortes } from '../../hooks/useCohortes'
import { useCacheRequete } from '../../hooks/useCacheRequete'
import { supabase } from '../../lib/supabaseClient'
import { FicheCandidatCollectifModale } from './FicheCandidatCollectifModale'
import { formaterDansFuseauEtablissement } from '../../lib/etablissement'
import { nomVagueSeul } from '../../lib/cohortes'
import { rangNiveauCecrl } from '../../lib/classesCollectif'
import {
  classePrevue,
  construireSuiviCollectif,
  LIBELLE_ETAPE_COLLECTIF,
  rangEtapeCollectif,
  rangFrais,
  type LigneSuiviCollectif,
} from '../../lib/suiviCollectif'
import type { ProspectStatut } from '../../types/database.types'
import { champStyle } from '../ui/Champ'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { EtatVide } from '../ui/EtatVide'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { Icone } from '../ui/Icones'

/* Couleur de l'étape, du candidat tout juste arrivé à l'élève en classe — mêmes teintes que les
   colonnes du pipeline (PipelineCRM.tsx), pour que l'admin retrouve ses repères. Fond et bordure
   posés explicitement (plutôt que dérivés de la teinte par concaténation de chaîne) : `couleur`
   sert aussi bien à un hex qu'à un `var(--xxx)`, ce que la concaténation ne permet pas. */
const STYLE_ETAPE: Record<ProspectStatut, { couleur: string; fond: string; bordure: string }> = {
  prospect: { couleur: '#8b96b8', fond: 'rgba(139,150,184,.14)', bordure: 'rgba(139,150,184,.4)' },
  diagnostic_planifie: { couleur: '#e9cf94', fond: 'rgba(233,207,148,.14)', bordure: 'rgba(233,207,148,.4)' },
  diagnostic_fait: { couleur: '#a98cff', fond: 'rgba(169,140,255,.14)', bordure: 'rgba(169,140,255,.4)' },
  etudiant: { couleur: '#6fe3c0', fond: 'rgba(111,227,192,.14)', bordure: 'rgba(111,227,192,.4)' },
}

const STYLE_FRAIS: Record<LigneSuiviCollectif['frais'], { couleur: string; fond: string; bordure: string }> = {
  aucun: { couleur: 'var(--danger)', fond: 'rgba(255,138,112,.14)', bordure: 'rgba(255,138,112,.4)' },
  attendu: { couleur: 'var(--accent-gold, #e9cf94)', fond: 'rgba(233,207,148,.14)', bordure: 'rgba(233,207,148,.4)' },
  regle: { couleur: 'var(--accent-teal)', fond: 'rgba(111,227,192,.14)', bordure: 'rgba(111,227,192,.4)' },
}

const LIBELLE_FRAIS: Record<LigneSuiviCollectif['frais'], string> = {
  aucun: 'Aucun',
  attendu: 'Attendu',
  regle: 'Réglé',
}

type ColonneTri = 'nom' | 'etape' | 'session' | 'vague' | 'classe' | 'niveauEcrit' | 'niveauOral' | 'frais'

const COLONNES: { colonne: ColonneTri; libelle: string }[] = [
  { colonne: 'nom', libelle: 'Personne' },
  { colonne: 'etape', libelle: 'Étape' },
  { colonne: 'session', libelle: 'Session orale' },
  { colonne: 'vague', libelle: 'Vague' },
  { colonne: 'classe', libelle: 'Classe' },
  { colonne: 'niveauEcrit', libelle: 'Niveau — écrit' },
  { colonne: 'niveauOral', libelle: 'Niveau — oral' },
  { colonne: 'frais', libelle: 'Frais' },
]

function initiales(nom: string): string {
  return nom
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase() ?? '')
    .join('')
}

/* Onglet « Suivi » de Cours collectifs — demande client du 2026-10-11 : « un monitoring de tous
   les prospects et étudiants liés au cours collectif avec leurs status d'étapes où ils en sont et
   les détails les concernant ». Repris en tableau le même jour (« les informations [...] sont
   très éparpillées [...] un tableau dont la première colonne est destinée aux personnes et les
   autres [...] pour les attributs ») : chaque ligne est une personne, chaque colonne un attribut
   de son dossier, pour comparer d'un coup d'œil plutôt que de déplier une carte après l'autre.

   Les deux autres onglets répondent à « où en est CETTE vague » (Vagues) et « qui vient à CETTE
   session » (Session orale) : il manquait la lecture par PERSONNE, de la candidature jusqu'à la
   classe, seule capable de montrer qui reste en route — d'où aussi l'onglet par défaut de la page
   (demande client du même jour). */
export function SuiviCollectifAdmin() {
  const { cohortes, loading: chargementCohortes } = useCohortes()
  const [filtreVague, setFiltreVague] = useState('')
  const [filtreEtape, setFiltreEtape] = useState<'' | ProspectStatut>('')
  const [recherche, setRecherche] = useState('')
  const [tri, setTri] = useState<{ colonne: ColonneTri; sens: 1 | -1 }>({ colonne: 'nom', sens: 1 })
  /* Ligne cliquée : conserve l'identité (prospectId/profilId) plutôt que l'objet `LigneSuiviCollectif`
     complet — la fiche recharge elle-même son propre dossier à l'ouverture et après chaque
     modification (voir FicheCandidatCollectifModale.tsx), elle n'a pas besoin d'un instantané figé. */
  const [ligneOuverte, setLigneOuverte] = useState<LigneSuiviCollectif | null>(null)

  /* `useCacheRequete` plutôt qu'un chargement manuel (comme avant le 2026-10-11) : c'est ce qui
     abonne cet écran au signal de synchro (lib/synchro.ts, voir useCacheRequete.ts) — toute
     écriture faite ailleurs dans l'app, y compris depuis la fiche candidat ouverte au-dessus de
     cette table, republie la liste sans action de l'admin. Demande client du même jour : « les
     mises à jour devraient être instantanées dans toute l'application HOC ». */
  const { valeur: lignes, erreur, recharger } = useCacheRequete<LigneSuiviCollectif[]>(
    'suivi-collectif',
    async () => {
      /* Toutes les requêtes en parallèle, sans jointure imbriquée : les types générés ne portent
         pas la relation sessions↔enrollments, et un select imbriqué échoue à la compilation
         (piège rencontré sur adopter-seances.ts le 2026-10-11). La RLS borne déjà chaque table à
         l'établissement de l'admin connecté. */
      const [prospects, inscriptions, creneaux, profils, inscriptionsVagues, classes, paiements] = await Promise.all([
        supabase.from('prospects').select('id, prenom, nom, email, statut, type_programme').eq('type_programme', 'collectif'),
        supabase.from('test_positionnement_inscriptions').select('prospect_id, creneau_id, niveau_estime, niveau_final, score, total, created_at'),
        supabase.from('creneaux_test_positionnement').select('id, debut, cohort_id'),
        // `status` : exclut un compte supprimé (soft-delete, voir supprimer-utilisateur.ts) du
        // suivi — demande client du 2026-10-11. `prenom`/`nom`/`email` : source de vérité une
        // fois converti, le panneau Informations personnelles écrivant dans `profiles`, jamais
        // dans `prospects` (voir construireSuiviCollectif).
        supabase.from('profiles').select('id, prospect_id, prenom, nom, email, status').not('prospect_id', 'is', null),
        supabase.from('cohort_enrollments').select('student_id, cohort_id, cohort_class_id'),
        supabase.from('cohort_classes').select('id, nom, niveau'),
        supabase.from('student_payments').select('prospect_id, student_id, montant, montant_regle').is('supprime_le', null),
      ])

      const echec = [prospects, inscriptions, creneaux, profils, inscriptionsVagues, classes, paiements].find((r) => r.error)
      if (echec?.error) throw new Error(echec.error.message)

      return construireSuiviCollectif({
        prospects: prospects.data ?? [],
        inscriptions: inscriptions.data ?? [],
        creneaux: creneaux.data ?? [],
        profils: profils.data ?? [],
        inscriptionsVagues: inscriptionsVagues.data ?? [],
        classes: classes.data ?? [],
        paiements: paiements.data ?? [],
      })
    },
  )

  const nomVagueParId = useMemo(() => new Map(cohortes.map((c) => [c.id, nomVagueSeul(c.nom)])), [cohortes])

  /* Chaque ligne, enrichie des valeurs déjà résolues (nom de vague, classe prévue, rang du niveau)
     qui servent à la fois à l'affichage et au tri — calculées une seule fois par ligne plutôt que
     recalculées séparément par chaque cellule et par le comparateur. */
  const enrichies = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    return (lignes ?? [])
      .filter(
        (l) =>
          (!filtreVague || l.vagueId === filtreVague) &&
          (!filtreEtape || l.etape === filtreEtape) &&
          (!terme || l.nom.toLowerCase().includes(terme) || (l.email ?? '').toLowerCase().includes(terme)),
      )
      .map((ligne) => ({
        ligne,
        nomVague: ligne.vagueId ? (nomVagueParId.get(ligne.vagueId) ?? null) : null,
        classePrevueAffichee: ligne.etape !== 'etudiant' ? classePrevue(ligne) : null,
        rangNiveauEcrit: rangNiveauCecrl(ligne.niveauTest),
        rangNiveauOral: rangNiveauCecrl(ligne.niveauFinal),
      }))
  }, [lignes, filtreVague, filtreEtape, recherche, nomVagueParId])

  const triees = useMemo(() => {
    function valeur(e: (typeof enrichies)[number]): string | number | null {
      switch (tri.colonne) {
        case 'nom':
          return e.ligne.nom
        case 'etape':
          return rangEtapeCollectif(e.ligne.etape)
        case 'session':
          return e.ligne.sessionOrale
        case 'vague':
          return e.nomVague
        case 'classe':
          return e.ligne.classe ?? e.classePrevueAffichee
        case 'niveauEcrit':
          return e.rangNiveauEcrit
        case 'niveauOral':
          return e.rangNiveauOral
        case 'frais':
          return rangFrais(e.ligne.frais)
      }
    }
    /* Une valeur manquante va toujours en fin de liste, quel que soit le sens du tri — inverser
       aussi l'ordre des vides serait déroutant (ils remonteraient en tête en tri décroissant). */
    return [...enrichies].sort((a, b) => {
      const va = valeur(a)
      const vb = valeur(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * tri.sens
      return String(va).localeCompare(String(vb), 'fr') * tri.sens
    })
  }, [enrichies, tri])

  function basculerTri(colonne: ColonneTri) {
    setTri((actuel) => (actuel.colonne === colonne ? { colonne, sens: actuel.sens === 1 ? -1 : 1 } : { colonne, sens: 1 }))
  }

  if (lignes === undefined || chargementCohortes) return <EtatChargement lignes={4} hauteur={60} />

  const etudiants = enrichies.filter((e) => e.ligne.etape === 'etudiant').length
  const sansFrais = enrichies.filter((e) => e.ligne.etape === 'etudiant' && e.ligne.frais === 'aucun').length
  const sansClasse = enrichies.filter((e) => e.ligne.etape === 'etudiant' && !e.ligne.classe).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <GuidePage
        id="admin-suivi-collectif"
        compact
        etapes={[
          <>
            Chaque ligne suit <strong>une personne</strong> le long du parcours collectif : sa candidature, la session
            de test oral qu’elle a choisie, sa vague, puis sa classe une fois devenue étudiante.
          </>,
          <>
            Les deux niveaux sont affichés côte à côte : celui <strong>estimé par le quiz écrit</strong>, indicatif, et
            celui que <strong>vous arrêtez au test oral</strong>, qui fait foi pour la classe et pour les frais.
          </>,
          <>
            Les encadrés du haut comptent ce qu’il reste à régulariser : <strong>sans frais enregistrés</strong> et{' '}
            <strong>sans classe</strong>. Cliquez l’en-tête d’une colonne pour <strong>trier</strong> le tableau
            dessus — un second clic inverse le sens — et servez-vous de la recherche pour retrouver un nom.
          </>,
          <>
            <strong>Cliquez une ligne</strong> pour ouvrir la fiche complète de la personne : toutes ses informations y
            sont modifiables (identité, vague, classe, paiements), et un candidat pas encore converti s’y convertit en
            étudiant·e — toujours précédé de l’enregistrement de ses frais d’inscription.
          </>,
          <>
            Une fois toutes les heures de sa vague consommées, le bouton <strong>« Évaluer l’étudiant »</strong>{' '}
            apparaît dans sa fiche : il attribue une nouvelle vague, une nouvelle classe et permet de corriger son
            niveau, toujours précédé de l’enregistrement des frais d’inscription du nouveau niveau — comme pour une
            première conversion.
          </>,
        ]}
      />

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      <GrilleStats min={150} compact>
        <Stat compact libelle="Au total" valeur={enrichies.length} ton="or" />
        <Stat compact libelle="Devenus étudiants" valeur={etudiants} ton="teal" />
        <Stat compact libelle="Sans frais enregistrés" valeur={sansFrais} ton={sansFrais > 0 ? 'alerte' : 'neutre'} />
        <Stat compact libelle="Sans classe" valeur={sansClasse} ton={sansClasse > 0 ? 'violet' : 'neutre'} />
      </GrilleStats>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un nom ou un e-mail…"
          aria-label="Rechercher une personne"
          style={{ ...champStyle, width: 'auto', minWidth: 220, flexGrow: 1, maxWidth: 320 }}
        />
        <select value={filtreVague} onChange={(e) => setFiltreVague(e.target.value)} aria-label="Filtrer par vague" style={{ ...champStyle, width: 'auto', minWidth: 170 }}>
          <option value="">Toutes les vagues</option>
          {cohortes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
        <select
          value={filtreEtape}
          onChange={(e) => setFiltreEtape(e.target.value as '' | ProspectStatut)}
          aria-label="Filtrer par étape"
          style={{ ...champStyle, width: 'auto', minWidth: 160 }}
        >
          <option value="">Toutes les étapes</option>
          {(Object.keys(LIBELLE_ETAPE_COLLECTIF) as ProspectStatut[]).map((etape) => (
            <option key={etape} value={etape}>
              {LIBELLE_ETAPE_COLLECTIF[etape]}
            </option>
          ))}
        </select>
      </div>

      {triees.length === 0 ? (
        <EtatVide
          icone="etudiants"
          titre={lignes.length === 0 ? 'Personne dans le parcours collectif' : 'Aucun résultat'}
          description={
            lignes.length === 0
              ? 'Les candidats apparaîtront ici dès qu’un visiteur choisira le programme collectif depuis la page publique.'
              : 'Aucune personne ne correspond à ces filtres.'
          }
        />
      ) : (
        <div className="tableau-suivi-conteneur">
          <table className="tableau-suivi">
            <thead>
              <tr>
                {COLONNES.map(({ colonne, libelle }) => (
                  <th key={colonne} className={colonne === 'nom' ? 'col-personne' : undefined} onClick={() => basculerTri(colonne)}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {libelle}
                      {tri.colonne === colonne && (
                        <Icone
                          nom="chevron"
                          taille={10}
                          style={{
                            flexShrink: 0,
                            color: 'var(--accent-gold, #e9cf94)',
                            transform: tri.sens === 1 ? 'rotate(-90deg)' : 'rotate(90deg)',
                          }}
                        />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {triees.map(({ ligne, nomVague, classePrevueAffichee }) => {
                const styleEtape = STYLE_ETAPE[ligne.etape]
                const styleFrais = STYLE_FRAIS[ligne.frais]
                return (
                  <tr
                    key={ligne.prospectId}
                    onClick={() => setLigneOuverte(ligne)}
                    className="tableau-suivi-ligne-cliquable"
                    tabIndex={0}
                    role="button"
                    aria-label={`Voir la fiche de ${ligne.nom}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setLigneOuverte(ligne)
                      }
                    }}
                  >
                    <td className="col-personne" style={{ borderLeft: `3px solid ${styleEtape.couleur}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            width: 30,
                            height: 30,
                            flexShrink: 0,
                            borderRadius: 999,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            fontWeight: 800,
                            color: styleEtape.couleur,
                            background: styleEtape.fond,
                            border: `1px solid ${styleEtape.bordure}`,
                          }}
                        >
                          {initiales(ligne.nom)}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{ligne.nom}</div>
                          {ligne.email && <div style={{ fontSize: 10.5, color: 'var(--muted-2)', whiteSpace: 'nowrap' }}>{ligne.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          fontSize: 10.5,
                          fontWeight: 800,
                          borderRadius: 999,
                          padding: '3px 10px',
                          whiteSpace: 'nowrap',
                          color: styleEtape.couleur,
                          background: styleEtape.fond,
                          border: `1px solid ${styleEtape.bordure}`,
                        }}
                      >
                        {LIBELLE_ETAPE_COLLECTIF[ligne.etape]}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {ligne.sessionOrale ? formaterDansFuseauEtablissement(ligne.sessionOrale) : <Vide />}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{nomVague ?? <Vide />}</td>
                    <td>
                      {ligne.classe ? (
                        ligne.classe
                      ) : classePrevueAffichee ? (
                        <span style={{ fontStyle: 'italic', color: 'var(--muted)' }}>{classePrevueAffichee} (prévue)</span>
                      ) : (
                        <Vide />
                      )}
                    </td>
                    <td>{ligne.niveauTest ?? <Vide />}</td>
                    <td>
                      {ligne.niveauFinal ? (
                        <span style={{ fontWeight: 800, color: 'var(--accent-teal)' }}>{ligne.niveauFinal}</span>
                      ) : (
                        <Vide />
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          fontSize: 10.5,
                          fontWeight: 800,
                          borderRadius: 999,
                          padding: '3px 10px',
                          whiteSpace: 'nowrap',
                          color: styleFrais.couleur,
                          background: styleFrais.fond,
                          border: `1px solid ${styleFrais.bordure}`,
                        }}
                      >
                        {LIBELLE_FRAIS[ligne.frais]}
                      </span>
                      {ligne.montantFrais > 0 && (
                        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
                          {ligne.montantFrais.toLocaleString('fr-FR')} Ar
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {ligneOuverte && (
        <FicheCandidatCollectifModale
          ligne={ligneOuverte}
          cohortes={cohortes}
          onFermer={() => setLigneOuverte(null)}
          onChange={recharger}
        />
      )}
    </div>
  )
}

function Vide() {
  return <span style={{ color: 'var(--muted-2)' }}>—</span>
}
