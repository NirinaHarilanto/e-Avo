import { useCallback, useEffect, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useCohortes } from '../../hooks/useCohortes'
import { supabase } from '../../lib/supabaseClient'
import { formaterDansFuseauEtablissement, FUSEAU_ETABLISSEMENT } from '../../lib/etablissement'
import { instantDepuisLocal, partiesLocales } from '../../lib/creneaux'
import type { Database, NiveauClasse } from '../../types/database.types'
import { Champ, champStyle, etiquetteStyle } from '../ui/Champ'
import { boutonDangerStyle, boutonNeutreStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'
import { EtatChargement, MessageErreur, MessageInfo } from '../ui/Etats'
import { EtatVide } from '../ui/EtatVide'
import { LABEL_NIVEAU_CLASSE } from '../../lib/classesCollectif'
import { Modale } from '../ui/Modale'
import { Icone } from '../ui/Icones'
import { ChampDate } from '../ui/ChampDate'
import { GuidePage } from '../ui/GuidePage'

type CreneauTest = Database['public']['Tables']['creneaux_test_positionnement']['Row']
type Inscription = Database['public']['Tables']['test_positionnement_inscriptions']['Row']
type Prospect = Database['public']['Tables']['prospects']['Row']
type Cohort = Database['public']['Tables']['cohorts']['Row']

interface CandidatInscrit {
  inscription: Inscription
  prospect: Prospect | null
}

/* Même conversion de fuseau que partout ailleurs dans l'admin des cours collectifs (ex-
   CreneauxTestVague.tsx). */
function versInstantAntananarivo(valeurDatetimeLocal: string): string {
  const [datePart, heurePart] = valeurDatetimeLocal.split('T')
  const [annee, mois, jour] = datePart.split('-').map(Number)
  const [heures, minutes] = heurePart.split(':').map(Number)
  return instantDepuisLocal(annee, mois, jour, heures, minutes, FUSEAU_ETABLISSEMENT).toISOString()
}

function versDatetimeLocalAntananarivo(instantIso: string): string {
  const { annee, mois, jour, heures, minutes } = partiesLocales(new Date(instantIso), FUSEAU_ETABLISSEMENT)
  const deux = (n: number) => String(n).padStart(2, '0')
  return `${annee}-${deux(mois)}-${deux(jour)}T${deux(heures)}:${deux(minutes)}`
}

/* Onglet « Session orale » de Cours collectifs — demande client du 2026-10-06 : toutes les
   sessions de test oral vivaient jusqu'ici dans le détail de LEUR vague d'origine
   (CreneauxTestVague.tsx, repris ici), sans vue d'ensemble ni moyen de corriger un rattachement
   fait par erreur. Ce composant les affiche TOUTES, quelle que soit leur vague, et rend ce
   rattachement modifiable — une session créée pour la mauvaise promotion se corrige désormais
   sans avoir à la supprimer et la recréer. */
export function SessionsOraleAdmin() {
  const { session, profile } = useProfileContext()
  const { cohortes, loading: chargementCohortes } = useCohortes()
  const [creneaux, setCreneaux] = useState<CreneauTest[] | null>(null)
  const [candidatsParCreneau, setCandidatsParCreneau] = useState<Map<string, CandidatInscrit[]>>(new Map())
  const [filtreVague, setFiltreVague] = useState('')
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [creneauEnEdition, setCreneauEnEdition] = useState<CreneauTest | null>(null)
  const [inscritsOuvertPour, setInscritsOuvertPour] = useState<CreneauTest | null>(null)
  const [bilanOuvert, setBilanOuvert] = useState<CandidatInscrit | null>(null)
  const [candidatPourResultats, setCandidatPourResultats] = useState<CandidatInscrit | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [messageConversion, setMessageConversion] = useState<string | null>(null)

  const cohorteParId = new Map(cohortes.map((c) => [c.id, c]))

  const charger = useCallback(async () => {
    // Aucun filtre de vague ici, volontairement : la RLS (creneaux_test_admin_all) restreint déjà
    // à l'établissement de l'admin connecté — même convention que useProfesseurs/useEtudiants.
    const { data: lignes, error } = await supabase.from('creneaux_test_positionnement').select('*').order('debut')
    if (error) {
      setErreur(error.message)
      setCreneaux([])
      return
    }
    setCreneaux(lignes ?? [])

    const ids = (lignes ?? []).map((c) => c.id)
    if (ids.length === 0) {
      setCandidatsParCreneau(new Map())
      return
    }
    const { data: inscriptions } = await supabase.from('test_positionnement_inscriptions').select('*').in('creneau_id', ids)
    const prospectIds = [...new Set((inscriptions ?? []).map((i) => i.prospect_id))]
    const { data: prospects } = prospectIds.length
      ? await supabase.from('prospects').select('*').in('id', prospectIds)
      : { data: [] as Prospect[] }
    const prospectParId = new Map((prospects ?? []).map((p) => [p.id, p]))

    const parCreneau = new Map<string, CandidatInscrit[]>()
    for (const inscription of inscriptions ?? []) {
      const liste = parCreneau.get(inscription.creneau_id) ?? []
      liste.push({ inscription, prospect: prospectParId.get(inscription.prospect_id) ?? null })
      parCreneau.set(inscription.creneau_id, liste)
    }
    setCandidatsParCreneau(parCreneau)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  async function appelServeur(url: string, corps: object) {
    if (!session) return { error: 'Session expirée.' }
    const reponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(corps),
    })
    const resultat = await reponse.json().catch(() => null)
    if (!reponse.ok) return { error: resultat?.error ?? 'La demande a échoué.' }
    return { data: resultat }
  }

  async function creer(valeurs: { cohortId: string; debut: string; dureeMinutes: number; capaciteMax: number | null }) {
    setEnCours(true)
    setErreur(null)
    const { error } = await appelServeur('/api/admin/creer-creneau-test', {
      cohortId: valeurs.cohortId,
      debut: versInstantAntananarivo(valeurs.debut),
      dureeMinutes: valeurs.dureeMinutes,
      capaciteMax: valeurs.capaciteMax,
    })
    setEnCours(false)
    if (error) {
      setErreur(error)
      return
    }
    setFormulaireOuvert(false)
    charger()
  }

  async function modifier(
    creneauId: string,
    valeurs: { cohortId: string; debut: string; dureeMinutes: number; capaciteMax: number | null },
  ) {
    setEnCours(true)
    setErreur(null)
    const { error } = await appelServeur('/api/admin/modifier-creneau-test', {
      creneauId,
      cohortId: valeurs.cohortId,
      debut: versInstantAntananarivo(valeurs.debut),
      dureeMinutes: valeurs.dureeMinutes,
      capaciteMax: valeurs.capaciteMax,
    })
    setEnCours(false)
    if (error) {
      setErreur(error)
      return
    }
    setCreneauEnEdition(null)
    charger()
  }

  async function basculerActif(creneau: CreneauTest) {
    setErreur(null)
    const { error } = await appelServeur('/api/admin/modifier-creneau-test', { creneauId: creneau.id, actif: !creneau.actif })
    if (error) {
      setErreur(error)
      return
    }
    charger()
  }

  async function supprimer(creneau: CreneauTest) {
    const candidats = candidatsParCreneau.get(creneau.id) ?? []
    const message =
      candidats.length > 0
        ? `Supprimer cette session ? ${candidats.length} candidat(s) y sont inscrits et perdront leur réservation.`
        : 'Supprimer cette session de test ?'
    if (!window.confirm(message)) return
    setErreur(null)
    const { error } = await appelServeur('/api/admin/supprimer-creneau-test', { creneauId: creneau.id })
    if (error) {
      setErreur(error)
      return
    }
    charger()
  }

  async function validerResultatsEtConvertir(
    candidat: CandidatInscrit,
    resultats: { niveau: string; profilDetaille: string; objectifs: string },
  ) {
    if (!session || !candidat.prospect || !profile) return
    setEnCours(true)
    setErreur(null)
    setMessageConversion(null)

    const { error: diagnosticError } = await supabase.from('diagnostic_calls').insert({
      etablissement_id: candidat.prospect.etablissement_id,
      prospect_id: candidat.prospect.id,
      mene_par: profile.id,
      date_appel: new Date().toISOString(),
      niveau_evalue: resultats.niveau.trim() || null,
      notes: formaterNotesTestOral(resultats.profilDetaille, resultats.objectifs),
    })
    if (diagnosticError) {
      setEnCours(false)
      setErreur(diagnosticError.message)
      return
    }

    const { data, error } = await appelServeur('/api/admin/convert-prospect', { prospectId: candidat.prospect.id })
    setEnCours(false)
    if (error) {
      setErreur(error)
      return
    }
    const resultat = data as { niveauDetecte?: NiveauClasse | null; classeAssignee?: string | null } | undefined
    if (resultat?.niveauDetecte) {
      setMessageConversion(
        resultat.classeAssignee
          ? `Niveau détecté : ${LABEL_NIVEAU_CLASSE[resultat.niveauDetecte]} · classe assignée automatiquement.`
          : `Niveau détecté : ${LABEL_NIVEAU_CLASSE[resultat.niveauDetecte]} · aucune classe disponible (complète ou inexistante), à créer ou compléter depuis l'onglet Vagues.`,
      )
    } else {
      setMessageConversion("Niveau non déterminé (quiz non passé ou non concluant) : affectez la classe à la main depuis le dossier de l'élève.")
    }
    setCandidatPourResultats(null)
    charger()
  }

  const creneauxFiltres = (creneaux ?? []).filter((c) => !filtreVague || c.cohort_id === filtreVague)
  const totalInscrits = [...candidatsParCreneau.values()].reduce((n, l) => n + l.length, 0)

  if (creneaux === null || chargementCohortes) return <EtatChargement lignes={3} hauteur={70} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <GuidePage
        id="admin-sessions-orale"
        compact
        etapes={[
          <>
            Toutes les sessions de test oral, <strong>quelle que soit leur vague</strong>, sont réunies ici. Le
            rattachement à une vague se choisit à la création et peut être corrigé à tout moment avec « Modifier ».
          </>,
          <>
            Le bouton <strong>« Voir les inscrits »</strong> de chaque session ouvre la liste complète des candidats
            qui s’y sont inscrits depuis la page publique, avec leur score au quiz écrit et le bouton pour les
            convertir en étudiant une fois le test oral passé.
          </>,
        ]}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ ...etiquetteStyle, fontSize: 11 }}>
          {creneaux.length} session{creneaux.length > 1 ? 's' : ''}
          {totalInscrits > 0 && (
            <span style={{ marginLeft: 8, textTransform: 'none', letterSpacing: 0, fontWeight: 700, color: 'var(--accent-blue)' }}>
              · {totalInscrits} candidat{totalInscrits > 1 ? 's' : ''} inscrit{totalInscrits > 1 ? 's' : ''}
            </span>
          )}
        </span>
        <select
          value={filtreVague}
          onChange={(e) => setFiltreVague(e.target.value)}
          aria-label="Filtrer par vague"
          style={{ ...champStyle, width: 'auto', minWidth: 180, flexShrink: 0 }}
        >
          <option value="">Toutes les vagues</option>
          {cohortes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
        <button onClick={() => setFormulaireOuvert(true)} disabled={cohortes.length === 0} className="btn-shine" style={{ ...boutonPrimaireStyle, marginLeft: 'auto' }}>
          <Icone nom="plus" taille={14} />
          Ouvrir une session
        </button>
      </div>

      {cohortes.length === 0 && (
        <MessageInfo>Créez d’abord une vague dans l’onglet « Vagues » pour pouvoir y rattacher une session de test oral.</MessageInfo>
      )}
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      {messageConversion && <MessageInfo>{messageConversion}</MessageInfo>}

      {creneauxFiltres.length === 0 ? (
        <EtatVide
          icone="vagues"
          titre="Aucune session de test oral"
          description="Tant qu’aucune session n’est ouverte, les visiteurs intéressés par le collectif ne peuvent pas réserver de test de positionnement depuis la page publique."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {creneauxFiltres.map((creneau) => {
            const candidats = candidatsParCreneau.get(creneau.id) ?? []
            const vague = cohorteParId.get(creneau.cohort_id)
            return (
              <div key={creneau.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '13px 15px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flexGrow: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 700 }}>
                        {formaterDansFuseauEtablissement(creneau.debut)}
                      </span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)', background: 'rgba(233,207,148,.12)', border: '1px solid rgba(233,207,148,.3)', borderRadius: 999, padding: '2px 9px' }}>
                        {vague?.nom ?? 'Vague supprimée'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 4 }}>
                      {/* Nombre d'inscrits : l'information la plus consultée de cette carte,
                          noyée jusqu'ici dans la ligne grise du dessous (retour client du
                          2026-10-07, capture à l'appui) — sortie à part, en couleur vive. */}
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 800,
                          color: 'var(--accent-teal)',
                          background: 'rgba(111,227,192,.16)',
                          border: '1px solid rgba(111,227,192,.4)',
                          borderRadius: 999,
                          padding: '2px 10px',
                        }}
                      >
                        {candidats.length} inscrit{candidats.length > 1 ? 's' : ''}
                        {creneau.capacite_max ? ` / ${creneau.capacite_max}` : ''}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        {creneau.duree_minutes} min
                        {!creneau.actif && ' · fermée aux inscriptions'}
                        {creneau.lien_visio ? ' · lien visio prêt' : ' · lien visio en préparation'}
                      </span>
                    </div>
                  </div>

                  {/* Bouton brillant demandé par le client : « très visible » — c'est l'action la
                      plus fréquente sur cet écran (vérifier qui s'est inscrit), elle mérite de se
                      distinguer des actions de gestion ci-dessous. Resserré le 2026-10-07 (retour
                      client : trop imposant à côté des boutons de gestion) — reste brillant, mais
                      à la taille des autres boutons de la carte plutôt que plus grand qu'eux. */}
                  <button
                    type="button"
                    onClick={() => setInscritsOuvertPour(creneau)}
                    className="btn-shine"
                    style={{ ...boutonPrimaireStyle, fontSize: 11, padding: '6px 12px', flexShrink: 0 }}
                  >
                    <Icone nom="etudiants" taille={12} />
                    Voir les inscrits {candidats.length > 0 ? `(${candidats.length})` : ''}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border-soft)', paddingTop: 9 }}>
                  {creneau.lien_visio && (
                    <a href={creneau.lien_visio} target="_blank" rel="noopener noreferrer" style={{ ...boutonSecondaireStyle, textDecoration: 'none', display: 'inline-flex' }}>
                      Ouvrir le lien visio
                    </a>
                  )}
                  <button onClick={() => setCreneauEnEdition(creneau)} style={boutonSecondaireStyle}>
                    Modifier
                  </button>
                  <button onClick={() => basculerActif(creneau)} style={boutonSecondaireStyle}>
                    {creneau.actif ? 'Fermer' : 'Rouvrir'}
                  </button>
                  <button onClick={() => supprimer(creneau)} style={boutonDangerStyle}>
                    Supprimer
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {formulaireOuvert && (
        <FormulaireSessionOrale cohortes={cohortes} onFermer={() => setFormulaireOuvert(false)} onValider={creer} enCours={enCours} erreur={erreur} />
      )}
      {creneauEnEdition && (
        <FormulaireSessionOrale
          cohortes={cohortes}
          creneau={creneauEnEdition}
          onFermer={() => setCreneauEnEdition(null)}
          onValider={(valeurs) => modifier(creneauEnEdition.id, valeurs)}
          enCours={enCours}
          erreur={erreur}
        />
      )}

      {inscritsOuvertPour && (
        <Modale
          titre={`Inscrits · ${formaterDansFuseauEtablissement(inscritsOuvertPour.debut)}`}
          onFermer={() => setInscritsOuvertPour(null)}
          largeurMax={560}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 6px' }}>
              Vague : <strong style={{ color: 'var(--ink-2)' }}>{cohorteParId.get(inscritsOuvertPour.cohort_id)?.nom ?? 'Vague supprimée'}</strong>
            </p>
            {(candidatsParCreneau.get(inscritsOuvertPour.id) ?? []).length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0 }}>Aucun candidat inscrit pour le moment.</p>
            ) : (
              (candidatsParCreneau.get(inscritsOuvertPour.id) ?? []).map((candidat) => {
                const dejaConverti = candidat.prospect?.statut === 'etudiant'
                return (
                  <div key={candidat.inscription.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,.03)', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setBilanOuvert(candidat)}
                      style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', flexGrow: 1, minWidth: 140 }}
                    >
                      <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                        {candidat.prospect ? `${candidat.prospect.prenom} ${candidat.prospect.nom}` : 'Candidat inconnu'}
                      </span>
                    </button>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      {candidat.inscription.score}/{candidat.inscription.total}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-blue)', background: 'rgba(94,179,255,.14)', border: '1px solid rgba(94,179,255,.3)', borderRadius: 999, padding: '2px 9px' }}>
                      {candidat.inscription.niveau_estime ?? 'Non évalué'}
                    </span>
                    {dejaConverti ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-teal)' }}>Converti ✓</span>
                    ) : (
                      <button
                        onClick={() => setCandidatPourResultats(candidat)}
                        disabled={enCours || !candidat.prospect}
                        style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-teal)', background: 'transparent', border: '1px solid rgba(111,227,192,.3)', borderRadius: 999, padding: '5px 11px', cursor: 'pointer' }}
                      >
                        Convertir en étudiant
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </Modale>
      )}

      {bilanOuvert && (
        <Modale titre={`Bilan · ${bilanOuvert.prospect ? `${bilanOuvert.prospect.prenom} ${bilanOuvert.prospect.nom}` : 'Candidat'}`} onFermer={() => setBilanOuvert(null)} largeurMax={540}>
          <pre style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
            {bilanOuvert.inscription.bilan ?? 'Aucun bilan enregistré.'}
          </pre>
        </Modale>
      )}
      {candidatPourResultats && (
        <ModaleResultatsTestOral
          candidat={candidatPourResultats}
          enCours={enCours}
          erreur={erreur}
          onFermer={() => {
            if (enCours) return
            setCandidatPourResultats(null)
            setErreur(null)
          }}
          onValider={(resultats) => validerResultatsEtConvertir(candidatPourResultats, resultats)}
        />
      )}
    </div>
  )
}

function FormulaireSessionOrale({
  cohortes,
  creneau,
  onFermer,
  onValider,
  enCours,
  erreur,
}: {
  cohortes: Cohort[]
  creneau?: CreneauTest
  onFermer: () => void
  onValider: (valeurs: { cohortId: string; debut: string; dureeMinutes: number; capaciteMax: number | null }) => void
  enCours: boolean
  erreur: string | null
}) {
  const [cohortId, setCohortId] = useState(creneau?.cohort_id ?? '')
  const [debut, setDebut] = useState(creneau ? versDatetimeLocalAntananarivo(creneau.debut) : '')
  const [duree, setDuree] = useState(String(creneau?.duree_minutes ?? 30))
  const [capacite, setCapacite] = useState(creneau?.capacite_max ? String(creneau.capacite_max) : '')
  const enModification = !!creneau
  const pret = !!cohortId && !!debut

  return (
    <Modale titre={enModification ? 'Modifier la session de test oral' : 'Nouvelle session de test oral'} onFermer={onFermer} largeurMax={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.55 }}>
          Les candidats intéressés par le collectif choisiront cette session depuis la page publique, puis répondront au
          questionnaire de positionnement pour valider leur place. Le lien de visioconférence se génère automatiquement.
        </p>
        <Champ label="Vague" obligatoire aide={enModification ? 'Changer la vague rattache aussitôt cette session à la nouvelle promotion.' : undefined}>
          <select value={cohortId} onChange={(e) => setCohortId(e.target.value)} style={champStyle}>
            <option value="">— Choisir une vague —</option>
            {cohortes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </Champ>
        <Champ label="Date et heure" obligatoire aide="Heure d’Antananarivo, convertie automatiquement chez le candidat.">
          <ChampDate type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} style={champStyle} />
        </Champ>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Champ label="Durée (min)">
            <input type="number" min={5} max={240} value={duree} onChange={(e) => setDuree(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="Places" aide="Vide = illimité">
            <input type="number" min={1} value={capacite} onChange={(e) => setCapacite(e.target.value)} style={champStyle} />
          </Champ>
        </div>
        {enModification && (
          <p style={{ fontSize: 11.5, color: 'var(--muted-2)', margin: 0 }}>
            Changer la date ou la durée déplace l’événement Google Calendar existant : le lien visio ne change pas.
          </p>
        )}
        {erreur && <MessageErreur>{erreur}</MessageErreur>}
        <div style={{ display: 'flex', gap: 8 }}>
          {enModification && (
            <button onClick={onFermer} style={boutonNeutreStyle}>
              Annuler
            </button>
          )}
          <button
            onClick={() => onValider({ cohortId, debut, dureeMinutes: Number(duree) || 30, capaciteMax: capacite ? Number(capacite) : null })}
            disabled={!pret || enCours}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: pret && !enCours ? 1 : 0.6 }}
          >
            {enCours ? 'Enregistrement…' : enModification ? 'Enregistrer les modifications' : 'Ouvrir la session'}
          </button>
        </div>
      </div>
    </Modale>
  )
}

