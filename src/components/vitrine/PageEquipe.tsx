import { IcoHX } from './IconesHX'

/* Professeurs, d'après hoc-equipe.html. Deux grilles : l'équipe administrative, puis les
   professeurs, séparées par un intertitre souligné.

   La maquette dessine quatre personnes dans chaque grille et laisse un modèle en commentaire
   pour en ajouter ; ce sont les dix personnes réelles de l'établissement qui s'affichent ici,
   avec leurs photos. Le hero ne porte pas de surtitre : le mot « PROFESSEURS » au-dessus de
   « Notre équipe » répétait l'entrée de menu (demande client du 2026-10-08).

   La carte de la fondatrice est la seule sombre, comme dans la maquette (`.m.fondatrice`, voir
   le renommage expliqué en tête de vitrine-hx.css). */

type Membre = {
  id?: number
  nom?: string
  role: string
  slogan: string
  niveau: 1 | 2 | 3 | 4
  linkedin?: string
}

const EQUIPE: Membre[] = [
  {
    id: 16,
    nom: 'Harinjo',
    role: 'Fondatrice',
    niveau: 1,
    slogan:
      'Elle a fondé Hari Online Club avec une conviction simple : aucune application ne remplace le regard d’un professeur qui croit en vous.',
    linkedin: 'https://www.linkedin.com/in/harinjo-andriamahenina-2488721b3/',
  },
  {
    id: 15,
    nom: 'Manda',
    role: 'Ingénieur pédagogue',
    niveau: 2,
    slogan:
      'Elle conçoit les parcours et les outils qui structurent chaque cours, pour que la pédagogie HOC reste cohérente du premier au dernier élève.',
  },
  {
    id: 11,
    nom: 'Anael',
    role: 'Assistante admin',
    niveau: 2,
    slogan:
      'Souvent le premier contact de chaque élève, elle veille à ce que chaque dossier avance sans accroc, du premier message à la première séance.',
  },
  {
    id: 12,
    nom: 'Koloina',
    role: 'Community Manager',
    niveau: 3,
    slogan: 'Elle anime la communauté HOC au quotidien et veille à ce que chaque élève se sente attendu, suivi et entendu.',
  },
  {
    id: 9,
    nom: 'Pamella',
    role: 'Professeure d’anglais',
    niveau: 4,
    slogan:
      'Patiente et à l’écoute, elle crée un environnement où chaque élève peut prendre confiance et oser s’exprimer en anglais à son rythme.',
  },
  {
    id: 14,
    nom: 'Patricia',
    role: 'Professeure d’anglais',
    niveau: 4,
    slogan: 'Minutieuse et à l’écoute, elle construit avec chaque élève un parcours taillé pour son objectif réel.',
  },
  {
    id: 18,
    nom: 'Miangaly',
    role: 'Professeure d’anglais',
    niveau: 4,
    slogan: 'Souriante et rigoureuse, elle installe tout de suite un climat de confiance qui donne envie de prendre la parole.',
  },
  {
    id: 19,
    nom: 'Raissa',
    role: 'Professeure d’anglais',
    niveau: 4,
    slogan: 'À l’écoute et méthodique, elle avance pas à pas avec chaque élève pour consolider durablement ses acquis.',
  },
  {
    id: 20,
    nom: 'Rado',
    role: 'Professeur d’anglais',
    niveau: 4,
    slogan: 'Dynamique et bienveillant, il pousse chaque élève à oser parler, erreurs comprises, pour progresser plus vite.',
  },
  {
    id: 21,
    nom: 'Ashley',
    role: 'Professeure d’anglais',
    niveau: 4,
    slogan: 'Appliquée et chaleureuse, elle prend le temps de comprendre l’objectif de chaque élève avant de tracer son parcours.',
  },
]

export function initialesDe(nom: string) {
  return nom
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase())
    .join('')
}

export function PageEquipe({ dossierAssets }: { dossierAssets: string }) {
  const administration = EQUIPE.filter((membre) => membre.niveau <= 3).sort((a, b) => a.niveau - b.niveau)
  const professeurs = EQUIPE.filter((membre) => membre.niveau === 4)

  return (
    <>
      <section className="dark phero">
        <div className="glow g1" />
        <div className="glow g2" />
        <div className="spot" />
        <div className="grain" />
        <div className="wrap reveal">
          <h1 className="h-xl">
            <span className="line">
              <span>Notre</span>
            </span>
            <span className="line">
              <span className="it" style={{ transitionDelay: '.12s' }}>
                équipe
              </span>
            </span>
          </h1>
          <p className="sub rv" style={{ transitionDelay: '.3s' }}>
            Des professeurs choisis pour leur pédagogie autant que pour leur passion des langues.
          </p>
        </div>
      </section>

      <section className="light team">
        <div className="wrap overlap">
          <div className="grid">
            {administration.map((membre, index) => (
              <CarteMembre key={membre.nom ?? membre.role} membre={membre} dossierAssets={dossierAssets} rang={index} />
            ))}
          </div>

          <div className="group-t rv">
            <h2 className="h-l">Nos professeurs et professeures</h2>
          </div>

          <div className="grid">
            {professeurs.map((membre, index) => (
              <CarteMembre key={membre.nom ?? membre.role} membre={membre} dossierAssets={dossierAssets} rang={index} />
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

function CarteMembre({ membre, dossierAssets, rang }: { membre: Membre; dossierAssets: string; rang: number }) {
  /* La maquette échelonne les apparitions de 0,08 s par carte, en repartant de zéro à chaque
     rangée de quatre. */
  const delai = (rang % 4) * 0.08

  return (
    <article className={`m rv${membre.niveau === 1 ? ' fondatrice' : ''}`} style={{ transitionDelay: `${delai}s` }}>
      <div className="ph">
        {membre.id ? (
          <img
            src={`${dossierAssets}/equipe/equipe-${membre.id}.webp`}
            alt={membre.nom ? `${membre.nom}, ${membre.role}` : membre.role}
            loading="lazy"
          />
        ) : (
          /* Filet de sécurité pour une fiche en attente de photo : initiales plutôt qu'une image
             cassée. Personne n'est dans ce cas aujourd'hui. */
          <span className="ini" aria-hidden="true">
            {initialesDe(membre.nom ?? membre.role)}
          </span>
        )}
        <span className="role">{membre.role}</span>
      </div>
      {membre.nom && <h3>{membre.nom}</h3>}
      <p>{membre.slogan}</p>
      {membre.linkedin && (
        <a className="li" href={membre.linkedin} target="_blank" rel="noopener noreferrer">
          <IcoHX nom="linkedin" />
          LinkedIn
        </a>
      )}
    </article>
  )
}
