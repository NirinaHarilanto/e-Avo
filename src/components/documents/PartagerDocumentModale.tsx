import { useEffect, useMemo, useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { Modale } from '../ui/Modale'
import { Champ, champStyle, etiquetteStyle, LigneInfo } from '../ui/Champ'
import { SelecteurPersonnes } from '../ui/SelecteurPersonnes'
import { MessageAvertissement, MessageErreur, MessageInfo } from '../ui/Etats'
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
  /* TOUS les partages existants sur ce fichier, quel qu'en soit l'émetteur (policy
     `document_partages_lecteur_select`, 0113) — pas seulement les miens. C'est ce qui permet de
     savoir qui a déjà accès avant de partager, et d'afficher ensuite qui l'avait déjà. */
  const [partages, setPartages] = useState<Partage[]>([])
  /* Plusieurs destinataires d'un coup, façon Outlook — demande client du 2026-10-10 : « on doit
     pouvoir rajouter plusieurs personnes, comme l'ajout de plusieurs personnes dans la zone de
     destinataire d'un mail outlook ». Même composant que la création d'un rendez-vous
     (SelecteurPersonnes) : un nom tapé, une suggestion choisie, une pastille amovible. */
  const [destinataireIds, setDestinataireIds] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  /* Compte rendu affiché en pop-up après un partage (demande client du 2026-10-10) : qui vient
     d'obtenir l'accès, qui l'avait déjà — jamais de blocage silencieux. */
  const [resultat, setResultat] = useState<{ nouveaux: string[]; dejaPartages: string[] } | null>(null)

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

  /* Partages que J'AI émis, seuls ceux que je peux retirer (policy
     document_partages_emetteur_all, 0111) : `partages` contient désormais aussi ceux des AUTRES
     émetteurs (0113), qu'un bouton « Retirer » ici ne pourrait qu'échouer à supprimer. */
  const mesPartages = useMemo(() => partages.filter((p) => p.partage_par_profile_id === profile?.id), [partages, profile?.id])

  const nomDe = (id: string) => {
    const p = candidats?.find((c) => c.id === id)
    return p ? `${p.prenom ?? ''} ${p.nom ?? ''}`.trim() : 'Personne'
  }

  async function partager() {
    if (!profile || destinataireIds.length === 0) return
    setEnCours(true)
    setErreur(null)
    const motJoint = message.trim() || null

    /* Ne JAMAIS exclure personne des suggestions (demande client du 2026-10-10 : « il ne faut pas
       exclure les personnes des suggestions, il faut que toutes les personnes restent
       disponibles »). La distinction se fait ici, après coup : on ne partage qu'aux personnes qui
       n'ont pas encore accès, et on explique ensuite ce qui a été fait à qui — plutôt que de
       bloquer ou de masquer un choix possible. */
    const dejaPartageIds = new Set(partages.map((p) => p.destinataire_profile_id))
    const idsNouveaux = destinataireIds.filter((id) => !dejaPartageIds.has(id))
    const idsDejaPartages = destinataireIds.filter((id) => dejaPartageIds.has(id))
    const nomsNouveaux = idsNouveaux.map(nomDe)
    const nomsDejaPartages = idsDejaPartages.map(nomDe)

    if (idsNouveaux.length === 0) {
      // Tout le monde choisi avait déjà accès : rien à écrire, seulement à le dire.
      setEnCours(false)
      setDestinataireIds([])
      setResultat({ nouveaux: [], dejaPartages: nomsDejaPartages })
      return
    }

    const { error } = await supabase.from('document_partages').insert(
      idsNouveaux.map((destinataireProfileId) => ({
        document_id: document.id,
        destinataire_profile_id: destinataireProfileId,
        partage_par_profile_id: profile.id,
        message: motJoint,
      })),
    )
    setEnCours(false)
    if (error) {
      /* Filet pour une coïncidence pure (partage fait depuis un autre onglet entre le chargement
         de `partages` et ce clic) : le filtrage ci-dessus écarte déjà tout doublon connu, cette
         erreur ne devrait donc plus survenir en usage normal. */
      setErreur(
        error.code === '23505'
          ? 'Au moins une des personnes choisies a déjà ce fichier partagé entre-temps : la liste a été mise à jour, vérifiez les destinataires restants et réessayez.'
          : error.message,
      )
      await charger()
      return
    }

    setDestinataireIds([])
    setMessage('')
    setResultat({ nouveaux: nomsNouveaux, dejaPartages: nomsDejaPartages })
    await charger()
    onChange()
  }

  async function retirer(partage: Partage) {
    setErreur(null)
    const { error } = await supabase.from('document_partages').delete().eq('id', partage.id)
    if (error) {
      setErreur(error.message)
      return
    }
    await charger()
    onChange()
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
          <strong>Comment ça marche.</strong> Tapez un nom ci-dessous et choisissez-le dans les suggestions — comme
          dans la zone de destinataires d’un e-mail, vous pouvez en ajouter <strong>plusieurs</strong> avant de cliquer
          « Partager », même une personne qui a déjà accès : elle restera simplement inchangée, et vous le verrez
          dans le résumé affiché après coup. Le fichier ne bouge pas et n’est pas dupliqué : il reste là où il est
          rangé, et chaque personne y accède en lecture depuis son espace personnel, section{' '}
          <strong>Documents → Mes fichiers partagés</strong>, avec votre nom et le mot que vous aurez joint. Elle
          pourra le consulter et le télécharger, jamais le modifier ni le supprimer.
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

        {candidats === null ? (
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Chargement…</span>
        ) : candidats.length === 0 ? (
          <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>
            Aucune personne à qui partager pour le moment.
          </span>
        ) : (
          /* Personne n'est exclu des suggestions (demande client du 2026-10-10) : une personne qui
             a déjà accès reste proposable, volontairement — le tri entre « déjà partagé » et
             « nouveau » se fait après validation, jamais en l'empêchant de la choisir. */
          <SelecteurPersonnes
            etiquette="Partager avec"
            placeholder="Rechercher un nom ou un prénom…"
            candidats={candidats}
            selectionnes={destinataireIds}
            onChange={setDestinataireIds}
          />
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--border-soft)', paddingTop: 11 }}>
            {/* « Vos partages », pas « déjà partagé avec » : la liste ne montre que les lignes dont
                je suis l'émetteur — ce sont les seules que je peux retirer (policy 0059/0111) —,
                donc jamais le partage qu'une autre personne aurait fait du même fichier, même si je
                peux désormais LE VOIR (0113). */}
            <span style={{ ...etiquetteStyle, fontSize: 11 }}>Vos partages sur ce fichier</span>
            {mesPartages.map((p) => (
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

      {/* Pop-up de résultat (demande client du 2026-10-10) : jamais un blocage silencieux — on
          dit toujours ce qui vient de se passer, personne par personne. */}
      {resultat && (
        <Modale titre="Résultat du partage" onFermer={() => setResultat(null)} largeurMax={400}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {resultat.nouveaux.length === 0 && resultat.dejaPartages.length > 0 && (
              <MessageInfo>
                Tout le monde choisi avait déjà accès à ce fichier : rien n’a changé.
              </MessageInfo>
            )}
            {resultat.nouveaux.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ ...etiquetteStyle, fontSize: 11, color: 'var(--accent-teal)' }}>
                  Viennent d’obtenir l’accès
                </span>
                {resultat.nouveaux.map((nom) => (
                  <span key={nom} style={{ fontSize: 13, color: 'var(--ink)' }}>
                    {nom}
                  </span>
                ))}
              </div>
            )}
            {resultat.dejaPartages.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ ...etiquetteStyle, fontSize: 11 }}>Avaient déjà accès — inchangé</span>
                {resultat.dejaPartages.map((nom) => (
                  <span key={nom} style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {nom}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() => setResultat(null)}
              className="btn-shine"
              style={{ ...boutonPrimaireStyle, alignSelf: 'flex-end' }}
            >
              Fermer
            </button>
          </div>
        </Modale>
      )}
    </Modale>
  )
}
