import { useState } from 'react'
import type { CompteRenduComplet } from '../../hooks/useSessionReports'
import { supabase } from '../../lib/supabaseClient'
import { CompteRenduAffichage } from './CompteRenduAffichage'
import { formaterMinutes } from '../../lib/heures'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { Icone } from '../ui/Icones'
import { etiquetteStyle } from '../ui/Champ'

async function telechargerSupport(storagePath: string) {
  const { data } = await supabase.storage.from('documents').createSignedUrl(storagePath, 60)
  if (data) window.open(data.signedUrl, '_blank', 'noreferrer')
}

/* Liste pliable/dépliable des comptes rendus, un seul ouvert à la fois — extrait de
   PanneauComptesRendus (DocumentsAdmin.tsx, demande client du 2026-09-23) pour être réutilisable
   par les espaces professeur et étudiant (demande client du 2026-09-30 : « l'onglet Mes comptes
   rendus... pliable dépliable, dans chaque compte rendu, on devrait retrouver tous les détails de
   chaque séance »). Chaque en-tête affiche désormais aussi le type et la durée de la séance, pas
   seulement la date et les personnes — c'était déjà tout ce que `CompteRenduComplet` portait,
   simplement pas montré. `masquerProfesseur`/`masquerParticipants` : un professeur consultant SES
   PROPRES comptes rendus n'a pas besoin de se relire en en-tête, un élève n'a pas besoin de se
   relister lui-même parmi les participants de sa propre séance. */
export function ListeComptesRendus({
  comptesRendus,
  loading,
  erreur,
  titreVide,
  descriptionVide,
  masquerProfesseur = false,
  masquerParticipants = false,
  actionsParLigne,
}: {
  comptesRendus: CompteRenduComplet[]
  loading: boolean
  erreur?: string | null
  titreVide: string
  descriptionVide: string
  masquerProfesseur?: boolean
  masquerParticipants?: boolean
  /* Bouton(s) additionnel(s) par ligne (ex. suppression admin) — reçoit le compte rendu complet,
     rendu à côté du chevron d'ouverture. */
  actionsParLigne?: (item: CompteRenduComplet) => React.ReactNode
}) {
  const [ouvertId, setOuvertId] = useState<string | null>(null)

  if (loading) return <EtatChargement lignes={3} hauteur={78} />
  if (erreur) return <MessageErreur>{erreur}</MessageErreur>
  if (comptesRendus.length === 0) {
    return <EtatVide icone="documents" titre={titreVide} description={descriptionVide} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {comptesRendus.map(({ rapport, session, professeur, participants, supports }) => {
        const ouvert = ouvertId === rapport.id
        return (
          <div key={rapport.id} className="card card-lift" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setOuvertId(ouvert ? null : rapport.id)}
                aria-expanded={ouvert}
                style={{
                  flexGrow: 1,
                  minWidth: 0,
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  flexWrap: 'wrap',
                  color: 'inherit',
                  fontFamily: 'inherit',
                }}
              >
                <span className="brand-font" style={{ fontSize: 14, color: 'var(--ink)' }}>
                  {session ? new Date(session.debut).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Séance inconnue'}
                </span>
                {session && (
                  <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>
                    {session.type === 'individuel' ? 'Individuel' : 'Collectif'} · {formaterMinutes(session.duree_minutes)}
                  </span>
                )}
                {!masquerProfesseur && (
                  <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                    {professeur ? `${professeur.prenom} ${professeur.nom}` : 'Professeur inconnu'}
                  </span>
                )}
                {!masquerParticipants && (
                  <span style={{ fontSize: 12, color: 'var(--muted-2)' }}>
                    {participants.map((p) => `${p.prenom} ${p.nom}`).join(', ') || 'aucun participant'}
                  </span>
                )}
                <Icone
                  nom="chevron"
                  taille={14}
                  style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--muted)', transform: ouvert ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}
                />
              </button>
              {actionsParLigne && <div style={{ paddingRight: 16, flexShrink: 0 }}>{actionsParLigne({ rapport, session, professeur, participants, supports })}</div>}
            </div>
            {ouvert && (
              <div style={{ padding: '0 20px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <CompteRenduAffichage rapport={rapport} />
                {/* Supports de cours joints (0087, demande client du 2026-09-30) : visibles par
                    l'étudiant, le professeur et l'admin, chacun dans sa propre copie du fichier
                    (voir le commentaire de `supports` sur CompteRenduComplet). */}
                {supports.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* `var(--ink)`, pas `var(--muted)` : demande client du 2026-09-30, « rendre
                        les intitulés plus visibles pour qu'ils ne se mélangent pas avec les
                        autres informations » — voir le même correctif sur `etiquetteStyle`
                        (ui/Champ.tsx), dont ce libellé reprend maintenant les valeurs plutôt que
                        de les dupliquer. */}
                    <span style={{ ...etiquetteStyle, fontSize: 11 }}>
                      Support{supports.length > 1 ? 's' : ''} de cours
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {supports.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => telechargerSupport(d.storage_path)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', background: 'rgba(94,179,255,.08)', border: '1px solid rgba(94,179,255,.3)', borderRadius: 999, padding: '6px 12px', cursor: 'pointer' }}
                        >
                          <Icone nom="documents" taille={13} />
                          {d.nom_original}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
