import { useState } from 'react'
import { jetonAcces } from '../../lib/jetonAcces'
import { supabase } from '../../lib/supabaseClient'
import { useCacheRequete } from '../../hooks/useCacheRequete'
import { formaterHeures } from '../../lib/heures'
import type { PeriodeProfesseur } from '../../hooks/useDossierEtudiant'
import { Modale } from '../ui/Modale'
import { Champ, champStyle } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import type { Database } from '../../types/database.types'

type Ajustement = Database['public']['Tables']['ajustements_heures']['Row']

/* Correction manuelle du compteur d'heures suivies — demande client du 2026-11-05 : « l'admin
   puisse modifier le comptage, et gérer les impacts des modifications pour le professeur et
   l'étudiant concernée ».

   Trois choix du client, arrêtés le 2026-11-04 :
     — il saisit le NOUVEAU TOTAL, pas l'écart : c'est le chiffre qu'il lit sur la fiche ;
     — la justification est obligatoire ;
     — quand l'élève a plusieurs professeurs (0138), c'est l'admin qui désigne celui qui est
       impacté, jamais l'application.

   Rien n'est réécrit : la correction ajoute une écriture au grand livre, positive ou négative.
   Une fiche de paie déjà émise n'est donc jamais touchée — la correction s'y présente comme une
   ligne de plus à régler, visible dans les heures non payées du professeur. */
export function AjusterHeuresModale({
  studentId,
  nomEleve,
  heuresActuelles,
  periodesActuelles,
  onFermer,
  onAjuste,
}: {
  studentId: string
  nomEleve: string
  heuresActuelles: number
  /* Les professeurs EN COURS de l'élève : eux seuls peuvent recevoir la répercussion. */
  periodesActuelles: PeriodeProfesseur[]
  onFermer: () => void
  onAjuste: () => void
}) {
  const professeurs = periodesActuelles
    .map((p) => p.professeur)
    .filter((p): p is NonNullable<typeof p> => p !== null)

  const [nouveauTotal, setNouveauTotal] = useState(String(heuresActuelles))
  const [justification, setJustification] = useState('')
  const [repercuter, setRepercuter] = useState(false)
  const [teacherId, setTeacherId] = useState(professeurs[0]?.id ?? '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const { valeur: historique, recharger } = useCacheRequete(
    `ajustements-heures-${studentId}`,
    async (): Promise<Ajustement[]> => {
      const { data } = await supabase
        .from('ajustements_heures')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
      return data ?? []
    },
  )

  const valeur = Number(nouveauTotal.replace(',', '.'))
  const valide = Number.isFinite(valeur) && valeur >= 0
  const ecart = valide ? Math.round((valeur - heuresActuelles) * 100) / 100 : 0
  const peutValider = valide && ecart !== 0 && justification.trim().length > 0

  async function enregistrer() {
    setEnCours(true)
    setErreur(null)
    const reponse = await fetch('/api/admin/ajuster-heures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonAcces()}` },
      body: JSON.stringify({
        studentId,
        heuresApres: valeur,
        justification: justification.trim(),
        teacherId: repercuter && teacherId ? teacherId : null,
      }),
    })
    const corps = (await reponse.json().catch(() => ({}))) as { error?: string }
    setEnCours(false)
    if (!reponse.ok) {
      setErreur(corps.error ?? 'La correction a échoué.')
      return
    }
    setJustification('')
    recharger()
    onAjuste()
    onFermer()
  }

  return (
    <Modale titre="Corriger les heures suivies" onFermer={onFermer} largeurMax={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
          {nomEleve} compte aujourd’hui <strong style={{ color: 'var(--ink)' }}>{formaterHeures(heuresActuelles)}</strong>{' '}
          suivies. Indiquez le total corrigé : l’écart est enregistré comme une correction, sans
          jamais réécrire les séances déjà clôturées.
        </p>

        <Champ label="Nouveau total d’heures suivies" obligatoire style={{ maxWidth: 240 }}>
          <input
            type="number"
            min={0}
            step="0.25"
            value={nouveauTotal}
            onChange={(e) => setNouveauTotal(e.target.value)}
            style={champStyle}
          />
        </Champ>

        {valide && ecart !== 0 && (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2, var(--ink))', lineHeight: 1.6 }}>
            Correction de{' '}
            <strong style={{ color: ecart > 0 ? 'var(--warning, #e0a94d)' : 'var(--accent-teal)' }}>
              {ecart > 0 ? '+' : '−'}
              {formaterHeures(Math.abs(ecart))}
            </strong>{' '}
            : {formaterHeures(heuresActuelles)} → {formaterHeures(valeur)}.
          </p>
        )}
        {valide && ecart === 0 && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-2)' }}>
            Ce total est déjà celui du compteur : il n’y a rien à corriger.
          </p>
        )}

        <Champ label="Justification" obligatoire>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={2}
            placeholder="Séance comptée deux fois, heure offerte, erreur de clôture…"
            style={{ ...champStyle, resize: 'vertical' }}
          />
        </Champ>

        {/* Répercussion côté professeur. Décochée par défaut : retirer des heures à un élève ne
            veut pas dire que le professeur ne les a pas données — c'est à l'admin de le dire. */}
        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {professeurs.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted-2)', lineHeight: 1.5 }}>
              Aucun professeur n’est attribué à cet élève : la correction ne concerne que son
              propre compteur.
            </p>
          ) : (
            <>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={repercuter}
                  onChange={(e) => setRepercuter(e.target.checked)}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <span style={{ fontSize: 12.5, color: 'var(--ink-2, var(--ink))', lineHeight: 1.5 }}>
                  Répercuter sur les heures enseignées du professeur
                  {valide && ecart !== 0 && (
                    <span style={{ color: 'var(--muted)' }}>
                      {' '}
                      ({ecart > 0 ? '+' : '−'}
                      {formaterHeures(Math.abs(ecart))} sur son compteur)
                    </span>
                  )}
                </span>
              </label>

              {/* Le choix n'apparaît que s'il y a vraiment à choisir (0138). */}
              {repercuter && professeurs.length > 1 && (
                <Champ label="Professeur concerné">
                  <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} style={champStyle}>
                    {professeurs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.prenom} {p.nom}
                      </option>
                    ))}
                  </select>
                </Champ>
              )}

              {repercuter && (
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted-2)', lineHeight: 1.5 }}>
                  Les fiches de paie déjà émises ne sont pas modifiées. La correction apparaîtra
                  comme une ligne de plus dans ses heures à régler.
                </p>
              )}
            </>
          )}
        </div>

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onFermer} disabled={enCours} style={boutonNeutreStyle}>
            Annuler
          </button>
          <button
            type="button"
            onClick={enregistrer}
            disabled={enCours || !peutValider}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, opacity: enCours || !peutValider ? 0.5 : 1 }}
          >
            {enCours ? 'Enregistrement…' : 'Enregistrer la correction'}
          </button>
        </div>

        {/* Historique — demandé par le client le 2026-11-04 : « un bloc historique de
            modification manuelle de l'heure de l'étudiant ». */}
        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>
            Corrections précédentes
          </span>
          {!historique || historique.length === 0 ? (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted-2)' }}>
              Aucune correction manuelle sur ce compteur.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
              {historique.map((a) => (
                <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
                      {formaterHeures(Number(a.heures_avant))} → {formaterHeures(Number(a.heures_apres))}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {new Date(a.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                    {a.teacher_id && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-blue)' }}>
                        répercutée sur le professeur
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{a.justification}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modale>
  )
}
