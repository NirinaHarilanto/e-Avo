import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { DossierDocument } from '../../hooks/useDossiersDocuments'
import { Modale } from '../ui/Modale'
import { MessageErreur, MessageInfo } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

/* Déplacer un dossier dans un autre — demande client du 2026-11-01 : « rajoute la fonctionnalité
   Déplacer le dossier, qui permet de déplacer le dossier sélectionné dans un autre dossier
   existant de l'arborescence. Quand on clique dessus, un pop-up apparaît avec l'arborescence de
   dossiers existants INSTANTANÉMENT, l'utilisateur sélectionnera le dossier dans lequel le
   dossier sélectionné sera déplacé. »

   « Instantanément » : l'arborescence (`dossiers`) est déjà en mémoire dans ExplorateurDocuments
   au moment où on ouvre cette fenêtre — aucune requête, aucun chargement, elle s'affiche tout de
   suite.

   Le déplacement lui-même n'est qu'un `update parent_id` : `document_dossiers_avant_ecriture`
   (0058) protège déjà contre les deux pièges que ce geste ouvre — déplacer un dossier dans l'un de
   ses propres sous-dossiers (le trigger a prévu CE JOUR, en commentaire : « le cycle n'est pas
   atteignable depuis l'interface actuelle, mais le garde-fou coûte moins cher que le jour où
   quelqu'un ajoutera le déplacement » — c'est aujourd'hui) et déplacer vers l'espace d'une autre
   personne. Exclure ces destinations ici est donc un confort d'interface, pas une protection :
   même sans ce filtre, la base refuserait. */
export function DeplacerDossierModale({
  dossier,
  dossiers,
  titreRacine,
  onFermer,
  onChange,
}: {
  dossier: DossierDocument
  dossiers: DossierDocument[]
  titreRacine: string
  onFermer: () => void
  onChange: () => void
}) {
  const [destinationId, setDestinationId] = useState<string | null | undefined>(undefined)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  /* Interdits : le dossier lui-même, et tous ses descendants — un dossier ne peut pas finir
     contenu dans l'un de ses propres enfants. Calculé une fois, pas à chaque clic. */
  const interditIds = useMemo(() => {
    const interdits = new Set<string>([dossier.id])
    let frontiere = [dossier.id]
    for (let tour = 0; tour < 50 && frontiere.length > 0; tour += 1) {
      const enfants = dossiers.filter((d) => d.parent_id && frontiere.includes(d.parent_id)).map((d) => d.id)
      enfants.forEach((id) => interdits.add(id))
      frontiere = enfants
    }
    return interdits
  }, [dossier.id, dossiers])

  const destinationChoisie = destinationId !== undefined
  const estLaMemeDestination = destinationChoisie && (destinationId ?? null) === dossier.parent_id

  async function deplacer() {
    if (!destinationChoisie || estLaMemeDestination) return
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('document_dossiers').update({ parent_id: destinationId }).eq('id', dossier.id)
    setEnCours(false)
    if (error) {
      setErreur(error.code === '23505' ? 'Un dossier porte déjà ce nom à cet endroit.' : error.message)
      return
    }
    onChange()
    onFermer()
  }

  function rendreBranche(d: DossierDocument, profondeur: number): React.ReactNode {
    const enfants = dossiers.filter((e) => e.parent_id === d.id)
    const interdit = interditIds.has(d.id)
    const actuel = (d.id ?? null) === dossier.parent_id
    const selectionne = destinationChoisie && destinationId === d.id
    return (
      <div key={d.id}>
        <button
          type="button"
          disabled={interdit}
          onClick={() => setDestinationId(d.id)}
          style={ligneStyle(selectionne, interdit, profondeur)}
          title={interdit ? 'On ne peut pas déplacer un dossier dans lui-même ou l’un de ses sous-dossiers.' : undefined}
        >
          <Icone nom="documents" taille={14} />
          <span style={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.nom}
          </span>
          {actuel && <span style={etiquetteStyle}>Emplacement actuel</span>}
        </button>
        {enfants.map((e) => rendreBranche(e, profondeur + 1))}
      </div>
    )
  }

  const racine = dossiers.filter((d) => d.parent_id === null)

  return (
    <Modale titre={`Déplacer « ${dossier.nom} »`} onFermer={onFermer} largeurMax={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <MessageInfo>Choisissez le dossier dans lequel déplacer « {dossier.nom} ».</MessageInfo>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            maxHeight: 320,
            overflowY: 'auto',
            padding: '6px 4px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface-alt)',
          }}
        >
          <button
            type="button"
            onClick={() => setDestinationId(null)}
            style={ligneStyle(destinationChoisie && destinationId === null, false, 0)}
          >
            <Icone nom="documents" taille={14} />
            <span style={{ flexGrow: 1 }}>{titreRacine}</span>
            {dossier.parent_id === null && <span style={etiquetteStyle}>Emplacement actuel</span>}
          </button>
          {racine.map((d) => rendreBranche(d, 1))}
        </div>

        {estLaMemeDestination && (
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>« {dossier.nom} » est déjà à cet endroit.</span>
        )}

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onFermer} style={{ ...boutonNeutreStyle, flexGrow: 1 }}>
            Annuler
          </button>
          <button
            onClick={deplacer}
            disabled={enCours || !destinationChoisie || estLaMemeDestination}
            className="btn-shine"
            style={{
              ...boutonPrimaireStyle,
              flexGrow: 1,
              opacity: enCours || !destinationChoisie || estLaMemeDestination ? 0.6 : 1,
            }}
          >
            {enCours ? 'Déplacement…' : 'Déplacer ici'}
          </button>
        </div>
      </div>
    </Modale>
  )
}

const ligneStyle = (selectionne: boolean, interdit: boolean, profondeur: number): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '7px 10px',
  paddingLeft: 10 + profondeur * 16,
  borderRadius: 8,
  border: 'none',
  background: selectionne ? 'color-mix(in srgb, var(--accent-blue) 14%, transparent)' : 'transparent',
  color: interdit ? 'var(--muted-2)' : selectionne ? 'var(--accent-blue)' : 'var(--ink-2)',
  fontSize: 12.5,
  fontWeight: selectionne ? 700 : 500,
  fontFamily: 'inherit',
  cursor: interdit ? 'not-allowed' : 'pointer',
  opacity: interdit ? 0.5 : 1,
  textAlign: 'left',
})

const etiquetteStyle: React.CSSProperties = {
  flexShrink: 0,
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--muted)',
  background: 'var(--surface)',
  borderRadius: 999,
  padding: '2px 8px',
}
