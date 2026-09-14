import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PlateformeLayout } from '../layout/PlateformeLayout'
import { useAdminsEtablissement } from '../../hooks/useAdminsEtablissement'
import { supabase } from '../../lib/supabaseClient'
import { FormulaireInvitation } from '../shared/FormulaireInvitation'
import { EnTetePage, BoutonRetour } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { Section } from '../ui/Section'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'
import type { Database } from '../../types/database.types'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

export function EtablissementDetailPlateforme() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null)
  const [loadingEtablissement, setLoadingEtablissement] = useState(true)
  const { admins, loading: loadingAdmins, recharger } = useAdminsEtablissement(id)
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase
      .from('etablissements')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        setEtablissement(data)
        setLoadingEtablissement(false)
      })
  }, [id])

  return (
    <PlateformeLayout actif="Établissements">
      {loadingEtablissement ? (
        <EtatChargement lignes={2} hauteur={110} />
      ) : !etablissement ? (
        <MessageErreur>Établissement introuvable.</MessageErreur>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <EnTetePage
            avant={<BoutonRetour onClick={() => navigate('/plateforme/etablissements')} label="Tous les établissements" />}
            media={
              <span
                className="brand-font"
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 15,
                  background: etablissement.couleur_accent ?? 'var(--accent-gradient)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#1b1510',
                  fontSize: 15,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {etablissement.nom.slice(0, 2).toUpperCase()}
              </span>
            }
            titre={etablissement.nom}
            description={
              <>
                Page vitrine publique : <code>/e/{etablissement.slug}</code>
                {etablissement.specialite && ` · ${etablissement.specialite}`}
              </>
            }
          />

          <GuidePage
            id="plateforme-etablissement-detail"
            etapes={[
              <>
                Les <strong>administrateurs</strong> listés ici prennent la main sur l’établissement : élèves,
                professeurs, séances, paiements et contrats.
              </>,
              <>
                <strong>Ajouter un admin</strong> envoie une invitation par e-mail. La personne définit son propre mot
                de passe, vous n’en créez ni n’en transmettez aucun.
              </>,
              <>
                Un établissement sans administrateur est inutilisable : personne ne peut y inviter d’élèves ni de
                professeurs. C’est la première chose à faire après sa création.
              </>,
            ]}
          />

          <Section
            titre="Administrateurs"
            description="Les personnes autorisées à administrer cet établissement."
            compteur={admins.length}
            actions={
              <button onClick={() => setFormulaireOuvert((v) => !v)} className="btn-shine" style={boutonPrimaireStyle}>
                <Icone nom="plus" taille={15} />
                {formulaireOuvert ? 'Fermer' : 'Ajouter un admin'}
              </button>
            }
          >
            {formulaireOuvert && (
              <FormulaireInvitation
                endpoint="/api/plateforme/inviter-admin-etablissement"
                roleLabel="un admin"
                corpsSupplementaire={{ etablissementId: etablissement.id }}
                onTermine={() => {
                  setFormulaireOuvert(false)
                  recharger()
                }}
              />
            )}

            {loadingAdmins ? (
              <EtatChargement lignes={2} hauteur={44} />
            ) : admins.length === 0 ? (
              <EtatVide
                icone="professeurs"
                titre="Aucun administrateur"
                description="Cet établissement n’est pas encore exploitable. Invitez un administrateur pour qu’il puisse y créer des élèves, des professeurs et des séances."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {admins.map((admin) => (
                  <div key={admin.id} className="row-hl" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 6px', borderBottom: '1px solid var(--border-soft)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink)', flexGrow: 1, minWidth: 140 }}>
                      {admin.prenom} {admin.nom}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{admin.email}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}
    </PlateformeLayout>
  )
}
