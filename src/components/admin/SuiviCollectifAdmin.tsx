import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCohortes } from '../../hooks/useCohortes'
import { supabase } from '../../lib/supabaseClient'
import { formaterDansFuseauEtablissement } from '../../lib/etablissement'
import { nomVagueSeul } from '../../lib/cohortes'
import {
  classePrevue,
  construireSuiviCollectif,
  LIBELLE_ETAPE_COLLECTIF,
  type LigneSuiviCollectif,
} from '../../lib/suiviCollectif'
import type { ProspectStatut } from '../../types/database.types'
import { champStyle, etiquetteStyle } from '../ui/Champ'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { EtatVide } from '../ui/EtatVide'
import { GuidePage } from '../ui/GuidePage'
import { GrilleStats, Stat } from '../ui/Stat'

/* Couleur de l'étape, du candidat tout juste arrivé à l'élève en classe — même progression que
   les colonnes du pipeline (PipelineCRM.tsx), pour que l'admin retrouve ses repères. */
const COULEUR_ETAPE: Record<ProspectStatut, string> = {
  prospect: '#8b96b8',
  diagnostic_planifie: '#e9cf94',
  diagnostic_fait: '#a98cff',
  etudiant: '#6fe3c0',
}

const COULEUR_FRAIS: Record<LigneSuiviCollectif['frais'], string> = {
  aucun: 'var(--danger)',
  attendu: 'var(--accent-gold, #e9cf94)',
  regle: 'var(--accent-teal)',
}

const LIBELLE_FRAIS: Record<LigneSuiviCollectif['frais'], string> = {
  aucun: 'Aucun',
  attendu: 'Attendu',
  regle: 'Réglé',
}

/* Onglet « Suivi » de Cours collectifs — demande client du 2026-10-11 : « un monitoring de tous
   les prospects et étudiants liés au cours collectif avec leurs status d'étapes où ils en sont et
   les détails les concernant ».

   Les deux autres onglets répondent à « où en est CETTE vague » (Vagues) et « qui vient à CETTE
   session » (Session orale) : il manquait la lecture par PERSONNE, de la candidature jusqu'à la
   classe, seule capable de montrer qui reste en route. */
export function SuiviCollectifAdmin() {
  const { cohortes, loading: chargementCohortes } = useCohortes()
  const [lignes, setLignes] = useState<LigneSuiviCollectif[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [filtreVague, setFiltreVague] = useState('')
  const [filtreEtape, setFiltreEtape] = useState<'' | ProspectStatut>('')
  const [recherche, setRecherche] = useState('')

  const charger = useCallback(async () => {
    setErreur(null)
    /* Toutes les requêtes en parallèle, sans jointure imbriquée : les types générés ne portent
       pas la relation sessions↔enrollments, et un select imbriqué échoue à la compilation (piège
       rencontré sur adopter-seances.ts le 2026-10-11). La RLS borne déjà chaque table à
       l'établissement de l'admin connecté. */
    const [prospects, inscriptions, creneaux, profils, inscriptionsVagues, classes, paiements] = await Promise.all([
      supabase.from('prospects').select('id, prenom, nom, email, statut, type_programme').eq('type_programme', 'collectif'),
      supabase.from('test_positionnement_inscriptions').select('prospect_id, creneau_id, niveau_estime, niveau_final, score, total, created_at'),
      supabase.from('creneaux_test_positionnement').select('id, debut, cohort_id'),
      supabase.from('profiles').select('id, prospect_id').not('prospect_id', 'is', null),
      supabase.from('cohort_enrollments').select('student_id, cohort_id, cohort_class_id'),
      supabase.from('cohort_classes').select('id, nom, niveau'),
      supabase.from('student_payments').select('prospect_id, student_id, montant, montant_regle').is('supprime_le', null),
    ])

    const echec = [prospects, inscriptions, creneaux, profils, inscriptionsVagues, classes, paiements].find((r) => r.error)
    if (echec?.error) {
      setErreur(echec.error.message)
      setLignes([])
      return
    }

    setLignes(
      construireSuiviCollectif({
        prospects: prospects.data ?? [],
        inscriptions: inscriptions.data ?? [],
        creneaux: creneaux.data ?? [],
        profils: profils.data ?? [],
        inscriptionsVagues: inscriptionsVagues.data ?? [],
        classes: classes.data ?? [],
        paiements: paiements.data ?? [],
      }),
    )
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  const nomVagueParId = useMemo(() => new Map(cohortes.map((c) => [c.id, nomVagueSeul(c.nom)])), [cohortes])

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    return (lignes ?? []).filter(
      (l) =>
        (!filtreVague || l.vagueId === filtreVague) &&
        (!filtreEtape || l.etape === filtreEtape) &&
        (!terme || l.nom.toLowerCase().includes(terme) || (l.email ?? '').toLowerCase().includes(terme)),
    )
  }, [lignes, filtreVague, filtreEtape, recherche])

  if (lignes === null || chargementCohortes) return <EtatChargement lignes={4} hauteur={60} />

  const etudiants = filtrees.filter((l) => l.etape === 'etudiant').length
  const sansFrais = filtrees.filter((l) => l.etape === 'etudiant' && l.frais === 'aucun').length
  const sansClasse = filtrees.filter((l) => l.etape === 'etudiant' && !l.classe).length

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
        ]}
      />

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      <GrilleStats min={150} compact>
        <Stat compact libelle="Au total" valeur={filtrees.length} ton="or" />
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

      {filtrees.length === 0 ? (
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {filtrees.map((ligne) => (
            <LigneSuivi key={ligne.prospectId} ligne={ligne} nomVague={ligne.vagueId ? nomVagueParId.get(ligne.vagueId) : undefined} />
          ))}
        </div>
      )}
    </div>
  )
}

