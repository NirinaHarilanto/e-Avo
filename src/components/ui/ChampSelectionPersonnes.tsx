import { useEffect, useMemo, useRef, useState } from 'react'

export interface PersonneSelectionnable {
  id: string
  /* Ce qui s'affiche dans le jeton et dans la suggestion. */
  libelle: string
  /* Ligne secondaire de la suggestion (e-mail, classe d'origine…) — facultative. */
  detail?: string
  initiales?: string
}

/* Champ de sélection de personnes « à la Outlook » — demande client du 2026-10-30 : « il faut que
   l'ajout et la recherche des étudiants soient similaires à l'ajout d'un expéditeur dans un mail
   d'Outlook (mécanisme pareil) ».
   Ce que ce mécanisme recouvre, et qu'un simple `<select multiple>` ne donne pas :
     * on TAPE pour filtrer, on ne déroule pas une liste de soixante noms ;
     * la suggestion se choisit à la souris OU au clavier (flèches + Entrée), sans quitter le
       champ ;
     * chaque personne choisie devient un JETON posé dans le champ, retirable d'une croix ;
     * Retour arrière sur un champ vide retire le dernier jeton, comme un destinataire d'e-mail ;
     * Échap referme les suggestions sans rien choisir.
   Générique (il ne connaît ni les étudiants ni les classes) pour pouvoir resservir : le seul
   savoir métier — qui est sélectionnable et pourquoi — reste chez l'appelant, qui ne lui passe
   déjà que des personnes éligibles. */
