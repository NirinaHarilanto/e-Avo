import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { CHAMPS_TEXTE_COMPTE_RENDU, CHAMPS_TEXTE_SUITE, NIVEAUX_PROGRES, OBJECTIFS_COURS } from '../../lib/compteRendu'
import type { Database } from '../../types/database.types'
import { Champ, champStyle } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { boutonNeutreStyle, boutonSecondaireStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

type SessionReport = Database['public']['Tables']['session_reports']['Row']

interface CompteRenduSeanceProps {
  sessionId: string
  etablissementId: string
  teacherId: string
}

const VALEURS_VIDES = {
  objectifs: [] as string[],
  contenu_cours: '',
  points_a_ameliorer: '',
  progres: '',
  remarques: '',
}

type ValeursFormulaire = typeof VALEURS_VIDES

/* Compte rendu de séance : renseigné par le professeur après clôture, visible dans l'onglet
   Documents (admin) et dans l'espace de chaque élève ayant participé (RLS 0033). Une ligne
   session_reports par séance (contrainte unique sur session_id) — upsert plutôt que
   insert/update séparés pour ne pas avoir à savoir si un brouillon existe déjà.

   Le template (objectif, a été vu, points à améliorer, progrès, remarques) vient de
   src/lib/compteRendu.ts — allégé le 2026-09-29. Seules ces rubriques sont écrites : les
   rubriques de l'ancien template déjà remplies restent intactes en base. */
export function CompteRenduSeance({ sessionId, etablissementId, teacherId }: CompteRenduSeanceProps) {
  const [rapport, setRapport] = useState<SessionReport | null>(null)
  const [ouvert, setOuvert] = useState(false)
  const [valeurs, setValeurs] = useState<ValeursFormulaire>(VALEURS_VIDES)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('session_reports')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle()
      .then(({ data }) => {
        setRapport(data)
        setValeurs({
          objectifs: data?.objectifs ?? [],
          contenu_cours: data?.contenu_cours ?? '',
          points_a_ameliorer: data?.points_a_ameliorer ?? '',
          progres: data?.progres ?? '',
          remarques: data?.remarques ?? '',
        })
        setLoading(false)
      })
  }, [sessionId])

  function basculerObjectif(valeur: string) {
    setValeurs((v) => ({
      ...v,
      objectifs: v.objectifs.includes(valeur) ? v.objectifs.filter((o) => o !== valeur) : [...v.objectifs, valeur],
    }))
  }

  function definirTexte(cle: string, texte: string) {
    setValeurs((v) => ({ ...v, [cle]: texte }))
  }

  async function enregistrer() {
    setEnCours(true)
    setErreur(null)
    const { data, error } = await supabase
      .from('session_reports')
      .upsert(
        {
          etablissement_id: etablissementId,
          session_id: sessionId,
          teacher_id: teacherId,
          objectifs: valeurs.objectifs,
          contenu_cours: valeurs.contenu_cours || null,
          points_a_ameliorer: valeurs.points_a_ameliorer || null,
          progres: valeurs.progres || null,
          remarques: valeurs.remarques || null,
        },
        { onConflict: 'session_id' },
      )
      .select()
      .single()
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setRapport(data)
    setOuvert(false)
  }

  if (loading) return null

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        style={{ ...(rapport ? boutonNeutreStyle : boutonSecondaireStyle), color: rapport ? 'var(--accent-teal)' : 'var(--accent-blue)', fontSize: 12.5, padding: '9px 16px' }}
      >
        <Icone nom={rapport ? 'valide' : 'plus'} taille={14} />
        {rapport ? 'Modifier le compte rendu' : 'Rédiger un compte rendu'}
      </button>
    )
  }

  const champsAvantProgres = CHAMPS_TEXTE_COMPTE_RENDU
  const champsApresProgres = CHAMPS_TEXTE_SUITE

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted-2)', lineHeight: 1.5 }}>
        Ce compte rendu est visible par l’élève concerné et par l’administration de l’établissement.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Objectif
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {OBJECTIFS_COURS.map((objectif) => (
            <label key={objectif.valeur} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={valeurs.objectifs.includes(objectif.valeur)}
                onChange={() => basculerObjectif(objectif.valeur)}
              />
              {objectif.libelle}
            </label>
          ))}
        </div>
      </div>

      {champsAvantProgres.map((champ) => (
        <Champ key={champ.cle} label={champ.libelle}>
          <textarea
            value={valeurs[champ.cle as keyof ValeursFormulaire] as string}
            onChange={(e) => definirTexte(champ.cle, e.target.value)}
            rows={2}
            style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Champ>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Progrès
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {NIVEAUX_PROGRES.map((niveau) => (
            <label key={niveau.valeur} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input
                type="radio"
                name="progres"
                checked={valeurs.progres === niveau.valeur}
                onChange={() => setValeurs((v) => ({ ...v, progres: niveau.valeur }))}
              />
              {niveau.libelle}
            </label>
          ))}
        </div>
      </div>

      {champsApresProgres.map((champ) => (
        <Champ key={champ.cle} label={champ.libelle}>
          <textarea
            value={valeurs[champ.cle as keyof ValeursFormulaire] as string}
            onChange={(e) => definirTexte(champ.cle, e.target.value)}
            rows={2}
            style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Champ>
      ))}

      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setOuvert(false)} style={{ ...boutonNeutreStyle, flexGrow: 1, fontSize: 12.5, padding: 9 }}>
          Annuler
        </button>
        <button onClick={enregistrer} disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, flexGrow: 1, fontSize: 12.5, padding: 9, opacity: enCours ? 0.6 : 1 }}>
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