/* Notes de l'appel diagnostic (0006) — reprise à l'identique de l'ex-CreneauxTestVague.tsx. */
function formaterNotesTestOral(profilDetaille: string, objectifs: string): string | null {
  const parties = [
    profilDetaille.trim() ? `Profil détaillé :\n${profilDetaille.trim()}` : null,
    objectifs.trim() ? `Objectifs :\n${objectifs.trim()}` : null,
  ].filter((p): p is string => p !== null)
  return parties.length > 0 ? parties.join('\n\n') : null
}

function ModaleResultatsTestOral({
  candidat,
  enCours,
  erreur,
  onFermer,
  onValider,
}: {
  candidat: CandidatInscrit
  enCours: boolean
  erreur: string | null
  onFermer: () => void
  onValider: (resultats: { niveau: string; profilDetaille: string; objectifs: string }) => void
}) {
  const [niveau, setNiveau] = useState('')
  const [profilDetaille, setProfilDetaille] = useState('')
  const [objectifs, setObjectifs] = useState('')
  const nom = candidat.prospect ? `${candidat.prospect.prenom} ${candidat.prospect.nom}` : 'ce candidat'

  return (
    <Modale titre={`Résultats du test oral · ${nom}`} onFermer={onFermer} largeurMax={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.55 }}>
          Ces résultats sont enregistrés dans le dossier de l'élève (comme un appel diagnostic), puis {nom} est
          converti·e en étudiant·e et rejoint automatiquement cette vague.
        </p>
        <Champ label="Niveau d'anglais" aide="Ex. B1, Intermédiaire…">
          <input value={niveau} onChange={(e) => setNiveau(e.target.value)} placeholder="Niveau déterminé à l'oral" style={champStyle} />
        </Champ>
        <Champ label="Profil détaillé">
          <textarea value={profilDetaille} onChange={(e) => setProfilDetaille(e.target.value)} rows={3} style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </Champ>
        <Champ label="Objectifs">
          <textarea value={objectifs} onChange={(e) => setObjectifs(e.target.value)} rows={3} style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </Champ>
        {erreur && <MessageErreur>{erreur}</MessageErreur>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onFermer} disabled={enCours} style={boutonNeutreStyle}>
            Annuler
          </button>
          <button
            onClick={() => onValider({ niveau, profilDetaille, objectifs })}
            disabled={enCours}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours ? 0.6 : 1 }}
          >
            {enCours ? 'Enregistrement…' : 'Valider et convertir en étudiant'}
          </button>
        </div>
      </div>
    </Modale>
  )
}
