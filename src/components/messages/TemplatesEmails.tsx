import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useProfileContext } from '../../context/ProfileContext'
import { useEmailEnvois, useEmailTemplates, useEmailVariables, type EmailEnvoi, type EmailTemplate } from '../../hooks/useEmailTemplates'
import { UtiliserTemplateModale } from './UtiliserTemplateModale'
import { Modale } from '../ui/Modale'
import { Section } from '../ui/Section'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur, MessageInfo, MessageSucces } from '../ui/Etats'
import { Icone } from '../ui/Icones'
import { champStyle, etiquetteStyle } from '../ui/Champ'
import { boutonDangerStyle, boutonNeutreStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'

/* Édition d'un modèle, et création d'un nouveau (demande client du 2026-10-01 : « rajoute la
   possibilité de créer un nouveau mail »). Un modèle créé ici n'a pas de `reference` : seules les
   22 entrées du document en portent une, parce que ce sont elles que les envois automatiques
   retrouvent par ce numéro. */
function EditerTemplateModale({
  template,
  onFermer,
  onEnregistre,
}: {
  template: EmailTemplate | null
  onFermer: () => void
  onEnregistre: () => void
}) {
  const { profile } = useProfileContext()
  const [nom, setNom] = useState(template?.nom ?? '')
  const [categorie, setCategorie] = useState(template?.categorie ?? 'Mes modèles')
  const [objet, setObjet] = useState(template?.objet ?? '')
  const [corps, setCorps] = useState(template?.corps ?? '')
  const [quand, setQuand] = useState(template?.quand ?? '')
  const [pieceJointe, setPieceJointe] = useState(template?.piece_jointe_attendue ?? '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function enregistrer() {
    if (!nom.trim() || !objet.trim() || !corps.trim()) return
    setEnCours(true)
    setErreur(null)
    const ligne = {
      etablissement_id: profile!.etablissement_id,
      categorie: categorie.trim() || 'Mes modèles',
      nom: nom.trim(),
      objet: objet.trim(),
      corps: corps.trim(),
      quand: quand.trim() || null,
      piece_jointe_attendue: pieceJointe.trim() || null,
    }
    const { error } = template
      ? await supabase.from('email_templates').update(ligne).eq('id', template.id)
      : await supabase.from('email_templates').insert({ ...ligne, ordre: 900 })
    setEnCours(false)
    if (error) {
      setErreur(`L'enregistrement a échoué : ${error.message}`)
      return
    }
    onEnregistre()
  }

  return (
    <Modale titre={template ? `Modifier « ${template.nom} »` : 'Nouveau modèle d’e-mail'} onFermer={onFermer} largeurMax={720} fermetureExterieureDesactivee>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <MessageInfo>
          Écrivez les champs à compléter entre doubles accolades, par exemple {'{{prenom}}'}. Ceux que l’application
          connaît ({'{{prenom}}'}) ou que vous avez réglés une fois pour toutes ({'{{lien_reservation}}'},{' '}
          {'{{orange_money}}'}…) se remplissent tout seuls à l’usage.
        </MessageInfo>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={etiquetteStyle}>Nom du modèle</span>
            <input value={nom} onChange={(e) => setNom(e.target.value)} style={champStyle} placeholder="Ex. Rappel de paiement" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={etiquetteStyle}>Catégorie</span>
            <input value={categorie} onChange={(e) => setCategorie(e.target.value)} style={champStyle} />
          </label>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={etiquetteStyle}>Objet</span>
          <input value={objet} onChange={(e) => setObjet(e.target.value)} style={champStyle} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={etiquetteStyle}>Corps du message</span>
          <textarea
            value={corps}
            onChange={(e) => setCorps(e.target.value)}
            rows={14}
            style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, fontSize: 13 }}
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={etiquetteStyle}>Quand l’utiliser (facultatif)</span>
            <input value={quand} onChange={(e) => setQuand(e.target.value)} style={champStyle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={etiquetteStyle}>Pièce jointe attendue (facultatif)</span>
            <input value={pieceJointe} onChange={(e) => setPieceJointe(e.target.value)} style={champStyle} placeholder="Ex. La brochure" />
          </label>
        </div>

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onFermer} style={boutonNeutreStyle}>
            Annuler
          </button>
          <button
            type="button"
            onClick={enregistrer}
            disabled={enCours || !nom.trim() || !objet.trim() || !corps.trim()}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, fontSize: 12.5, padding: '9px 18px', opacity: enCours ? 0.6 : 1 }}
          >
            {enCours ? 'Enregistrement…' : 'Enregistrer le modèle'}
          </button>
        </div>
      </div>
    </Modale>
  )
}

