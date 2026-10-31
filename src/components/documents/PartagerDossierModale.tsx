import { useEffect, useMemo, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { Modale } from '../ui/Modale'
import { Champ, champStyle, etiquetteStyle } from '../ui/Champ'
import { SelecteurPersonnes } from '../ui/SelecteurPersonnes'
import { MessageAvertissement, MessageErreur, MessageInfo } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'

type Dossier = Database['public']['Tables']['document_dossiers']['Row']
type Partage = Database['public']['Tables']['document_dossier_partages']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Niveau = 'lecture' | 'ecriture'

/* Partage d'un DOSSIER — demande client du 2026-10-31 : « la possibilité de partager une vue ou
   vue ET écriture d'un dossier avec une ou plusieurs personnes de l'application HOC ».

   Ce qui le distingue du partage d'un fichier (PartagerDocumentModale) : il porte sur un
   contenant, donc sur ses sous-dossiers et sur ce qui y sera déposé demain, et il peut accorder
   le droit d'y écrire. Le dossier ne se duplique pas — il apparaît chez le destinataire dans
   « Partagés avec moi », comme un dossier réseau monté dans son explorateur. */
export function PartagerDossierModale({
  dossier,
  onFermer,
  onChange,
}: {
  dossier: Dossier
  onFermer: () => void
  onChange: () => void
}) {
  const { profile } = useProfileContext()
  const [candidats, setCandidats] = useState<Profile[] | null>(null)
  const [partages, setPartages] = useState<Partage[]>([])
  const [destinataireIds, setDestinataireIds] = useState<string[]>([])
  const [niveau, setNiveau] = useState<Niveau>('lecture')
  const [message, setMessage] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function charger() {
    const [{ data: personnes }, { data: lignes }] = await Promise.all([
      supabase.from('profiles').select('*').eq('status', 'approved').order('nom'),
      supabase.from('document_dossier_partages').select('*').eq('dossier_id', dossier.id),
    ])
    setCandidats((personnes ?? []).filter((p) => p.id !== profile?.id))
    setPartages(lignes ?? [])
  }

  useEffect(() => {
    charger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier.id])

  const mesPartages = useMemo(
    () => partages.filter((p) => p.partage_par_profile_id === profile?.id),
    [partages, profile?.id],
  )

  const nomDe = (id: string) => {
    const p = candidats?.find((c) => c.id === id)
    return p ? `${p.prenom ?? ''} ${p.nom ?? ''}`.trim() : 'Personne'
  }

  async function partager() {
    if (!profile || destinataireIds.length === 0) return
    setEnCours(true)
    setErreur(null)

    /* `upsert` et non `insert` : repartager à quelqu'un qui a déjà le dossier n'est pas une
       erreur à signaler, c'est un CHANGEMENT DE NIVEAU — passer quelqu'un de la vue à l'écriture
       se fait exactement par ce geste. La contrainte unique (dossier, destinataire) garantit
       qu'il n'y a jamais deux lignes contradictoires pour une même personne. */
    const { error } = await supabase.from('document_dossier_partages').upsert(
      destinataireIds.map((destinataireProfileId) => ({
        dossier_id: dossier.id,
        destinataire_profile_id: destinataireProfileId,
        partage_par_profile_id: profile.id,
        niveau,
        message: message.trim() || null,
      })),
      { onConflict: 'dossier_id,destinataire_profile_id' },
    )
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setDestinataireIds([])
    setMessage('')
    await charger()
    onChange()
  }

  async function retirer(partage: Partage) {
    setErreur(null)
    const { error } = await supabase.from('document_dossier_partages').delete().eq('id', partage.id)
    if (error) {
      setErreur(error.message)
      return
    }
    await charger()
    onChange()
  }

  return (
    <Modale titre={`Partager « ${dossier.nom} »`} onFermer={onFermer} largeurMax={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <MessageInfo>
          Le dossier reste à sa place : il n’est ni déplacé ni dupliqué. Les personnes choisies le retrouveront dans
          leur espace <strong>Documents → Partagés avec moi</strong>, avec <strong>tout ce qu’il contient</strong>, y
          compris ses sous-dossiers et les fichiers que vous y ajouterez plus tard.
        </MessageInfo>

        {dossier.proprietaire_profile_id !== profile?.id && (
          <MessageAvertissement>
            Ce dossier n’est pas le vôtre. Vous pouvez en ouvrir la vue à quelqu’un, mais son propriétaire reste seul
            maître de son rangement.
          </MessageAvertissement>
        )}

        {candidats === null ? (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Chargement…</span>
        ) : (
          <SelecteurPersonnes
            etiquette="Partager avec"
            placeholder="Rechercher un nom ou un prénom…"
            candidats={candidats}
            selectionnes={destinataireIds}
            onChange={setDestinataireIds}
          />
        )}

        <Champ label="Droit accordé">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ChoixNiveau
              valeur="lecture"
              actuel={niveau}
              onChoisir={setNiveau}
              titre="Vue seule"
              description="Consulter et télécharger ce qui s’y trouve. Rien ne peut y être ajouté ni modifié."
            />
            <ChoixNiveau
              valeur="ecriture"
              actuel={niveau}
              onChoisir={setNiveau}
              titre="Vue et écriture"
              description="En plus : déposer des fichiers et créer des sous-dossiers dedans. Renommer ou supprimer le dossier lui-même reste réservé à son propriétaire."
            />
          </div>
        </Champ>

        <Champ label="Mot joint (facultatif)">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="Ex. voici les supports de la classe de 6e"
            style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Champ>

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onFermer} style={{ ...boutonNeutreStyle, flexGrow: 1 }}>
            Fermer
          </button>
          <button
            onClick={partager}
            disabled={enCours || destinataireIds.length === 0}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours || destinataireIds.length === 0 ? 0.6 : 1 }}
          >
            {enCours
              ? 'Partage…'
              : destinataireIds.length > 1
                ? `Partager avec ${destinataireIds.length} personnes`
                : 'Partager'}
          </button>
        </div>

        {mesPartages.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, borderTop: '1px solid var(--border-soft)', paddingTop: 11 }}>
            <span style={{ ...etiquetteStyle, fontSize: 11 }}>Vos partages sur ce dossier</span>
            {mesPartages.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flexGrow: 1, minWidth: 0 }}>
                  {p.destinataire_nom || nomDe(p.destinataire_profile_id)}
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: p.niveau === 'ecriture' ? 'var(--accent-teal)' : 'var(--muted)' }}>
                    {p.niveau === 'ecriture' ? 'Vue et écriture' : 'Vue seule'}
                  </span>
                </span>
                <button
                  onClick={() => retirer(p)}
                  style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--danger)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Retirer
                </button>
              </div>
            ))}
            <span style={{ fontSize: 11, color: 'var(--muted-2)', lineHeight: 1.5 }}>
              Pour changer le droit de quelqu’un, repartagez-lui le dossier avec le niveau voulu : son accès est mis à
              jour, sans ligne en double.
            </span>
          </div>
        )}
      </div>
    </Modale>
  )
}

