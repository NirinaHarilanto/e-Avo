import { useState } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useCandidatures, type Candidature } from '../../hooks/useCandidatures'
import { DIPLOMES_DECLARES, libelleStatut, type StatutCandidature } from '../../lib/recrutement'
import { formaterDansFuseauEtablissement } from '../../lib/etablissement'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { Onglets } from '../ui/Onglets'
import { GrilleStats, Stat } from '../ui/Stat'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { FicheCandidat } from './FicheCandidat'

type Vue = 'reception' | 'selection' | 'integration' | 'integres' | 'refuses'

const STATUTS_PAR_VUE: Record<Vue, StatutCandidature[]> = {
  reception: ['recue'],
  selection: ['preselection', 'tests', 'simulation'],
  integration: ['integration'],
  integres: ['integre'],
  refuses: ['refusee'],
}

const COULEUR: Record<StatutCandidature, string> = {
  recue: 'var(--accent-blue)',
  preselection: 'var(--accent-gold, #e9cf94)',
  tests: 'var(--accent-gold, #e9cf94)',
  simulation: 'var(--accent-gold, #e9cf94)',
  integration: '#b89cff',
  integre: 'var(--accent-teal)',
  refusee: 'var(--danger)',
}

/* Recrutement et onboarding des formateurs selon le process HOC (0082, demande client du
   2026-09-29) : réception des dossiers envoyés depuis « Rejoignez-nous ! », sélection
   (pré-sélection, tests, simulation), puis intégration jusqu'à la validation du statut. */
export function RecrutementAdmin() {
  const { candidatures, contratSigne, contratEnvoye, loading, erreur, recharger } = useCandidatures()
  const [vue, setVue] = useState<Vue>('reception')
  const [ouverteId, setOuverteId] = useState<string | null>(null)
  const ouverte = candidatures.find((c) => c.id === ouverteId) ?? null

  const compte = (v: Vue) => candidatures.filter((c) => STATUTS_PAR_VUE[v].includes(c.statut)).length
  const liste = candidatures.filter((c) => STATUTS_PAR_VUE[vue].includes(c.statut))

  return (
    <AdminLayout actif="Recrutement">
      <EnTetePage
        titre="Recrutement"
        description="Les candidatures formateurs reçues depuis le bouton « Rejoignez-nous ! » de la vitrine, de la réception du dossier jusqu’à l’intégration dans l’équipe."
      />

      <GuidePage
        id="admin-recrutement"
        etapes={[
          <>
            <strong>Réception</strong> : ouvrez le dossier, consultez CV et diplômes, et cochez « documents obligatoires vérifiés »
            (licence en études anglophones OU certification TEFL reconnue).
          </>,
          <>
            <strong>Sélection</strong> : remplissez la checklist de l’appel de pré-sélection, puis les tests Reading, Listening,
            Grammar &amp; Vocabulary — le candidat doit obtenir <strong>C1 au minimum</strong> — et enfin le compte rendu de la
            simulation de cours sur Google Meet.
          </>,
          <>
            <strong>Intégration</strong> : avec un avis favorable, « Passer en intégration » crée automatiquement son espace
            professeur à partir de son dossier. Il apparaît dans Professeurs avec le statut « En phase d’intégration ».
          </>,
          <>
            Lancez son contrat depuis <strong>Contrats</strong>, suivez la checklist d’onboarding, puis validez son intégration une
            fois le contrat signé et toutes les étapes cochées.
          </>,
        ]}
      />

      {!loading && candidatures.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <GrilleStats min={160}>
            <Stat libelle="Dossiers à examiner" valeur={compte('reception')} ton={compte('reception') > 0 ? 'bleu' : 'neutre'} />
            <Stat libelle="En sélection" valeur={compte('selection')} ton="or" />
            <Stat libelle="En intégration" valeur={compte('integration')} ton="neutre" />
            <Stat libelle="Formateurs intégrés" valeur={compte('integres')} ton="teal" />
          </GrilleStats>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <Onglets
          etiquette="Phase du recrutement"
          actif={vue}
          onChange={setVue}
          onglets={[
            { value: 'reception', label: 'Réception', compteur: compte('reception') },
            { value: 'selection', label: 'Sélection', compteur: compte('selection') },
            { value: 'integration', label: 'Intégration', compteur: compte('integration') },
            { value: 'integres', label: 'Intégrés', compteur: compte('integres') },
            { value: 'refuses', label: 'Non retenus', compteur: compte('refuses') },
          ]}
        />
      </div>

      {loading ? (
        <EtatChargement lignes={3} hauteur={70} />
      ) : erreur ? (
        <MessageErreur>{erreur}</MessageErreur>
      ) : liste.length === 0 ? (
        <EtatVide
          icone="recrutement"
          titre="Aucun candidat à cette étape"
          description={
            vue === 'reception'
              ? 'Les dossiers envoyés depuis « Rejoignez-nous ! » sur la vitrine apparaîtront ici.'
              : 'Faites avancer les candidats depuis leur fiche : ils rejoindront cette colonne à l’étape correspondante.'
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {liste.map((c) => (
            <LigneCandidat key={c.id} candidature={c} onOuvrir={() => setOuverteId(c.id)} />
          ))}
        </div>
      )}

      {ouverte && (
        <FicheCandidat
          candidature={ouverte}
          contratSigne={contratSigne(ouverte.professeur_id)}
          contratEnvoye={contratEnvoye(ouverte.professeur_id)}
          onFermer={() => setOuverteId(null)}
          onChange={recharger}
        />
      )}
    </AdminLayout>
  )
}

function LigneCandidat({ candidature: c, onOuvrir }: { candidature: Candidature; onOuvrir: () => void }) {
  return (
    <button
      onClick={onOuvrir}
      className="card card-lift"
      style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
    >
      <div style={{ flexGrow: 1, minWidth: 200 }}>
        <span className="brand-font" style={{ fontSize: 14.5, color: 'var(--ink)' }}>
          {c.prenom} {c.nom}
        </span>
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          {c.email}
          {c.ville ? ` · ${c.ville}` : ''} · {DIPLOMES_DECLARES.find((d) => d.valeur === c.diplome_declare)?.libelle}
        </div>
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Reçu le {formaterDansFuseauEtablissement(c.created_at, { dateStyle: 'medium' })}</span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: COULEUR[c.statut], border: '1px solid currentColor', borderRadius: 999, padding: '3px 10px' }}>
        {libelleStatut(c.statut)}
      </span>
    </button>
  )
}
