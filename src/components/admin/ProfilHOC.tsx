import { useEffect, useState, type FormEvent } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useAdmins } from '../../hooks/useAdmins'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { Section } from '../ui/Section'
import { Champ, champStyle, etiquetteStyle } from '../ui/Champ'
import { EtatChargement, MessageErreur, MessageSucces } from '../ui/Etats'
import { boutonDangerStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'
import { FormulaireInvitation } from '../shared/FormulaireInvitation'

type Etablissement = Database['public']['Tables']['etablissements']['Row']

/* Section « Profil HOC » — demande client du 2026-10-05, au même niveau de navigation que
   Contrats/Paiements/Facturation (voir AdminLayout.tsx). Deux blocs qui vivent ensemble ici
   plutôt que dans deux écrans séparés : l'identité de l'établissement (utilisée sur les
   documents) et l'équipe d'administrateurs qui en a la charge — les deux relèvent de « qui est
   Hari Online Club et qui le fait tourner », et aucun des deux n'avait de place naturelle dans
   Paramètres (resté dédié aux réglages de réservation/cours collectifs/relances). */
export function ProfilHOC() {
  return (
    <AdminLayout actif="Profil HOC">
      <EnTetePage
        titre="Profil HOC"
        description="L'identité administrative de l'établissement — reprise sur vos factures, devis, reçus et contrats — et l'équipe qui gère cet espace admin."
      />

      <GuidePage
        id="admin-profil-hoc"
        etapes={[
          <>
            Ces informations sont <strong>publiques</strong> (visibles sur votre page vitrine, comme votre nom
            d'établissement l'est déjà) — à l'exception du <strong>CIN de la directrice</strong>, qui reste
            strictement réservé à cet écran et n'apparaît jamais sur un document.
          </>,
          <>
            Une fois enregistrées, elles sont disponibles comme <strong>variables</strong> dans vos modèles de
            contrat (page Contrats), et affichées automatiquement sous l'en-tête de chaque facture, devis et reçu.
          </>,
          <>
            Tous les administrateurs listés plus bas ont <strong>exactement les mêmes droits</strong> sur ce même
            espace admin — même agenda, mêmes accès. Il n'y a pas de rôle « principal » parmi eux.
          </>,
        ]}
      />

      <IdentiteEtablissement />
      <EquipeAdmins />
    </AdminLayout>
  )
}

function IdentiteEtablissement() {
  const { profile } = useProfileContext()
  const [etablissement, setEtablissement] = useState<Etablissement | null>(null)
  const [cinDirectrice, setCinDirectrice] = useState('')
  const [loading, setLoading] = useState(true)
  const [champs, setChamps] = useState({
    nom: '',
    directrice: '',
    adresse: '',
    telephone: '',
    email: '',
    site_web: '',
    nif: '',
    stat: '',
  })
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enregistre, setEnregistre] = useState(false)

  useEffect(() => {
    if (!profile) return
    Promise.all([
      supabase.from('etablissements').select('*').eq('id', profile.etablissement_id).maybeSingle(),
      supabase.from('etablissement_identite_privee').select('*').eq('etablissement_id', profile.etablissement_id).maybeSingle(),
    ]).then(([{ data: etab }, { data: identite }]) => {
      setEtablissement(etab)
      setChamps({
        nom: etab?.nom ?? '',
        directrice: etab?.directrice ?? '',
        adresse: etab?.adresse ?? '',
        telephone: etab?.telephone ?? '',
        email: etab?.email ?? '',
        site_web: etab?.site_web ?? '',
        nif: etab?.nif ?? '',
        stat: etab?.stat ?? '',
      })
      setCinDirectrice(identite?.cin_directrice ?? '')
      setLoading(false)
    })
  }, [profile])

  function majChamp(cle: keyof typeof champs) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setChamps((c) => ({ ...c, [cle]: e.target.value }))
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    if (!etablissement || !profile) return
    if (!champs.nom.trim()) {
      setErreur('Le nom de l’établissement est obligatoire.')
      return
    }
    setEnregistrement(true)
    setErreur(null)
    setEnregistre(false)

    const [{ error: erreurEtab }, { error: erreurIdentite }] = await Promise.all([
      supabase
        .from('etablissements')
        .update({
          nom: champs.nom.trim(),
          directrice: champs.directrice.trim() || null,
          adresse: champs.adresse.trim() || null,
          telephone: champs.telephone.trim() || null,
          email: champs.email.trim() || null,
          site_web: champs.site_web.trim() || null,
          nif: champs.nif.trim() || null,
          stat: champs.stat.trim() || null,
        })
        .eq('id', etablissement.id),
      supabase
        .from('etablissement_identite_privee')
        .upsert({ etablissement_id: etablissement.id, cin_directrice: cinDirectrice.trim() || null }, { onConflict: 'etablissement_id' }),
    ])
    setEnregistrement(false)
    if (erreurEtab || erreurIdentite) {
      setErreur(erreurEtab?.message ?? erreurIdentite?.message ?? 'Échec de l’enregistrement.')
      return
    }
    setEnregistre(true)
  }

  if (loading) return <EtatChargement lignes={2} hauteur={200} />

  return (
    <Section titre="Identité de l'établissement" description="Utilisée sur vos factures, devis, reçus et contrats, et disponible comme variable dans vos modèles.">
      <form onSubmit={enregistrer} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Champ label="Nom de l'établissement" obligatoire style={{ flexGrow: 1, minWidth: 220 }}>
            <input required value={champs.nom} onChange={majChamp('nom')} style={champStyle} />
          </Champ>
          <Champ label="Directrice" aide="Nom complet — apparaît sur les documents qui le mentionnent." style={{ flexGrow: 1, minWidth: 220 }}>
            <input value={champs.directrice} onChange={majChamp('directrice')} style={champStyle} />
          </Champ>
        </div>

        <Champ label="Adresse" style={{ flexGrow: 1 }}>
          <input value={champs.adresse} onChange={majChamp('adresse')} style={champStyle} />
        </Champ>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Champ label="Téléphone" style={{ flexGrow: 1, minWidth: 180 }}>
            <input value={champs.telephone} onChange={majChamp('telephone')} style={champStyle} />
          </Champ>
          <Champ label="E-mail" style={{ flexGrow: 1, minWidth: 180 }}>
            <input type="email" value={champs.email} onChange={majChamp('email')} style={champStyle} />
          </Champ>
          <Champ label="Site web" style={{ flexGrow: 1, minWidth: 180 }}>
            <input type="url" placeholder="https://www.harionlineclub.app" value={champs.site_web} onChange={majChamp('site_web')} style={champStyle} />
          </Champ>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Champ label="NIF" style={{ flexGrow: 1, minWidth: 160 }}>
            <input value={champs.nif} onChange={majChamp('nif')} style={champStyle} />
          </Champ>
          <Champ label="STAT" style={{ flexGrow: 1, minWidth: 160 }}>
            <input value={champs.stat} onChange={majChamp('stat')} style={champStyle} />
          </Champ>
          <Champ
            label="CIN de la directrice"
            aide="Jamais affiché sur un document ni sur la page publique — réservé à cet écran."
            style={{ flexGrow: 1, minWidth: 160 }}
          >
            <input value={cinDirectrice} onChange={(e) => setCinDirectrice(e.target.value)} style={champStyle} />
          </Champ>
        </div>

        {erreur && <MessageErreur>{erreur}</MessageErreur>}
        {enregistre && <MessageSucces>Profil enregistré.</MessageSucces>}

        <button
          type="submit"
          disabled={enregistrement}
          className="btn-shine"
          style={{ ...boutonPrimaireStyle, alignSelf: 'flex-start', fontSize: 13.5, padding: '11px 20px', opacity: enregistrement ? 0.7 : 1 }}
        >
          {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </Section>
  )
}

