import { useCallback, useEffect, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { formaterDansFuseauEtablissement } from '../../lib/etablissement'
import type { Database } from '../../types/database.types'
import { Champ, champStyle } from '../ui/Champ'
import { boutonDangerStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { Modale } from '../ui/Modale'

type CreneauTest = Database['public']['Tables']['creneaux_test_positionnement']['Row']
type Inscription = Database['public']['Tables']['test_positionnement_inscriptions']['Row']
type Prospect = Database['public']['Tables']['prospects']['Row']

interface CandidatInscrit {
  inscription: Inscription
  prospect: Prospect | null
}

/* Sessions de test oral d'une vague et candidats qui s'y sont inscrits depuis la page publique
   (demande client du 2026-09-21). C'est ici que l'admin ouvre les créneaux que le prospect
   verra, et qu'il retrouve la liste des personnes attendues avec leur note au questionnaire. */
export function CreneauxTestVague({ cohorteId, etablissementId }: { cohorteId: string; etablissementId: string }) {
  const { profile } = useProfileContext()
  const [creneaux, setCreneaux] = useState<CreneauTest[] | null>(null)
  const [candidatsParCreneau, setCandidatsParCreneau] = useState<Map<string, CandidatInscrit[]>>(new Map())
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [bilanOuvert, setBilanOuvert] = useState<CandidatInscrit | null>(null)
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

  async function creer(valeurs: { debut: string; dureeMinutes: number; capaciteMax: number | null; lienVisio: string }) {
    if (!profile) return
    setErreur(null)
    const { error } = await supabase.from('creneaux_test_positionnement').insert({
      etablissement_id: etablissementId,
      cohort_id: cohorteId,
      debut: new Date(valeurs.debut).toISOString(),
      duree_minutes: valeurs.dureeMinutes,
      capacite_max: valeurs.capaciteMax,
      lien_visio: valeurs.lienVisio || null,
      created_by_profile_id: profile.id,
    })
    if (error) {
      setErreur(error.message)
      return
    }
    setFormulaireOuvert(false)
    charger()
  }

  async function basculerActif(creneau: CreneauTest) {
    setErreur(null)
    const { error } = await supabase
      .from('creneaux_test_positionnement')
      .update({ actif: !creneau.actif })
      .eq('id', creneau.id)
    if (error) {
      setErreur(error.message)
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
    const { error } = await supabase.from('creneaux_test_positionnement').delete().eq('id', creneau.id)
    if (error) {
      setErreur(error.message)
      return
    }
    charger()
  }

  if (creneaux === null) return <EtatChargement lignes={2} hauteur={40} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)', flexGrow: 1 }}>
          Sessions de test oral
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
          return (
            <div key={creneau.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 12, border: '1px solid var(--border)', padding: '11px 13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flexGrow: 1, minWidth: 200 }}>
                  <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 700 }}>
                    {formaterDansFuseauEtablissement(creneau.debut)}
                  </span>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    {creneau.duree_minutes} min · {candidats.length} inscrit(s)
                    {creneau.capacite_max ? ` / ${creneau.capacite_max}` : ''}
                    {!creneau.actif && ' · fermée aux inscriptions'}
                  </div>
                </div>
                <button onClick={() => basculerActif(creneau)} style={boutonSecondaireStyle}>
                  {creneau.actif ? 'Fermer' : 'Rouvrir'}
                </button>
                <button onClick={() => supprimer(creneau)} style={boutonDangerStyle}>
                  Supprimer
                </button>
              </div>

              {candidats.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
                  {candidats.map((candidat) => (
                    <button
                      key={candidat.inscription.id}
                      type="button"
                      onClick={() => setBilanOuvert(candidat)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '6px 9px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,.03)',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: 12.5, color: 'var(--ink)', flexGrow: 1 }}>
                        {candidat.prospect ? `${candidat.prospect.prenom} ${candidat.prospect.nom}` : 'Candidat inconnu'}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        {candidat.inscription.score}/{candidat.inscription.total}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-blue)', background: 'rgba(94,179,255,.14)', border: '1px solid rgba(94,179,255,.3)', borderRadius: 999, padding: '2px 9px' }}>
                        {candidat.inscription.niveau_estime ?? 'Non évalué'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}

      {formulaireOuvert && <FormulaireCreneau onFermer={() => setFormulaireOuvert(false)} onCreer={creer} />}
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
  onFermer,
  onCreer,
}: {
  onFermer: () => void
  onCreer: (valeurs: { debut: string; dureeMinutes: number; capaciteMax: number | null; lienVisio: string }) => void
}) {
  const [debut, setDebut] = useState('')
  const [duree, setDuree] = useState('30')
  const [capacite, setCapacite] = useState('')
  const [lienVisio, setLienVisio] = useState('')

  return (
    <Modale titre="Nouvelle session de test oral" onFermer={onFermer} largeurMax={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0, lineHeight: 1.55 }}>
          Les candidats intéressés par le collectif choisiront cette session depuis la page publique, puis répondront au
          questionnaire de positionnement pour valider leur place.
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
        <Champ label="Lien de visioconférence (facultatif)">
          <input value={lienVisio} onChange={(e) => setLienVisio(e.target.value)} placeholder="https://meet.google.com/…" style={champStyle} />
        </Champ>
        <button
          onClick={() => onCreer({ debut, dureeMinutes: Number(duree) || 30, capaciteMax: capacite ? Number(capacite) : null, lienVisio })}
          disabled={!debut}
          className="btn-shine"
          style={{ ...boutonPrimaireStyle, opacity: debut ? 1 : 0.6 }}
        >
          Ouvrir la session
        </button>
      </div>
    </Modale>
  )
}
