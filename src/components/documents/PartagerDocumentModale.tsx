import { useEffect, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { Modale } from '../ui/Modale'
import { Champ, champStyle, etiquetteStyle, LigneInfo } from '../ui/Champ'
import { MessageAvertissement, MessageErreur, MessageInfo, MessageSucces } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'

type Document = Database['public']['Tables']['documents']['Row']
type Partage = Database['public']['Tables']['document_partages']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']

/* Partage de la vue d'un fichier avec une autre personne — demande client du 2026-09-21.
   Le fichier ne bouge pas : il reste dans l'espace de son propriétaire, et le destinataire le
   retrouve dans son dossier « Mes fichiers partagés » avec la mention de qui le lui a transmis.

   Les destinataires proposés sont exactement les personnes que l'utilisateur peut déjà voir
   dans `profiles` : pour un élève, son professeur et son binôme ; pour un professeur, ses
   élèves ; pour l'administration, tout l'établissement (policies 0004/0017/0054). C'est une
   limite assumée plutôt qu'un oubli — ouvrir l'annuaire complet à tout le monde pour alimenter
   ce sélecteur serait une régression de confidentialité bien plus large que le service rendu. */
export function PartagerDocumentModale({
  document,
  onFermer,
  onChange,
}: {
  document: Document
  onFermer: () => void
  onChange: () => void
}) {
  const { profile } = useProfileContext()
  const [candidats, setCandidats] = useState<Profile[] | null>(null)
  const [partages, setPartages] = useState<Partage[]>([])
  const [destinataireId, setDestinataireId] = useState('')
  const [message, setMessage] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)

  async function charger() {
    const [{ data: personnes }, { data: lignes }] = await Promise.all([
      supabase.from('profiles').select('*').eq('status', 'approved').order('nom'),
      supabase.from('document_partages').select('*').eq('document_id', document.id),
    ])
    setCandidats((personnes ?? []).filter((p) => p.id !== profile?.id))
    setPartages(lignes ?? [])
  }

  useEffect(() => {
    charger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.id])

  async function partager() {
    if (!profile || !destinataireId) return
    setEnCours(true)
    setErreur(null)
    setSucces(null)
    const { error } = await supabase.from('document_partages').insert({
      document_id: document.id,
      destinataire_profile_id: destinataireId,
      partage_par_profile_id: profile.id,
      message: message.trim() || null,
    })
    setEnCours(false)
    if (error) {
      setErreur(error.code === '23505' ? 'Ce fichier est déjà partagé avec cette personne.' : error.message)
      return
    }
    setDestinataireId('')
    setMessage('')
    setSucces('Partage enregistré : la personne verra ce fichier dans « Mes fichiers partagés ».')
    await charger()
    onChange()
  }

  async function retirer(partage: Partage) {
    setErreur(null)
    setSucces(null)
    const { error } = await supabase.from('document_partages').delete().eq('id', partage.id)
    if (error) {
      setErreur(error.message)
      return
    }
    await charger()
    onChange()
  }

  const nomDe = (id: string) => {
    const p = candidats?.find((c) => c.id === id)
    return p ? `${p.prenom ?? ''} ${p.nom ?? ''}`.trim() : 'Personne'
  }

  return (
    <Modale titre="Partager ce fichier" onFermer={onFermer} largeurMax={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        <LigneInfo label="Fichier" valeur={document.nom_original} />

        {/* Instruction de guidage (demande client du 2026-10-10 : « rajoute l'instruction pour
            guider l'utilisateur ») : le malentendu à dissiper est que le partage DÉPLACE ou
            DUPLIQUE le fichier. Il n'en fait rien — seule sa vue est ouverte — et c'est aussi ce
            qui explique où le destinataire doit aller le chercher, question posée à chaque fois. */}
        <MessageInfo>
          <strong>Comment ça marche.</strong> Choisissez une personne ci-dessous, puis cliquez « Partager ». Le fichier
          ne bouge pas et n’est pas dupliqué : il reste là où il est rangé, et la personne y accède en lecture depuis son
          espace personnel, section <strong>Documents → Mes fichiers partagés</strong>, avec votre nom et le mot que vous
          aurez joint. Elle pourra le consulter et le télécharger, jamais le modifier ni le supprimer. Vous pouvez
          retirer votre partage à tout moment, en bas de cette fenêtre.
        </MessageInfo>

        {/* Tout fichier visible est partageable depuis le 2026-10-10 (0111), y compris dans
            l'espace d'autrui : le dire, parce que la personne qui partage n'est alors pas celle qui
            pourra le supprimer, et que le destinataire verra le nom de l'émetteur, pas celui du
            propriétaire. */}
        {document.owner_profile_id !== profile?.id && !document.etablissement_wide && (
          <MessageAvertissement>
            Ce fichier n’est pas rangé dans votre espace. Vous en ouvrez la vue à quelqu’un, mais son propriétaire
            reste seul maître du fichier : s’il le supprime, le partage disparaît avec lui.
          </MessageAvertissement>
        )}

        {document.etablissement_wide && (
          <MessageAvertissement>
            Ce document est déjà visible par tout l’établissement : le partager ne donne aucun droit de plus. C’est
            seulement un moyen de le signaler nommément à quelqu’un, qui le retrouvera dans « Mes fichiers partagés ».
          </MessageAvertissement>
        )}

        <Champ label="Partager avec">
          <select value={destinataireId} onChange={(e) => setDestinataireId(e.target.value)} style={champStyle}>
            <option value="">{candidats === null ? 'Chargement…' : 'Choisir une personne…'}</option>
            {(candidats ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.prenom} {p.nom}
              </option>
            ))}
          </select>
        </Champ>

        {candidats !== null && candidats.length === 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>
            Aucune personne à qui partager pour le moment.
          </span>
        )}

        <Champ label="Mot joint (facultatif)">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="Ex. voici le support dont nous avons parlé"
            style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Champ>

        {erreur && <MessageErreur>{erreur}</MessageErreur>}
        {succes && <MessageSucces>{succes}</MessageSucces>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onFermer} style={{ ...boutonNeutreStyle, flexGrow: 1 }}>
            Fermer
          </button>
          <button
            onClick={partager}
            disabled={enCours || !destinataireId}
            className="btn-shine"
            style={{ ...boutonPrimaireStyle, flexGrow: 1, opacity: enCours || !destinataireId ? 0.6 : 1 }}
          >
            {enCours ? 'Partage…' : 'Partager'}
          </button>
        </div>

        {partages.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--border-soft)', paddingTop: 11 }}>
            {/* « Vos partages », pas « déjà partagé avec » : la liste ne montre que les lignes dont
                je suis l'émetteur (policy 0059/0111), donc jamais le partage qu'une autre personne
                aurait fait du même fichier. Le titre d'origine laissait croire à un inventaire
                complet. */}
            <span style={{ ...etiquetteStyle, fontSize: 11 }}>Vos partages sur ce fichier</span>
            {partages.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flexGrow: 1 }}>
                  {nomDe(p.destinataire_profile_id)}
                </span>
                <button
                  onClick={() => retirer(p)}
                  style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--danger)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Retirer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modale>
  )
}
