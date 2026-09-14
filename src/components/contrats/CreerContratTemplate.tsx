import { useState, type FormEvent } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { extraireVariables } from '../../lib/contrats'
import type { Database, Role, VariableTemplate } from '../../types/database.types'
import { champStyle } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'

type ContractTemplate = Database['public']['Tables']['contract_templates']['Row']

interface CreerContratTemplateProps {
  etablissementId: string
  onEnregistre: () => void
  onAnnuler: () => void
  /* Présent en mode modification : préremplit le formulaire et bascule le clic sur
     « Enregistrer » vers une mise à jour de la ligne existante plutôt qu'une création. Les
     contrats déjà générés à partir de ce modèle ne sont pas affectés — `corps_genere` a figé
     leur texte au moment de l'émission (voir GenererContrat.tsx). */
  modele?: ContractTemplate
}

export function CreerContratTemplate({ etablissementId, onEnregistre, onAnnuler, modele }: CreerContratTemplateProps) {
  const { profile } = useProfileContext()
  const [nom, setNom] = useState(modele?.nom ?? '')
  const [publicCible, setPublicCible] = useState<Role>(modele?.public_cible ?? 'etudiant')
  const [corpsTemplate, setCorpsTemplate] = useState(modele?.corps_template ?? '')
  const [variables, setVariables] = useState<VariableTemplate[]>(modele?.variables_disponibles ?? [])
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const enModification = !!modele

  function detecterVariables() {
    const cles = extraireVariables(corpsTemplate)
    setVariables(cles.map((cle) => variables.find((v) => v.cle === cle) ?? { cle, label: cle }))
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    if (!profile || !nom || !corpsTemplate) return
    setEnCours(true)
    setErreur(null)

    const { error } = enModification
      ? await supabase
          .from('contract_templates')
          .update({ nom, public_cible: publicCible, corps_template: corpsTemplate, variables_disponibles: variables })
          .eq('id', modele.id)
      : await supabase.from('contract_templates').insert({
          etablissement_id: etablissementId,
          nom,
          public_cible: publicCible,
          corps_template: corpsTemplate,
          variables_disponibles: variables,
          created_by_profile_id: profile.id,
        })

    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onEnregistre()
  }

  return (
    <form onSubmit={enregistrer} className="card" style={{ padding: 18, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>{enModification ? `Modifier « ${modele.nom} »` : 'Nouveau modèle de contrat'}</h3>

      {enModification && (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
          Cette modification ne change que le modèle. Les contrats déjà générés à partir de lui gardent leur texte
          d'origine, figé au moment de leur émission.
        </p>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1, minWidth: 220 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Nom du modèle</label>
          <input required value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Contrat de cours particuliers" style={champStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 180 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Public cible</label>
          <select value={publicCible} onChange={(e) => setPublicCible(e.target.value as Role)} style={champStyle}>
            <option value="etudiant">Étudiant</option>
            <option value="professeur">Professeur</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>
          Texte du contrat — utiliser <code>{'{{variable}}'}</code> pour les valeurs à personnaliser
        </label>
        <textarea
          required
          rows={10}
          value={corpsTemplate}
          onChange={(e) => setCorpsTemplate(e.target.value)}
          placeholder={'Entre {{nom_etablissement}} et {{nom_etudiant}}, il est convenu ce qui suit…'}
          style={{ ...champStyle, fontFamily: 'monospace', resize: 'vertical' }}
        />
        <button type="button" onClick={detecterVariables} style={{ alignSelf: 'flex-start', fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 8, padding: '6px 11px', cursor: 'pointer' }}>
          Détecter les variables du texte
        </button>
      </div>

      {variables.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)' }}>Libellés des variables (affichés à la génération)</label>
          {variables.map((variable, index) => (
            <div key={variable.cle} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{ fontSize: 12, color: 'var(--muted)', width: 160, flexShrink: 0 }}>{'{{' + variable.cle + '}}'}</code>
              <input
                value={variable.label}
                onChange={(e) => setVariables(variables.map((v, i) => (i === index ? { ...v, label: e.target.value } : v)))}
                style={{ ...champStyle, flexGrow: 1 }}
              />
            </div>
          ))}
        </div>
      )}

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onAnnuler} style={{ ...boutonNeutreStyle, fontSize: 12.5, padding: '10px 16px' }}>
          Annuler
        </button>
        <button type="submit" disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, opacity: enCours ? 0.6 : 1 }}>
          {enCours ? 'Enregistrement…' : enModification ? 'Enregistrer les modifications' : 'Enregistrer le modèle'}
        </button>
      </div>
    </form>
  )
}