function EquipeAdmins() {
  const { profile, session } = useProfileContext()
  const { admins, loading, recharger } = useAdmins()
  const [formulaireOuvert, setFormulaireOuvert] = useState(false)
  const [enCoursId, setEnCoursId] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  async function retirer(id: string, nomComplet: string) {
    if (!session) return
    if (!window.confirm(`Retirer l’accès admin de ${nomComplet} ? Cette personne ne pourra plus se connecter à cet espace.`)) return
    setEnCoursId(id)
    setErreur(null)
    const reponse = await fetch('/api/admin/supprimer-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ profileId: id }),
    })
    setEnCoursId(null)
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => null)
      setErreur(corps?.error ?? 'Le retrait a échoué.')
      return
    }
    recharger()
  }

  return (
    <Section
      titre="Administrateurs"
      description="Toute personne listée ici a exactement les mêmes droits sur cet espace admin : même agenda, mêmes accès, aucune hiérarchie entre administrateurs."
      actions={
        <button onClick={() => setFormulaireOuvert((v) => !v)} className="btn-shine" style={boutonPrimaireStyle}>
          <Icone nom="plus" taille={14} />
          {formulaireOuvert ? 'Fermer' : 'Inviter un administrateur'}
        </button>
      }
    >
      {formulaireOuvert && (
        <FormulaireInvitation
          endpoint="/api/admin/inviter-admin"
          roleLabel="un administrateur"
          onTermine={() => {
            setFormulaireOuvert(false)
            recharger()
          }}
        />
      )}

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {loading ? (
        <EtatChargement lignes={2} hauteur={56} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {admins.map((admin) => (
            <div
              key={admin.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '11px 14px', borderRadius: 11, border: '1px solid var(--border-soft)', background: 'rgba(255,255,255,.03)' }}
            >
              <span style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--accent-blue-gradient)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                {(admin.prenom?.[0] ?? '').toUpperCase()}
                {(admin.nom?.[0] ?? '').toUpperCase()}
              </span>
              <div style={{ flexGrow: 1, minWidth: 160 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                  {admin.prenom} {admin.nom}
                  {admin.id === profile?.id && <span style={{ ...etiquetteStyle, fontSize: 10, marginLeft: 8 }}>(vous)</span>}
                </span>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{admin.email}</div>
              </div>
              {admin.id !== profile?.id && (
                <button
                  type="button"
                  onClick={() => retirer(admin.id, `${admin.prenom} ${admin.nom}`)}
                  disabled={enCoursId === admin.id}
                  style={{ ...boutonDangerStyle, fontSize: 11.5, padding: '6px 12px' }}
                >
                  {enCoursId === admin.id ? 'Retrait…' : 'Retirer'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}
