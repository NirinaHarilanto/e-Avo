import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { CHAMPS_TEXTE_COMPTE_RENDU, CHAMPS_TEXTE_SUITE, NIVEAUX_PROGRES, OBJECTIFS_COURS } from '../../lib/compteRendu'
import type { Database } from '../../types/database.types'
import { Champ, champStyle, etiquetteStyle } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { boutonNeutreStyle, boutonSecondaireStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

type SessionReport = Database['public']['Tables']['session_reports']['Row']
type Document = Database['public']['Tables']['documents']['Row']

interface CompteRenduSeanceProps {
  sessionId: string
  etablissementId: string
  teacherId: string
  /* Élèves de la séance — pour déposer une copie du support de cours dans l'espace de chacun
     (0087, demande client du 2026-09-30). Omis = pas de zone de dépôt affichée (aucun élève à
     qui le donner à voir n'aurait pas de sens). */
  studentIds?: string[]
}

const TAILLE_MAX_SUPPORT = 20 * 1024 * 1024
const TYPES_SUPPORT_ACCEPTES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

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
export function CompteRenduSeance({ sessionId, etablissementId, teacherId, studentIds }: CompteRenduSeanceProps) {
  const [rapport, setRapport] = useState<SessionReport | null>(null)
  const [ouvert, setOuvert] = useState(false)
  const [valeurs, setValeurs] = useState<ValeursFormulaire>(VALEURS_VIDES)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Supports déjà joints (rouverture d'un compte rendu existant) et nouveau fichier à joindre.
  const [supportsExistants, setSupportsExistants] = useState<Document[]>([])
  const [nouveauSupport, setNouveauSupport] = useState<File | null>(null)

  useEffect(() => {
    supabase
      .from('session_reports')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle()
      .then(async ({ data }) => {
        setRapport(data)
        setValeurs({
          objectifs: data?.objectifs ?? [],
          contenu_cours: data?.contenu_cours ?? '',
          points_a_ameliorer: data?.points_a_ameliorer ?? '',
          progres: data?.progres ?? '',
          remarques: data?.remarques ?? '',
        })
        if (data) {
          // Dédoublonné par nom : une copie existe par destinataire (soi-même + chaque élève).
          const { data: supports } = await supabase.from('documents').select('*').eq('session_report_id', data.id).eq('uploaded_by_profile_id', teacherId)
          setSupportsExistants(supports ?? [])
        }
        setLoading(false)
      })
  }, [sessionId, teacherId])

  function basculerObjectif(valeur: string) {
    setValeurs((v) => ({
      ...v,
      objectifs: v.objectifs.includes(valeur) ? v.objectifs.filter((o) => o !== valeur) : [...v.objectifs, valeur],
    }))
  }

  function definirTexte(cle: string, texte: string) {
    setValeurs((v) => ({ ...v, [cle]: texte }))
  }

  /* Dépose une copie du support pour chaque destinataire (soi-même + chaque élève de la séance) —
     0087, demande client du 2026-09-30 : « ce support sera visible par l'étudiant, le professeur,
     et l'admin ». Une ligne `documents` PAR destinataire, `owner_profile_id` différent à chaque
     fois : c'est ce qui satisfait à la fois la policy d'écriture (`documents_insert` — le
     professeur peut déposer chez lui-même ou chez un élève dont il est l'enseignant) et la
     visibilité voulue (l'élève voit sa propre copie, l'admin toute copie dont l'uploadeur diffère
     du propriétaire — donc celle de l'élève, `documents_admin_select`, 0059). Classée dans le
     dossier « Mes supports pédagogiques » de chacun quand il existe (créé par défaut pour tout
     profil, voir creer_dossiers_par_defaut, 0059) ; à la racine sinon. */
  async function deposerSupport(rapportId: string, fichier: File) {
    const destinataires = [teacherId, ...(studentIds ?? [])]
    const { data: dossiers } = await supabase
      .from('document_dossiers')
      .select('id, proprietaire_profile_id')
      .in('proprietaire_profile_id', destinataires)
      .is('parent_id', null)
      .eq('nom', 'Mes supports pédagogiques')
    const dossierParProprietaire = new Map((dossiers ?? []).map((d) => [d.proprietaire_profile_id, d.id]))

    for (const destinataireId of destinataires) {
      const { data: ligne, error: insertError } = await supabase
        .from('documents')
        .insert({
          etablissement_id: etablissementId,
          owner_profile_id: destinataireId,
          uploaded_by_profile_id: teacherId,
          categorie: 'support_pedagogique',
          nom_original: fichier.name,
          mime_type: fichier.type,
          taille_octets: fichier.size,
          dossier_id: dossierParProprietaire.get(destinataireId) ?? null,
          session_report_id: rapportId,
        })
        .select()
        .single()
      if (insertError || !ligne) continue
      const { error: uploadError } = await supabase.storage.from('documents').upload(ligne.storage_path, fichier)
      if (uploadError) await supabase.from('documents').delete().eq('id', ligne.id)
    }
  }

  async function enregistrer() {
    if (nouveauSupport) {
      if (nouveauSupport.size > TAILLE_MAX_SUPPORT) {
        setErreur('Le support de cours dépasse la taille maximale autorisée (20 Mo).')
        return
      }
      if (!TYPES_SUPPORT_ACCEPTES.includes(nouveauSupport.type)) {
        setErreur('Type de fichier non accepté pour le support de cours (PDF, image ou .docx uniquement).')
        return
      }
    }
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
    if (error || !data) {
      setEnCours(false)
      setErreur(error?.message ?? "L'enregistrement a échoué.")
      return
    }
    if (nouveauSupport) {
      await deposerSupport(data.id, nouveauSupport)
    }
    setEnCours(false)
    setRapport(data)
    setNouveauSupport(null)
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
        <span style={etiquetteStyle}>Objectif</span>
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
        <span style={etiquetteStyle}>Progrès</span>
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

      {studentIds && studentIds.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={etiquetteStyle}>Support de cours (facultatif)</span>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted-2)', lineHeight: 1.5 }}>
            Visible par l’élève, par vous et par l’administration une fois le compte rendu enregistré.
          </p>
          {supportsExistants.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {supportsExistants.map((d) => (
                <span
                  key={d.id}
                  style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-teal)', background: 'rgba(111,227,192,.1)', border: '1px solid rgba(111,227,192,.3)', borderRadius: 999, padding: '5px 11px' }}
                >
                  Déjà joint : {d.nom_original}
                </span>
              ))}
            </div>
          )}
          <input
            type="file"
            accept={TYPES_SUPPORT_ACCEPTES.join(',')}
            onChange={(e) => setNouveauSupport(e.target.files?.[0] ?? null)}
            style={{ fontSize: 12.5, color: 'var(--ink)', padding: '8px 0' }}
          />
          {supportsExistants.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Choisir un nouveau fichier l’ajoute en plus des précédents.</span>
          )}
        </div>
      )}

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