function ChoixNiveau({
  valeur,
  actuel,
  onChoisir,
  titre,
  description,
}: {
  valeur: Niveau
  actuel: Niveau
  onChoisir: (n: Niveau) => void
  titre: string
  description: string
}) {
  const actif = actuel === valeur
  return (
    <button
      type="button"
      onClick={() => onChoisir(valeur)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        textAlign: 'left',
        padding: '10px 12px',
        borderRadius: 11,
        border: `1px solid ${actif ? 'var(--accent-blue)' : 'var(--border)'}`,
        background: actif ? 'color-mix(in srgb, var(--accent-blue) 8%, transparent)' : 'var(--surface)',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <span
        aria-hidden
        style={{
          marginTop: 2,
          width: 15,
          height: 15,
          borderRadius: 999,
          flexShrink: 0,
          border: `2px solid ${actif ? 'var(--accent-blue)' : 'var(--border-fort, var(--muted-2))'}`,
          background: actif ? 'var(--accent-blue)' : 'transparent',
          boxShadow: actif ? 'inset 0 0 0 2.5px var(--surface)' : 'none',
        }}
      />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: actif ? 'var(--accent-blue)' : 'var(--ink)' }}>{titre}</span>
        <span style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--muted)' }}>{description}</span>
      </span>
    </button>
  )
}
