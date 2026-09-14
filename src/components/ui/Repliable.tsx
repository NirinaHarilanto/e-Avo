import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

const lienStyle: CSSProperties = {
  alignSelf: 'flex-start',
  marginTop: 6,
  fontSize: 11.5,
  fontWeight: 700,
  color: 'var(--accent-blue)',
  background: 'transparent',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
}

interface TexteRepliableProps {
  texte: string
  /* Nombre de lignes visibles une fois replié. */
  lignes?: number
  style?: CSSProperties
}

/* Texte long coupé à quelques lignes, déplié à la demande. Le lien « voir plus » n'apparaît que
   si le texte dépasse réellement la hauteur permise : on compare la hauteur du contenu à celle
   de la boîte plutôt que de deviner d'après le nombre de caractères, qui dépend de la largeur
   disponible et de la taille de police. */
export function TexteRepliable({ texte, lignes = 3, style }: TexteRepliableProps) {
  const [deplie, setDeplie] = useState(false)
  const [depasse, setDepasse] = useState(false)
  const reference = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const element = reference.current
    if (!element || deplie) return
    // +1 px de marge : les hauteurs sont sous-pixel, un texte pile à la limite se déclarerait
    // sinon tronqué et afficherait un « voir plus » qui ne révèle rien.
    setDepasse(element.scrollHeight > element.clientHeight + 1)
  }, [texte, lignes, deplie])

  const styleReplie: CSSProperties = deplie
    ? {}
    : { display: '-webkit-box', WebkitLineClamp: lignes, WebkitBoxOrient: 'vertical', overflow: 'hidden' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <p ref={reference} style={{ margin: 0, ...style, ...styleReplie }}>
        {texte}
      </p>
      {(depasse || deplie) && (
        <button type="button" onClick={() => setDeplie((v) => !v)} style={lienStyle}>
          {deplie ? 'voir moins…' : 'voir plus…'}
        </button>
      )}
    </div>
  )
}

interface ListeRepliableProps {
  children: ReactNode[]
  /* Nombre d'éléments visibles une fois replié. */
  visibles?: number
  /* Nom de ce qui est listé, pour l'annonce « voir les 12 autres séances ». */
  nom?: string
}

/* Pendant de TexteRepliable pour une liste d'éléments : au-delà de quelques lignes, une longue
   liste noie le reste de la page. Le compte exact des éléments masqués est annoncé plutôt qu'un
   « voir plus » sec, pour que l'utilisateur sache ce qu'il reste à déplier. */
export function ListeRepliable({ children, visibles = 3, nom = 'éléments' }: ListeRepliableProps) {
  const [deplie, setDeplie] = useState(false)
  const masques = children.length - visibles

  if (masques <= 0) return <>{children}</>

  return (
    <>
      {deplie ? children : children.slice(0, visibles)}
      <button type="button" onClick={() => setDeplie((v) => !v)} style={{ ...lienStyle, marginTop: 0, padding: '8px 18px' }}>
        {deplie ? 'voir moins…' : masques === 1 ? 'voir 1 de plus…' : `voir les ${masques} autres ${nom}…`}
      </button>
    </>
  )
}
