import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlateformeLayout } from '../layout/PlateformeLayout'
import { useEtablissementsPlateforme } from '../../hooks/useEtablissementsPlateforme'
import { supabase } from '../../lib/supabaseClient'
import { Champ, champStyle } from '../ui/Champ'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

export function EtablissementsPlateforme() {
  const navigate = useNavigate()
  const { etablissements, loading, recharger } = useEtablissementsPlateforme()
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)

  return (
    <PlateformeLayout actif="Établissements">
      <EnTetePage
        titre="Établissements"
        description="Toutes les écoles hébergées sur la plateforme. Chaque établissement a sa page vitrine publique, ses propres administrateurs, et des données totalement cloisonnées des autres."
        actions={
          <button onClick={() => setFormulaireOuvert((v) => !v)} className="btn-shine" style={boutonPrimaireStyle}>
            <Icone nom="plus" taille={15} />
            {formulaireOuvert ? 'Fermer' : 'Nouvel établissement'}
          </button>
        }
      />

      <GuidePage
        id="plateforme-etablissements"
        etapes={[
          <>
            Créez l’établissement avec son nom et son <strong>slug</strong>, qui devient l’adresse de sa page vitrine
            publique : <code>/e/mon-etablissement</code>.
          </>,
          <>
            Ouvrez ensuite sa fiche pour y <strong>inviter un premier administrateur</strong>. C’est l’étape qui rend
            l’établissement réellement utilisable : sans administrateur, personne ne peut y inviter d’élèves ni de
            professeurs.
          </>,
          <>
            La <strong>couleur d’accent</strong> est facultative et ne teinte que la page vitrine publique. Les espaces
            de travail gardent la charte commune.
          </>,
        ]}
      />

      {formulaireOuvert && (
        <FormulaireCreationEtablissement
          onAnnuler={() => setFormulaireOuvert(false)}
          onCree={() => {
            setFormulaireOuvert(false)
            recharger()
          }}
        />
      )}

      {loading ? (
        <EtatChargement lignes={2} hauteur={120} />
      ) : etablissements.length === 0 ? (
        <EtatVide
          icone="etablissements"
          titre="Aucun établissement"
          description="Créez un premier établissement pour démarrer. Vous pourrez ensuite lui désigner un administrateur, qui prendra la main sur ses élèves, ses professeurs et sa facturation."
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {etablissements.map((etablissement) => (
            <button
              key={etablissement.id}
              onClick={() => navigate(`/plateforme/etablissements/${etablissement.id}`)}
              className="card card-lift"
              style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left', cursor: 'pointer', color: 'inherit' }}
            >
              <span
                className="brand-font"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: etablissement.couleur_accent ?? 'var(--accent-gradient)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#1b1510',
                  fontSize: 14,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {etablissement.nom.slice(0, 2).toUpperCase()}
              </span>
              <div style={{ minWidth: 0 }}>
                <span className="brand-font" style={{ fontSize: 15, color: 'var(--ink)' }}>
                  {etablissement.nom}
                </span>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  /e/{etablissement.slug}
                  {etablissement.specialite && ` · ${etablissement.specialite}`}
                </div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)' }}>
                Gérer ses administrateurs
                <Icone nom="chevron" taille={12} />
              </span>
            </button>
          ))}
        </div>
      )}
    </PlateformeLayout>
  )
}

function FormulaireCreationEtablissement({ onAnnuler, onCree }: { onAnnuler: () => void; onCree: () => void }) {
  const [nom, setNom] = useState('')
  const [slug, setSlug] = useState('')
  const [specialite, setSpecialite] = useState('')
  const [couleurAccent, setCouleurAccent] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function creer(e: FormEvent) {
    e.preventDefault()
    if (!nom || !slug) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('etablissements').insert({
      nom,
      slug,
      specialite: specialite || null,
      couleur_accent: couleurAccent || null,
    })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onCree()
  }

  return (
    <form onSubmit={creer} className="card" style={{ padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Champ label="Nom" obligatoire style={{ flexGrow: 1, minWidth: 180 }}>
          <input required value={nom} onChange={(e) => setNom(e.target.value)} style={champStyle} />
        </Champ>
        <Champ label="Slug" obligatoire aide="Adresse de la page vitrine : /e/…" style={{ minWidth: 170 }}>
          <input required value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="mon-etablissement" style={champStyle} />
        </Champ>
        <Champ label="Spécialité" aide="Affichée sur la vitrine. Facultatif." style={{ minWidth: 170 }}>
          <input value={specialite} onChange={(e) => setSpecialite(e.target.value)} style={champStyle} />
        </Champ>
        <Champ label="Couleur" aide="Code hexadécimal. Facultatif." style={{ width: 140 }}>
          <input value={couleurAccent} onChange={(e) => setCouleurAccent(e.target.value)} placeholder="#e9cf94" style={champStyle} />
        </Champ>
      </div>

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onAnnuler} style={{ ...boutonNeutreStyle, fontSize: 12.5, padding: '10px 16px' }}>
          Annuler
        </button>
        <button type="submit" disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, opacity: enCours ? 0.6 : 1 }}>
          {enCours ? 'Création…' : 'Créer'}
        </button>
      </div>
    </form>
  )
}