function LigneSuivi({ ligne, nomVague }: { ligne: LigneSuiviCollectif; nomVague: string | undefined }) {
  /* Pas encore converti : on annonce la classe où il atterrira, plutôt qu'un vide qui laisserait
     croire que rien n'est prévu. */
  const classeAVenir = ligne.etape !== 'etudiant' ? classePrevue(ligne) : null

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '11px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: COULEUR_ETAPE[ligne.etape],
            border: `1px solid ${COULEUR_ETAPE[ligne.etape]}55`,
            background: `${COULEUR_ETAPE[ligne.etape]}1f`,
            borderRadius: 999,
            padding: '2px 9px',
          }}
        >
          {LIBELLE_ETAPE_COLLECTIF[ligne.etape]}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{ligne.nom}</span>
        {ligne.email && <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>{ligne.email}</span>}
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            fontWeight: 700,
            color: COULEUR_FRAIS[ligne.frais],
          }}
          title="Frais d’inscription"
        >
          Frais : {LIBELLE_FRAIS[ligne.frais]}
          {ligne.montantFrais > 0 && ` · ${ligne.montantFrais.toLocaleString('fr-FR')} Ar`}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
        <Detail libelle="Session orale" valeur={ligne.sessionOrale ? formaterDansFuseauEtablissement(ligne.sessionOrale) : null} />
        <Detail libelle="Vague" valeur={nomVague ?? null} />
        <Detail
          libelle="Classe"
          valeur={ligne.classe ?? (classeAVenir ? `${classeAVenir} (prévue)` : null)}
          attenue={!ligne.classe}
        />
        <Detail libelle="Niveau — quiz écrit" valeur={ligne.niveauTest} />
        <Detail libelle="Niveau — test oral" valeur={ligne.niveauFinal} accentue={!!ligne.niveauFinal} />
      </div>
    </div>
  )
}

function Detail({ libelle, valeur, accentue, attenue }: { libelle: string; valeur: string | null; accentue?: boolean; attenue?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 110 }}>
      <span style={{ ...etiquetteStyle, fontSize: 9.5 }}>{libelle}</span>
      <span
        style={{
          fontSize: 12,
          fontWeight: accentue ? 700 : 500,
          color: !valeur ? 'var(--muted-2)' : accentue ? 'var(--accent-teal)' : attenue ? 'var(--muted)' : 'var(--ink-2)',
        }}
      >
        {valeur ?? '—'}
      </span>
    </div>
  )
}