/* Réglages des constantes (0093) : l'admin les saisit une fois, elles alimentent ensuite tous les
   aperçus ET les envois automatiques. Une constante vide fait tomber la ligne qui la porte. */
function ReglagesVariables({ onFermer }: { onFermer: () => void }) {
  const { variables, recharger } = useEmailVariables()
  const [brouillon, setBrouillon] = useState<Record<string, string>>({})
  const [enCours, setEnCours] = useState(false)
  const [succes, setSucces] = useState(false)

  async function enregistrer() {
    setEnCours(true)
    for (const [id, valeur] of Object.entries(brouillon)) {
      await supabase.from('email_variables').update({ valeur: valeur.trim() || null }).eq('id', id)
    }
    setEnCours(false)
    setSucces(true)
    recharger()
  }

  return (
    <Modale titre="Liens et numéros réutilisés dans les e-mails" onFermer={onFermer} largeurMax={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        <MessageInfo>
          Renseignés une seule fois, ces éléments se glissent automatiquement dans tous les modèles qui les utilisent.
          Laissé vide, un élément fait disparaître la ligne qui le mentionne, plutôt que d’envoyer un lien manquant.
        </MessageInfo>

        {variables.map((v) => (
          <label key={v.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={etiquetteStyle}>{v.libelle}</span>
            <input
              value={brouillon[v.id] ?? v.valeur ?? ''}
              onChange={(e) => setBrouillon((b) => ({ ...b, [v.id]: e.target.value }))}
              style={champStyle}
              placeholder={`{{${v.cle}}}`}
            />
          </label>
        ))}

        {succes && <MessageSucces>Réglages enregistrés.</MessageSucces>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onFermer} style={boutonNeutreStyle}>
            Fermer
          </button>
          <button type="button" onClick={enregistrer} disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, fontSize: 12.5, padding: '9px 18px' }}>
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </Modale>
  )
}