export function ChampSelectionPersonnes({
  personnes,
  selection,
  onChange,
  placeholder = 'Rechercher…',
  messageAucunResultat = 'Aucun résultat.',
  maximum,
  desactive,
}: {
  personnes: PersonneSelectionnable[]
  selection: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
  messageAucunResultat?: string
  /* Nombre maximum de personnes sélectionnables — au-delà, le champ cesse de proposer et le dit
     (une classe de niveau ne dépasse jamais 7 élèves, 0074). */
  maximum?: number
  desactive?: boolean
}) {
  const [recherche, setRecherche] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const [indexActif, setIndexActif] = useState(0)
  const conteneur = useRef<HTMLDivElement>(null)
  const champ = useRef<HTMLInputElement>(null)

  const parId = useMemo(() => new Map(personnes.map((p) => [p.id, p])), [personnes])
  const complet = maximum != null && selection.length >= maximum

  /* Accents ignorés dans la recherche : « Anaïs » doit se trouver en tapant « anais », et
     inversement. Même normalisation des deux côtés de la comparaison. */
  const suggestions = useMemo(() => {
    const normaliser = (texte: string) =>
      texte
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
    const termes = normaliser(recherche).split(/\s+/).filter(Boolean)
    return personnes
      .filter((p) => !selection.includes(p.id))
      .filter((p) => {
        if (termes.length === 0) return true
        const cible = normaliser(`${p.libelle} ${p.detail ?? ''}`)
        return termes.every((terme) => cible.includes(terme))
      })
      .slice(0, 8)
  }, [personnes, selection, recherche])

  useEffect(() => {
    setIndexActif(0)
  }, [recherche])

  // Un clic hors du champ referme les suggestions, comme toute liste de ce genre.
  useEffect(() => {
    if (!ouvert) return
    function auClic(evenement: MouseEvent) {
      if (conteneur.current && !conteneur.current.contains(evenement.target as Node)) setOuvert(false)
    }
    document.addEventListener('mousedown', auClic)
    return () => document.removeEventListener('mousedown', auClic)
  }, [ouvert])

  function ajouter(id: string) {
    if (complet) return
    onChange([...selection, id])
    setRecherche('')
    setIndexActif(0)
    champ.current?.focus()
  }

  function retirer(id: string) {
    onChange(selection.filter((autre) => autre !== id))
  }

  function auClavier(evenement: React.KeyboardEvent<HTMLInputElement>) {
    if (evenement.key === 'Backspace' && recherche === '' && selection.length > 0) {
      retirer(selection[selection.length - 1])
      return
    }
    if (evenement.key === 'Escape') {
      setOuvert(false)
      return
    }
    if (suggestions.length === 0) return
    if (evenement.key === 'ArrowDown') {
      evenement.preventDefault()
      setOuvert(true)
      setIndexActif((i) => (i + 1) % suggestions.length)
    } else if (evenement.key === 'ArrowUp') {
      evenement.preventDefault()
      setOuvert(true)
      setIndexActif((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (evenement.key === 'Enter') {
      /* Jamais de soumission du formulaire parent sur Entrée tant qu'une suggestion est
         ouverte : la touche sert ici à choisir un destinataire, pas à créer la classe. */
      evenement.preventDefault()
      if (ouvert) ajouter(suggestions[indexActif].id)
      else setOuvert(true)
    }
  }

  return (
    <div ref={conteneur} style={{ position: 'relative' }}>
      <div
        onClick={() => {
          if (!desactive) {
            champ.current?.focus()
            setOuvert(true)
          }
        }}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
          padding: '7px 10px',
          minHeight: 38,
          borderRadius: 12,
          border: '1px solid var(--border)',
          background: 'var(--fond-champ, rgba(0,0,0,.22))',
          cursor: desactive ? 'not-allowed' : 'text',
          opacity: desactive ? 0.6 : 1,
        }}
      >
        {selection.map((id) => {
          const personne = parId.get(id)
          return (
            <span
              key={id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 4px 3px 9px',
                borderRadius: 999,
                background: 'color-mix(in srgb, var(--accent-blue) 18%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent-blue) 42%, transparent)',
                fontSize: 12,
                color: 'var(--ink)',
                maxWidth: '100%',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {personne?.libelle ?? 'Inconnu'}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  retirer(id)
                }}
                aria-label={`Retirer ${personne?.libelle ?? 'cette personne'}`}
                style={{
                  width: 17,
                  height: 17,
                  borderRadius: 999,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: 13,
                  lineHeight: 1,
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </span>
          )
        })}
        <input
          ref={champ}
          type="text"
          value={recherche}
          disabled={desactive || complet}
          onChange={(e) => {
            setRecherche(e.target.value)
            setOuvert(true)
          }}
          onFocus={() => setOuvert(true)}
          onKeyDown={auClavier}
          /* Le `placeholder` s'efface dès qu'un jeton occupe le champ : sans ce libellé stable,
             l'intitulé du champ disparaîtrait pour une lecture d'écran au premier choix. */
          aria-label={placeholder}
          placeholder={complet ? `Maximum atteint (${maximum})` : selection.length > 0 ? '' : placeholder}
          style={{
            flexGrow: 1,
            minWidth: 110,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--ink)',
            fontSize: 13,
            padding: '2px 0',
          }}
        />
      </div>

      {ouvert && !desactive && !complet && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 30,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            boxShadow: '0 12px 28px rgba(0,0,0,.28)',
            overflow: 'hidden',
            maxHeight: 240,
            overflowY: 'auto',
          }}
        >
          {suggestions.length === 0 ? (
            <p style={{ margin: 0, padding: '10px 13px', fontSize: 12, color: 'var(--muted-2)' }}>{messageAucunResultat}</p>
          ) : (
            suggestions.map((personne, index) => (
              <button
                key={personne.id}
                type="button"
                onMouseEnter={() => setIndexActif(index)}
                onClick={() => ajouter(personne.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '8px 13px',
                  border: 'none',
                  borderBottom: '1px solid var(--border-soft)',
                  background: index === indexActif ? 'var(--voile, rgba(255,255,255,.06))' : 'transparent',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {personne.initiales && (
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      background: 'var(--voile, rgba(255,255,255,.06))',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent-blue)',
                      fontSize: 10,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {personne.initiales}
                  </span>
                )}
                <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12.5 }}>{personne.libelle}</span>
                  {personne.detail && (
                    <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {personne.detail}
                    </span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
