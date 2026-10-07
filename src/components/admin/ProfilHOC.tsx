import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useAdmins } from '../../hooks/useAdmins'
import { useEtablissement } from '../../hooks/useEtablissement'
import { supabase } from '../../lib/supabaseClient'
import { declencherSynchroLocale } from '../../lib/synchro'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { Section } from '../ui/Section'
import { Champ, champStyle, etiquetteStyle } from '../ui/Champ'
import { EtatChargement, MessageErreur, MessageSucces } from '../ui/Etats'
import { boutonDangerStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'
import { FormulaireInvitation } from '../shared/FormulaireInvitation'

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
  /* Même source que partout ailleurs dans l'application (ProfileContext, FactureImprimable,
     DevisImprimable, ContratImprimable, LancerApprobationContrat…) — demande client du
     2026-10-05 : « quand les informations dans Profil HOC sont mises à jour, les informations
     dans les modèles de contrat et dans toute l'application devraient se mettre à jour
     instantanément ». Une requête bespoke ici (comme avant) lirait les mêmes données sans
     jamais partager le cache dont dépendent tous les autres écrans. */
  const etablissement = useEtablissement(profile?.etablissement_id)
  const [cinDirectrice, setCinDirectrice] = useState('')
  const [chargementCin, setChargementCin] = useState(true)
  const [champs, setChamps] = useState({
    nom: '',
    directrice: '',
    adresse: '',
    telephone: '',
    email: '',
    site_web: '',
    nif: '',
    stat: '',
    forme_juridique: '',
  })
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enregistre, setEnregistre] = useState(false)

  /* Le formulaire ne se recale sur `etablissement` qu'UNE fois, à son premier chargement —
     sinon un rafraîchissement du cache déclenché pendant la frappe (par exemple par la synchro
     décrite plus bas, si un autre admin enregistre en même temps) effacerait ce que la personne
     est en train de taper. */
  const champsInitialises = useRef(false)
  useEffect(() => {
    if (!etablissement || champsInitialises.current) return
    champsInitialises.current = true
    setChamps({
      nom: etablissement.nom ?? '',
      directrice: etablissement.directrice ?? '',
      adresse: etablissement.adresse ?? '',
      telephone: etablissement.telephone ?? '',
      email: etablissement.email ?? '',
      site_web: etablissement.site_web ?? '',
      nif: etablissement.nif ?? '',
      stat: etablissement.stat ?? '',
      forme_juridique: etablissement.forme_juridique ?? '',
    })
  }, [etablissement])

  // Le CIN, lui, n'a pas d'équivalent ailleurs dans l'app (table admin seul, jamais affichée
  // sur un document — voir la migration 0097) : pas besoin du cache partagé pour cette partie.
  useEffect(() => {
    if (!profile) return
    supabase
      .from('etablissement_identite_privee')
      .select('*')
      .eq('etablissement_id', profile.etablissement_id)
      .maybeSingle()
      .then(({ data }) => {
        setCinDirectrice(data?.cin_directrice ?? '')
        setChargementCin(false)
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
          forme_juridique: champs.forme_juridique.trim() || null,
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
    /* Le client Supabase (voir supabaseClient.ts) prévient déjà automatiquement les AUTRES
       onglets/navigateurs ouverts qu'une écriture vient d'avoir lieu — mais jamais celui-ci :
       `self: false` (useSynchroEtablissement.ts) part du principe que l'onglet qui écrit se
       recharge lui-même. `declencherSynchroLocale()` fait exactement ça ICI, tout de suite :
       elle rejoue la requête de chaque donnée actuellement affichée dans CET onglet, y compris
       le profil d'établissement partagé par toute l'application (ProfileContext.tsx) — c'est ce
       qui fait apparaître sans délai la nouvelle adresse/le nouveau NIF dans un contrat qu'on
       génère juste après, sans recharger la page. */
    declencherSynchroLocale()
  }

  if (!etablissement || chargementCin) return <EtatChargement lignes={2} hauteur={200} />

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
          <Champ
            label="Forme juridique"
            aide="Ex. Entreprise Individuelle, SARL…"
            style={{ flexGrow: 1, minWidth: 160 }}
          >
            <input value={champs.forme_juridique} onChange={majChamp('forme_juridique')} style={champStyle} />
          </Champ>
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
