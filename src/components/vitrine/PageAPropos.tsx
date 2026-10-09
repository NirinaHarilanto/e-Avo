/* À propos, d'après hoc-a-propos.html. Cinq temps : le hero avec la photo d'équipe en cadre
   incliné qui déborde sur la section suivante, la citation géante, le récit, les deux cartes,
   puis la chute sur fond violet.

   Le texte est celui de la fondatrice, fourni mot pour mot (demande 10 du 2026-10-08), découpé
   ici selon le rythme que la maquette lui donne : la citation d'ouverture, les respirations en
   relief (« J'ai fait le pari inverse. », « Ainsi est né Hari Online Club. »), les deux
   convictions en cartes, et la chute. */

export function PageAPropos({ dossierAssets }: { dossierAssets: string }) {
  return (
    <div className="apropos">
      <section className="dark phero">
        <div className="clip">
          <div className="glow g1" />
          <div className="glow g2" />
          <div className="spot" />
          <div className="grain" />
        </div>
        <div className="wrap">
          <div className="grid">
            <div className="reveal">
              <div className="eyebrow">À propos</div>
              <h1 className="h-xl">
                <span className="line">
                  <span>L’histoire de</span>
                </span>
                <span className="line">
                  <span className="it" style={{ transitionDelay: '.12s' }}>
                    Hari Online Club
                  </span>
                </span>
              </h1>
              <p className="by rv" style={{ transitionDelay: '.3s' }}>
                Par Harinjo, fondatrice.
              </p>
            </div>
            <div className="photo rv" style={{ transitionDelay: '.2s' }}>
              <div className="frame">
                <img src={`${dossierAssets}/equipe-groupe.webp`} alt="L’équipe de Hari Online Club" loading="lazy" />
              </div>
              <div className="tag">HOC ✦</div>
            </div>
          </div>
        </div>
      </section>

      <section className="light quote-sec">
        <div className="wrap">
          <div className="bigq rv">
            <span className="mark" aria-hidden="true">
              “
            </span>
            <p>
              Je n’ai pas fondé HOC pour répondre à une demande. <span className="it">Je l’ai fondé pour en créer une.</span>
            </p>
          </div>
        </div>
      </section>

      <section className="light story">
        <div className="wrap">
          <div className="grid">
            <div className="body">
              <p className="rv">
                Il y a encore dix ans, à Madagascar, apprendre signifiait une chose : une salle de classe, un tableau
                blanc, un professeur face à des rangées d’élèves. Les cours en ligne&nbsp;? Peu y croyaient. Trop
                distants, trop impersonnels, pas «&nbsp;sérieux&nbsp;».
              </p>
              <p className="turn rv">J’ai fait le pari inverse.</p>
              <p className="rv">
                Forte de mes années passées à concevoir et piloter des formations à distance, j’ai voulu prouver
                qu’apprendre l’anglais en ligne pouvait être aussi humain, aussi exigeant et bien plus vivant qu’en
                salle. Pour les Malgaches d’ici, et pour notre diaspora, partout dans le monde.
              </p>
              <span className="born rv">Ainsi est né Hari Online Club.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="light duo">
        <div className="wrap">
          <div className="grid">
            <article className="carte-recit c1 rv">
              <h3 className="h-m">Chez HOC, l’anglais se commande à la carte.</h3>
              <p>
                Imaginez un restaurant où vous ne subissez pas un menu imposé : vous choisissez ce dont vous avez envie,
                à votre rythme, selon vos goûts et vos objectifs. Décrocher votre certification (IELTS, TOEIC, TOEFL),
                préparer un entretien, voyager sereinement, prendre la parole en réunion, aider vos enfants, ou
                simplement oser parler : votre parcours est construit pour vous, et seulement pour vous.
              </p>
            </article>
            <article className="carte-recit c2 rv" style={{ transitionDelay: '.15s' }}>
              <h3 className="h-m">Notre vision est simple : vous faire aimer l’anglais.</h3>
              <p>
                Pas le subir. Pas le réviser par obligation. L’aimer. Grâce à une approche accessible, interactive et
                centrée sur la conversation, pensée pour tous les âges et tous les parcours.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="dark finale">
        <div className="glow g1" />
        <div className="spot" />
        <div className="grain" />
        <div className="wrap reveal">
          <p className="pre rv">Parce qu’une langue ne s’apprend pas sur un tableau blanc.</p>
          <p className="giant">
            <span className="line">
              <span>
                Elle <span className="it">se vit.</span>
              </span>
            </span>
          </p>
          <div className="sign rv" style={{ transitionDelay: '.3s' }}>
            HOC, l’anglais sur mesure, où que vous soyez.
          </div>
        </div>
      </section>
    </div>
  )
}
