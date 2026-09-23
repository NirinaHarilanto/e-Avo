import { useCallback, useEffect, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { formaterDansFuseauEtablissement, FUSEAU_ETABLISSEMENT } from '../../lib/etablissement'
import { instantDepuisLocal, partiesLocales } from '../../lib/creneaux'
import type { Database } from '../../types/database.types'
import { Champ, champStyle } from '../ui/Champ'
import { boutonDangerStyle, boutonNeutreStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { Modale } from '../ui/Modale'
import { Icone } from '../ui/Icones'

type CreneauTest = Database['public']['Tables']['creneaux_test_positionnement']['Row']
type Inscription = Database['public']['Tables']['test_positionnement_inscriptions']['Row']
type Prospect = Database['public']['Tables']['prospects']['Row']

interface CandidatInscrit {
  inscription: Inscription
  prospect: Prospect | null
}

/* Une entrée <input type="datetime-local"> ne porte aucun fuseau : le navigateur restitue
   "YYYY-MM-DDTHH:mm" tel quel, sans timezone. On l'interprète toujours comme une heure
   d'Antananarivo — jamais celle du navigateur de l'admin, potentiellement connecté depuis
   l'étranger — pour rester cohérent avec le texte d'aide du formulaire et avec le reste de
   l'affichage admin (formaterDansFuseauEtablissement). */
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

/* Sessions de test oral d'une vague et candidats qui s'y sont inscrits depuis la page publique
   (demande client du 2026-09-21). Chaque session est cliquable et déplie la liste de ses
   candidats, avec un bouton pour les convertir en étudiant une fois le test oral passé — la
   conversion les rattache automatiquement à cette vague (voir api/admin/convert-prospect.ts).
   Création/modification/suppression passent par le serveur pour générer, déplacer ou retirer le
   lien Google Meet en même temps que le créneau. */
export function CreneauxTestVague({ cohorteId }: { cohorteId: string }) {
  const { session } = useProfileContext()
  const [creneaux, setCreneaux] = useState<CreneauTest[] | null>(null)
  const [candidatsParCreneau, setCandidatsParCreneau] = useState<Map<string, CandidatInscrit[]>>(new Map())
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [creneauEnEdition, setCreneauEnEdition] = useState<CreneauTest | null>(null)
  const [creneauDeplie, setCreneauDeplie] = useState<string | null>(null)
  const [bilanOuvert, setBilanOuvert] = useState<CandidatInscrit | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(async () => {
    const { data: lignes, error } = await supabase
      .from('creneaux_test_positionnement')
      .select('*')
      .eq('cohort_id', cohorteId)
      .order('debut')
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
  }, [cohorteId])

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

  async function creer(valeurs: { debut: string; dureeMinutes: number; capaciteMax: number | null }) {
    setEnCours(true)
    setErreur(null)
    const { error } = await appelServeur('/api/admin/creer-creneau-test', {
      cohortId: cohorteId,
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

  async function modifier(creneauId: string, valeurs: { debut: string; dureeMinutes: number; capaciteMax: number | null }) {
    setEnCours(true)
    setErreur(null)
    const { error } = await appelServeur('/api/admin/modifier-creneau-test', {
      creneauId,
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

  async function convertirEnEtudiant(candidat: CandidatInscrit) {
    if (!session || !candidat.prospect) return
    if (
      !window.confirm(
        `Convertir ${candidat.prospect.prenom} ${candidat.prospect.nom} en étudiant ? Il/elle rejoindra automatiquement cette vague, et un e-mail d'invitation lui sera envoyé pour créer son mot de passe.`,
      )
    ) {
      return
    }
    setEnCours(true)
    setErreur(null)
    const { error } = await appelServeur('/api/admin/convert-prospect', { prospectId: candidat.prospect.id })
    setEnCours(false)
    if (error) {
      setErreur(error)
      return
    }
    charger()
  }

  /* Compteurs de la vague entière : sans eux, un candidat n'était visible qu'après avoir déplié
     la bonne session, et rien ne signalait qu'il en restait à convertir (demande client du
     2026-09-23, point 7). */
  const tousCandidats = [...candidatsParCreneau.values()].flat()
  const totalCandidats = tousCandidats.length
  const aConvertir = tousCandidats.filter((c) => c.prospect && c.prospect.statut !== 'etudiant').length

  if (creneaux === null) return <EtatChargement lignes={2} hauteur={40} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)', flexGrow: 1 }}>
          Sessions de test oral
          {totalCandidats > 0 && (
            <span style={{ marginLeft: 8, textTransform: 'none', letterSpacing: 0, fontWeight: 700, color: 'var(--accent-blue)' }}>
              {totalCandidats} candidat{totalCandidats > 1 ? 's' : ''}
              {aConvertir > 0 ? ` · ${aConvertir} à convertir` : ''}
            </span>
          )}
        </span>
        <button onClick={() => setFormulaireOuvert(true)} style={boutonSecondaireStyle}>
          Ouvrir une session
        </button>
      </div>

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {creneaux.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0, lineHeight: 1.55 }}>
          Aucune session ouverte. Tant qu’il n’y en a pas, les visiteurs intéressés par le collectif ne peuvent pas
          réserver de test de positionnement depuis la page publique.
        </p>
      ) : (
        creneaux.map((creneau) => {
          const candidats = candidatsParCreneau.get(creneau.id) ?? []
          const deplie = creneauDeplie === creneau.id
          return (
            <div key={creneau.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 12, border: '1px solid var(--border)', padding: '11px 13px' }}>
              <button
                type="button"
                onClick={() => setCreneauDeplie(deplie ? null : creneau.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}
              >
                <span style={{ transform: deplie ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'var(--muted)', flexShrink: 0 }}>
                  <Icone nom="chevron" taille={14} />
                </span>
                <div style={{ flexGrow: 1, minWidth: 200 }}>
                  <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 700 }}>
                    {formaterDansFuseauEtablissement(creneau.debut)}
                  </span>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    {creneau.duree_minutes} min · {candidats.length} inscrit(s)
                    {creneau.capacite_max ? ` / ${creneau.capacite_max}` : ''}
                    {!creneau.actif && ' · fermée aux inscriptions'}
                    {creneau.lien_visio ? ' · lien Meet prêt' : ' · lien Meet en préparation'}
                  </div>
                </div>
              </button>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                {creneau.lien_visio && (
                  <a
                    href={creneau.lien_visio}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...boutonSecondaireStyle, textDecoration: 'none', display: 'inline-flex' }}
                  >
                    Ouvrir le lien Meet
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

              {deplie && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
                  {candidats.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--muted-2)', margin: 0 }}>Aucun candidat inscrit pour le moment.</p>
                  ) : (
                    candidats.map((candidat) => {
                      const dejaConverti = candidat.prospect?.statut === 'etudiant'
                      return (
                        <div key={candidat.inscription.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,.03)', flexWrap: 'wrap' }}>
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
                              onClick={() => convertirEnEtudiant(candidat)}
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
              )}
            </div>
          )
        })
      )}

      {formulaireOuvert && (
        <FormulaireCreneau onFermer={() => setFormulaireOuvert(false)} onValider={creer} enCours={enCours} />
      )}
      {creneauEnEdition && (
        <FormulaireCreneau
          creneau={creneauEnEdition}
          onFermer={() => setCreneauEnEdition(null)}
          onValider={(valeurs) => modifier(creneauEnEdition.id, valeurs)}
          enCours={enCours}
        />
      )}
      {bilanOuvert && (
        <Modale
          titre={`Bilan · ${bilanOuvert.prospect ? `${bilanOuvert.prospect.prenom} ${bilanOuvert.prospect.nom}` : 'Candidat'}`}
          onFermer={() => setBilanOuvert(null)}
          largeurMax={540}
        >
          <pre style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
            {bilanOuvert.inscription.bilan ?? 'Aucun bilan enregistré.'}
          </pre>
        </Modale>
      )}
    </div>
  )
}

function FormulaireCreneau({
  creneau,
  onFermer,
  onValider,
  enCours,
}: {
  creneau?: CreneauTest
  onFermer: () => void
  onValider: (valeurs: { debut: string; dureeMinutes: number; capaciteMax: number | null }) => void
  enCours: boolean
}) {
  const [debut, setDebut] = useState(creneau ? versDatetimeLocalAntananarivo(creneau.debut) : '')
  const [duree, setDuree] = useState(String(creneau?.duree_minutes ?? 30))
  const [capacite, setCapacite] = useState(creneau?.capacite_max ? String(creneau.capacite_max) : '')
  const enModification = !!creneau

  return (
    <Modale titre={enModification ? 'Modifier la session de test oral' : 'Nouvelle session de test oral'} onFermer={onFermer} largeurMax={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.55 }}>
          Les candidats intéressés par le collectif choisiront cette session depuis la page publique, puis répondront au
          questionnaire de positionnement pour valider leur place. Le lien Google Meet se génère automatiquement.
        </p>
        <Champ label="Date et heure" obligatoire aide="Heure d’Antananarivo, convertie automatiquement chez le candidat.">
          <input type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} style={champStyle} />
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
            Changer la date ou la durée déplace l’événement Google Calendar existant : le lien Meet ne change pas.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          {enModification && (
            <button onClick={onFermer} style={boutonNeutreStyle}>
              Annuler
            </button>
          )}
          <button
            onClick={() => onValider({ debut, dureeMinutes: Number(duree) || 30, capaciteMax: capacite ? Number(capacite) : null })}
            disabled={!debut || enCours}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: debut && !enCours ? 1 : 0.6 }}
          >
            {enCours ? 'Enregistrement…' : enModification ? 'Enregistrer les modifications' : 'Ouvrir la session'}
          </button>
        </div>
      </div>
    </Modale>
  )
}
