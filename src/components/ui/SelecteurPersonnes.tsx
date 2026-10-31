import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { normaliserNom } from '../../lib/nomDuplique'
import { adresseDepuisId, estAdresseLibre, idDAdresseLibre, ressembleAUneAdresse, type PersonneSelectionnable } from '../../lib/invitations'

interface SelecteurPersonnesProps {
  etiquette: string
  placeholder?: string
  candidats: PersonneSelectionnable[]
  selectionnes: string[]
  onChange: (ids: string[]) => void
  /* Identifiants à exclure des suggestions même s'ils correspondent à la recherche — sert à
     empêcher qu'une même personne soit choisie à la fois dans la zone « obligatoire » et la zone
     « optionnelle » d'un même formulaire (voir FormulaireCreerEvenement). */
  exclure?: string[]
  /* Autorise à convier une adresse e-mail qui n'appartient à personne d'inscrit — un prospect,
     typiquement. La suggestion n'apparaît que si la saisie ressemble à une adresse ET qu'aucune
     personne ne correspond : tant qu'un nom est proposé, c'est lui qu'on veut choisir. */
  autoriserAdresseLibre?: boolean
}

const LIMITE_SUGGESTIONS = 8

function nomComplet(p: PersonneSelectionnable): string {
  return `${p.prenom ?? ''} ${p.nom ?? ''}`.trim()
}

/* Champ de recherche multi-sélection façon Outlook (demande client du 2026-09-16) : on tape un
   nom ou un prénom, une liste de suggestions apparaît, on choisit — la personne devient une
   pastille amovible dans le champ, et la recherche se vide pour en ajouter une autre. Toutes les
   personnes passées en `candidats` sont retrouvables, quel que soit leur rôle : c'est l'appelant
   qui décide du vivier (tous les inscrits de l'établissement pour l'admin, les seuls élèves
   attribués pour un professeur — voir CalendrierProfesseur.tsx). */