export function TemplatesEmails() {
  const { parCategorie, loading, erreur, recharger } = useEmailTemplates()
  const { brouillons, historique, recharger: rechargerEnvois } = useEmailEnvois()
  const [utilise, setUtilise] = useState<EmailTemplate | null>(null)
  const [brouillonRepris, setBrouillonRepris] = useState<EmailEnvoi | null>(null)
  const [edite, setEdite] = useState<EmailTemplate | null>(null)
  const [creationOuverte, setCreationOuverte] = useState(false)
  const [reglagesOuverts, setReglagesOuverts] = useState(false)
  const [succes, setSucces] = useState<string | null>(null)

  function annoncer(message: string) {
    setSucces(message)
    window.setTimeout(() => setSucces(null), 4000)
  }

  async function supprimerBrouillon(id: string) {
    await supabase.from('email_envois').delete().eq('id', id)
    rechargerEnvois()
  }

  if (loading) return <EtatChargement lignes={4} hauteur={70} />
  if (erreur) return <MessageErreur>{erreur}</MessageErreur>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setCreationOuverte(true)} className="btn-shine" style={{ ...boutonPrimaireStyle, fontSize: 12.5, padding: '9px 16px' }}>
          <Icone nom="plus" taille={14} />
          Nouveau modèle
        </button>
        <button type="button" onClick={() => setReglagesOuverts(true)} style={boutonSecondaireStyle}>
          <Icone nom="parametres" taille={13} />
          Liens et numéros réutilisés
        </button>
      </div>

      {succes && <MessageSucces>{succes}</MessageSucces>}

      {brouillons.length > 0 && (
        <Section titre="Brouillons" description="Mails préparés et mis de côté, à reprendre et envoyer." compteur={brouillons.length}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {brouillons.map((b) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '11px 13px', borderRadius: 11, border: '1px solid rgba(233,207,148,.3)', background: 'rgba(233,207,148,.06)' }}>
                <span style={{ fontSize: 13, color: 'var(--ink)', flexGrow: 1, minWidth: 0 }}>{b.objet}</span>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {b.destinataires_profile_ids.length} destinataire{b.destinataires_profile_ids.length > 1 ? 's' : ''}
                </span>
                <button type="button" onClick={() => setBrouillonRepris(b)} style={boutonSecondaireStyle}>
                  Reprendre
                </button>
                <button type="button" onClick={() => supprimerBrouillon(b.id)} style={boutonDangerStyle}>
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {parCategorie.map(([categorie, templates]) => (
        <Section key={categorie} titre={categorie} compteur={templates.length}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {templates.map((t) => (
              <div
                key={t.id}
                className="card card-lift"
                style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '13px 15px' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexGrow: 1, minWidth: 200 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{t.nom}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{t.objet}</span>
                  {t.quand && <span style={{ fontSize: 11, color: 'var(--muted-2)', lineHeight: 1.45 }}>Quand : {t.quand}</span>}
                  {t.piece_jointe_attendue && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-gold, #e9cf94)' }}>
                      Pièce jointe : {t.piece_jointe_attendue}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
                  <button type="button" onClick={() => setEdite(t)} style={boutonNeutreStyle}>
                    Modifier
                  </button>
                  <button type="button" onClick={() => setUtilise(t)} className="btn-shine" style={{ ...boutonPrimaireStyle, fontSize: 12, padding: '7px 15px' }}>
                    Utiliser
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ))}

      {parCategorie.length === 0 && (
        <EtatVide icone="documents" titre="Aucun modèle" description="Créez votre premier modèle d’e-mail avec « Nouveau modèle »." />
      )}

      {historique.length > 0 && (
        <Section titre="Derniers envois" description="Ce qui est parti, à quelle adresse, et ce qui a échoué." compteur={historique.length}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {historique.slice(0, 15).map((e) => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 11px', borderRadius: 9, background: 'rgba(255,255,255,.03)' }}>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: e.statut === 'envoye' ? 'var(--accent-teal)' : 'var(--danger)' }}>
                  {e.statut === 'envoye' ? 'Envoyé' : 'Échec'}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flexGrow: 1, minWidth: 0 }}>{e.objet}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{e.destinataires_emails.join(', ')}</span>
                <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>
                  {new Date(e.envoye_le ?? e.created_at).toLocaleDateString('fr-FR')}
                </span>
                {e.erreur && <span style={{ fontSize: 11, color: 'var(--danger)', width: '100%' }}>{e.erreur}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {(utilise || brouillonRepris) && (
        <UtiliserTemplateModale
          template={utilise}
          brouillon={brouillonRepris}
          onFermer={() => {
            setUtilise(null)
            setBrouillonRepris(null)
          }}
          onEnvoye={(avertissement) => {
            setUtilise(null)
            setBrouillonRepris(null)
            annoncer(avertissement ? `E-mail envoyé. ${avertissement}` : 'E-mail envoyé.')
            rechargerEnvois()
          }}
          onEnregistre={() => rechargerEnvois()}
        />
      )}

      {(edite || creationOuverte) && (
        <EditerTemplateModale
          template={edite}
          onFermer={() => {
            setEdite(null)
            setCreationOuverte(false)
          }}
          onEnregistre={() => {
            setEdite(null)
            setCreationOuverte(false)
            annoncer('Modèle enregistré.')
            recharger()
          }}
        />
      )}

      {reglagesOuverts && <ReglagesVariables onFermer={() => setReglagesOuverts(false)} />}
    </div>
  )
}