export function SelecteurPersonnes({ etiquette, placeholder, candidats, selectionnes, onChange, exclure = [], autoriserAdresseLibre = false }: SelecteurPersonnesProps) {
  const [saisie, setSaisie] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const [surligne, setSurligne] = useState(0)
  const champRef = useRef<HTMLInputElement>(null)

  const candidatParId = useMemo(() => new Map(candidats.map((c) => [c.id, c])), [candidats])
  const recherche = normaliserNom(saisie)
  const suggestions = useMemo(() => {
    if (!recherche) return []
    const trouvees = candidats
      .filter((c) => {
        /* Le nom OU l'adresse e-mail, quand l'appelant la fournit : coller l'adresse d'un
           destinataire est un réflexe au moins aussi courant que taper son nom, et ne rien
           trouver laissait croire que la personne n'était pas inscrite. */
        const correspond =
          normaliserNom(nomComplet(c)).includes(recherche) || (!!c.email && normaliserNom(c.email).includes(recherche))
        if (exclure.includes(c.id) || !correspond) return false
        // Un groupe reste proposable tant qu'un de ses membres manque à l'appel.
        if (c.membres) return c.membres.some((m) => !selectionnes.includes(m))
        return !selectionnes.includes(c.id)
      })
      .slice(0, LIMITE_SUGGESTIONS)
    if (trouvees.length > 0 || !autoriserAdresseLibre) return trouvees

    /* Personne ne correspond, et la saisie est une adresse : on propose d'écrire à cette adresse
       telle quelle. Le `role` affiché dit clairement que ce destinataire n'est pas inscrit — ce
       qui décide de ce que l'appelant pourra en faire (un e-mail, oui ; un message déposé dans un
       espace personnel qui n'existe pas, non). */
    const adresse = saisie.trim().toLowerCase()
    if (!ressembleAUneAdresse(adresse)) return trouvees
    const id = idDAdresseLibre(adresse)
    if (selectionnes.includes(id) || exclure.includes(id)) return trouvees
    return [{ id, nom: null, prenom: adresse, role: 'Adresse externe' }]
  }, [candidats, recherche, saisie, selectionnes, exclure, autoriserAdresseLibre])

  /* Binômes dont un seul membre est pour l'instant convié. Recalculé à chaque rendu plutôt que
     mémorisé au moment du clic : retirer une pastille doit faire réapparaître la proposition. */
  const binomesProposes = useMemo(() => {
    const manquants = new Map<string, { binome: PersonneSelectionnable; via: PersonneSelectionnable }>()
    for (const id of selectionnes) {
      const personne = candidatParId.get(id)
      const binomeId = personne?.binomeId
      if (!binomeId || selectionnes.includes(binomeId) || exclure.includes(binomeId)) continue
      const binome = candidatParId.get(binomeId)
      if (binome) manquants.set(binomeId, { binome, via: personne })
    }
    return [...manquants.values()]
  }, [selectionnes, candidatParId, exclure])

  function ajouter(id: string) {
    const candidat = candidatParId.get(id)
    const aAjouter = candidat?.membres ?? [id]
    onChange([...selectionnes, ...aAjouter.filter((v) => !selectionnes.includes(v))])
    setSaisie('')
    setSurligne(0)
    champRef.current?.focus()
  }

  function retirer(id: string) {
    onChange(selectionnes.filter((v) => v !== id))
  }

  function surTouche(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSurligne((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSurligne((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (suggestions[surligne]) ajouter(suggestions[surligne].id)
    } else if (e.key === 'Backspace' && !saisie && selectionnes.length > 0) {
      // Comme dans Outlook : effacer dans un champ vide retire la dernière pastille.
      retirer(selectionnes[selectionnes.length - 1])
    } else if (e.key === 'Escape') {
      setOuvert(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>{etiquette}</label>
      <div
        onClick={() => champRef.current?.focus()}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '7px 9px',
          background: 'var(--fond-champ, rgba(0,0,0,.22))',
          cursor: 'text',
        }}
      >
        {selectionnes.map((id) => {
          const personne = candidatParId.get(id)
          const libelle = estAdresseLibre(id) ? adresseDepuisId(id) : personne ? nomComplet(personne) : 'Personne introuvable'
          return (
            <span
              key={id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--accent-blue)',
                background: 'rgba(169,140,255,.14)',
                border: '1px solid rgba(169,140,255,.3)',
                borderRadius: 999,
                padding: '3px 6px 3px 10px',
              }}
            >
              {libelle}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  retirer(id)
                }}
                aria-label={`Retirer ${libelle}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 15,
                  height: 15,
                  borderRadius: 999,
                  border: 'none',
                  background: 'rgba(169,140,255,.22)',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontSize: 11,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </span>
          )
        })}
        <input
          ref={champRef}
          value={saisie}
          onChange={(e) => {
            setSaisie(e.target.value)
            setOuvert(true)
            setSurligne(0)
          }}
          onFocus={() => setOuvert(true)}
          onBlur={() => setTimeout(() => setOuvert(false), 120)}
          onKeyDown={surTouche}
          placeholder={selectionnes.length === 0 ? placeholder : ''}
          style={{
            flex: '1 1 120px',
            minWidth: 120,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--ink)',
            fontSize: 13,
            fontFamily: 'inherit',
            padding: '3px 2px',
          }}
        />
      </div>

      {binomesProposes.map(({ binome, via }) => (
        <div
          key={binome.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            fontSize: 12,
            color: 'var(--ink-2)',
            background: 'rgba(233,207,148,.1)',
            border: '1px solid rgba(233,207,148,.28)',
            borderRadius: 10,
            padding: '7px 10px',
          }}
        >
          <span style={{ flexGrow: 1, minWidth: 180 }}>
            {nomComplet(via)} suit un programme en duo avec <strong>{nomComplet(binome)}</strong>. Souhaitez-vous ajouter
            son binôme ?
          </span>
          <button
            type="button"
            onClick={() => onChange([...selectionnes, binome.id])}
            style={{
              border: '1px solid rgba(233,207,148,.42)',
              background: 'rgba(233,207,148,.16)',
              color: 'var(--accent-gold, #e9cf94)',
              borderRadius: 999,
              padding: '4px 12px',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Ajouter {nomComplet(binome)}
          </button>
        </div>
      ))}

      {ouvert && suggestions.length > 0 && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            zIndex: 20,
            /* `var(--surface)` et non le violet nuit #1c1139 qui était écrit ici en dur : hérité
               du thème sombre, il restait noir après le passage des espaces connectés en thème
               clair, pendant que `--ink` (la couleur des noms, juste en dessous) devenait foncée.
               Les noms se retrouvaient écrits en violet sombre sur violet sombre — invisibles,
               alors que le rôle à droite (`--muted`, plus pâle) restait lui lisible. Signalé le
               2026-10-16 : l'admin en concluait qu'une personne « ne figurait pas dans la
               liste » alors qu'elle y était bel et bien proposée. */
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 12px 28px rgba(73,48,106,.16)',
            overflow: 'hidden',
          }}
        >
          {suggestions.map((personne, index) => (
            <button
              key={personne.id}
              type="button"
              role="option"
              aria-selected={index === surligne}
              // onMouseDown plutôt que onClick : il se déclenche AVANT le `blur` du champ, qui
              // fermerait sinon la liste avant que le clic n'ait pu être traité.
              onMouseDown={(e) => {
                e.preventDefault()
                ajouter(personne.id)
              }}
              onMouseEnter={() => setSurligne(index)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                padding: '9px 12px',
                border: 'none',
                /* Lavande de la charte plutôt qu'un violet translucide calibré pour le fond
                   sombre, qui se diluait presque entièrement sur le blanc de la liste. */
                background: index === surligne ? 'var(--hoc-pastille, rgba(169,140,255,.14))' : 'transparent',
                color: 'var(--ink)',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ fontWeight: 600 }}>{nomComplet(personne)}</span>
              {personne.role && <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{personne.role}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
