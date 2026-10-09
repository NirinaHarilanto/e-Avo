import { useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { SLUG_ETABLISSEMENT_PRINCIPAL } from '../../lib/etablissement'
import { DIPLOMES_DECLARES, type DiplomeDeclare } from '../../lib/recrutement'
import { useFondVitrine } from '../vitrine/animations'
import { FlecheBouton, IcoHX } from '../vitrine/IconesHX'

const ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png'
const TAILLE_MAX = 10 * 1024 * 1024
const MAX_DIPLOMES = 5

/* Candidature formateur, d'après hoc-devenir-formateur.html : barre allégée, hero violet, puis
   deux blocs blancs numérotés qui chevauchent le bas du hero.

   Un écart assumé avec la maquette : elle propose des cases à cocher multiples, alors que le
   dossier n'enregistre qu'un diplôme déclaré. Les quatre choix réels de l'application sont donc
   rendus en boutons radio, avec exactement la pastille dessinée par la maquette — l'apparence
   est la sienne, la donnée envoyée reste celle qu'attend l'API.

   Le reste du parcours est inchangé : les fichiers partent dans le stockage privé par URL
   signée (api/recrutement/preparer-envoi.ts), puis le dossier est enregistré (candidater.ts). */

function tailleLisible(octets: number) {
  return octets > 1048576 ? `${(octets / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(octets / 1024))} Ko`
}

export function CandidatureFormateur() {
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [ville, setVille] = useState('')
  const [diplome, setDiplome] = useState<DiplomeDeclare | ''>('')
  const [diplomeAutre, setDiplomeAutre] = useState('')
  const [motivation, setMotivation] = useState('')
  const [experiences, setExperiences] = useState('')
  const [cv, setCv] = useState<File | null>(null)
  const [diplomes, setDiplomes] = useState<File[]>([])
  const [consentement, setConsentement] = useState(false)
  const [etape, setEtape] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [erreurDiplome, setErreurDiplome] = useState(false)
  const [envoye, setEnvoye] = useState(false)

  useFondVitrine('#F7F4FF')

  /* La maquette cumule les fichiers déposés au lieu de remplacer la sélection précédente, et
     écarte les doublons sur le couple nom/taille. Même comportement ici, dans l'état React
     plutôt qu'en recomposant un DataTransfer. */
  function ajouterDiplomes(evenement: ChangeEvent<HTMLInputElement>) {
    const choisis = Array.from(evenement.target.files ?? [])
    setDiplomes((actuels) => {
      const nouveaux = choisis.filter(
        (fichier) => !actuels.some((deja) => deja.name === fichier.name && deja.size === fichier.size),
      )
      return [...actuels, ...nouveaux].slice(0, MAX_DIPLOMES)
    })
    /* Sans cette remise à zéro, rechoisir le même fichier après l'avoir retiré ne déclencherait
       aucun événement : la valeur de l'input n'aurait pas changé. */
    evenement.target.value = ''
  }

  function surSurvolDepot(evenement: DragEvent<HTMLElement>, actif: boolean) {
    evenement.currentTarget.classList.toggle('over', actif)
  }

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    if (!diplome) {
      setErreurDiplome(true)
      return
    }
    if (diplome === 'autre' && !diplomeAutre.trim()) {
      setErreurDiplome(true)
      return
    }
    if (!cv) return setErreur('Joignez votre CV.')
    if (diplomes.length === 0) return setErreur('Joignez votre licence en études anglophones ou votre certificat TEFL.')
    const tous = [
      { fichier: cv, type: 'cv' as const },
      ...diplomes.map((fichier) => ({ fichier, type: 'diplome' as const })),
    ]
    const tropLourd = tous.find((f) => f.fichier.size > TAILLE_MAX)
    if (tropLourd) return setErreur(`« ${tropLourd.fichier.name} » dépasse 10 Mo.`)

    try {
      setEtape('Préparation de l’envoi…')
      const preparation = await fetch('/api/recrutement/preparer-envoi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etablissementSlug: SLUG_ETABLISSEMENT_PRINCIPAL,
          fichiers: tous.map((f) => ({ nom: f.fichier.name, type: f.fichier.type, taille: f.fichier.size })),
        }),
      }).then((r) => r.json())
      if (preparation.error) throw new Error(preparation.error)

      const uploads = preparation.uploads as { chemin: string; token: string }[]
      for (const [index, u] of uploads.entries()) {
        setEtape(`Envoi des documents (${index + 1}/${uploads.length})…`)
        const { error } = await supabase.storage.from('candidatures').uploadToSignedUrl(u.chemin, u.token, tous[index].fichier, {
          contentType: tous[index].fichier.type,
        })
        if (error) throw new Error(`« ${tous[index].fichier.name} » n’a pas pu être envoyé : ${error.message}`)
      }

      setEtape('Enregistrement de votre candidature…')
      const resultat = await fetch('/api/recrutement/candidater', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etablissementSlug: SLUG_ETABLISSEMENT_PRINCIPAL,
          dossierId: preparation.dossierId,
          prenom,
          nom,
          email,
          telephone,
          ville,
          motivation,
          experiences,
          diplomeDeclare: diplome,
          diplomeAutrePrecision: diplome === 'autre' ? diplomeAutre.trim() : undefined,
          fichiers: uploads.map((u, i) => ({ chemin: u.chemin, nom: tous[i].fichier.name, type: tous[i].type })),
        }),
      }).then((r) => r.json())
      if (resultat.error) throw new Error(resultat.error)
      setEnvoye(true)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'L’envoi a échoué, réessayez.')
    } finally {
      setEtape(null)
    }
  }

  return (
    <div className="hx">
      <div className="jtop">
        <div className="wrap">
          <a className="logo" href="/">
            <img src="/logo-hoc-blanc.png" alt="Hari Online Club" />
          </a>
          <a className="back" href="/">
            ← Retour au site
          </a>
        </div>
      </div>

      <section className="dark phero">
        <div className="glow g1" />
        <div className="glow g2" />
        <div className="spot" />
        <div className="grain" />
        <div className="wrap reveal in">
          <h1 className="h-xl">
            <span className="line">
              <span>
                Rejoignez-<span className="it">nous !</span>
              </span>
            </span>
          </h1>
          <p className="sub rv in" style={{ transitionDelay: '.25s' }}>
            Vous êtes formateur ou formatrice d’anglais et souhaitez enseigner en ligne avec Hari Online Club ?
            Présentez-vous ci-dessous. Pièce obligatoire : une <b>licence en études anglophones</b> ou une{' '}
            <b>certification TEFL reconnue</b>.
          </p>
        </div>
      </section>

      <section className="light apply">
        <div className="wrap overlap">
          {envoye ? (
            <div className="block" style={{ maxWidth: 920, margin: '0 auto' }}>
              <div className="bh">
                <b>✦</b>
                <h2 className="h-l">Merci, votre candidature est bien arrivée</h2>
              </div>
              <p>
                Notre équipe étudie votre dossier. Si votre profil correspond à nos besoins, nous vous contacterons pour
                un premier appel de pré-sélection, suivi de tests d’anglais et d’une simulation de cours sur Google
                Meet.
              </p>
              <a className="btn btn-gold" href="/" style={{ marginTop: 18 }}>
                Retour au site <FlecheBouton />
              </a>
            </div>
          ) : (
            <form onSubmit={envoyer}>
              <div className="block rv in">
                <div className="bh">
                  <b>1</b>
                  <h2 className="h-l">Vos informations</h2>
                </div>
                <div className="champs-3">
                  <label className="f">
                    Prénom <span className="req">*</span>
                    <input type="text" required autoComplete="given-name" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
                  </label>
                  <label className="f">
                    Nom <span className="req">*</span>
                    <input type="text" required autoComplete="family-name" value={nom} onChange={(e) => setNom(e.target.value)} />
                  </label>
                  <label className="f">
                    E-mail <span className="req">*</span>
                    <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </label>
                  <label className="f">
                    Téléphone / WhatsApp
                    <input type="tel" autoComplete="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
                  </label>
                  <label className="f">
                    Ville
                    <input type="text" autoComplete="address-level2" value={ville} onChange={(e) => setVille(e.target.value)} />
                  </label>
                </div>

                <fieldset className="checks">
                  <legend>
                    Diplôme ou certification <span className="req">*</span>
                  </legend>
                  {DIPLOMES_DECLARES.map((option) => (
                    <label key={option.valeur} className="chk">
                      <input
                        type="radio"
                        name="diplome"
                        value={option.valeur}
                        checked={diplome === option.valeur}
                        onChange={() => {
                          setDiplome(option.valeur)
                          setErreurDiplome(false)
                        }}
                      />
                      <span className="box">✓</span>
                      {option.libelle}
                    </label>
                  ))}
                  {/* « Autre » ne dit rien par lui-même : sans ce champ, l'admin ne découvre le
                      diplôme réel qu'en relisant le CV joint. Demande client du 2026-10-10. */}
                  {diplome === 'autre' && (
                    <label className="f" style={{ marginTop: 10 }}>
                      Nom ou description du diplôme <span className="req">*</span>
                      <input
                        type="text"
                        required
                        maxLength={200}
                        value={diplomeAutre}
                        onChange={(e) => {
                          setDiplomeAutre(e.target.value)
                          setErreurDiplome(false)
                        }}
                        placeholder="Ex. : Master en linguistique anglaise, certificat CELTA…"
                      />
                    </label>
                  )}
                  <div className={erreurDiplome ? 'err show' : 'err'}>
                    {!diplome ? 'Indiquez votre diplôme ou votre certification.' : 'Précisez le nom ou la description de votre diplôme.'}
                  </div>
                </fieldset>

                <label className="f">
                  Vos motivations <span className="req">*</span>
                  <textarea
                    required
                    maxLength={5000}
                    value={motivation}
                    onChange={(e) => setMotivation(e.target.value)}
                    placeholder="Pourquoi souhaitez-vous enseigner avec Hari Online Club ?"
                  />
                </label>
                <label className="f" style={{ marginBottom: 0 }}>
                  Vos expériences professionnelles <span className="req">*</span>
                  <textarea
                    required
                    maxLength={5000}
                    value={experiences}
                    onChange={(e) => setExperiences(e.target.value)}
                    placeholder="Postes occupés, années d’enseignement, publics (adultes, enfants, entreprises), cours en ligne…"
                  />
                </label>
              </div>

              <div className="block rv in">
                <div className="bh">
                  <b>2</b>
                  <h2 className="h-l">Vos documents</h2>
                </div>
                <p className="formats">PDF, Word, JPEG ou PNG, 10 Mo maximum par fichier.</p>

                <label className="f">
                  CV <span className="req">*</span>
                  <span
                    className={cv ? 'drop ok' : 'drop'}
                    onDragEnter={(e) => surSurvolDepot(e, true)}
                    onDragOver={(e) => surSurvolDepot(e, true)}
                    onDragLeave={(e) => surSurvolDepot(e, false)}
                    onDrop={(e) => surSurvolDepot(e, false)}
                  >
                    <input type="file" accept={ACCEPT} onChange={(e) => setCv(e.target.files?.[0] ?? null)} />
                    <i>
                      <IcoHX nom="document" />
                    </i>
                    <span className="fn">{cv ? cv.name : 'Aucun fichier choisi'}</span>
                  </span>
                </label>

                <label className="f" style={{ marginBottom: 10 }}>
                  Diplômes ou certificats (licence en études anglophones, TEFL…) <span className="req">*</span>
                  <span
                    className={diplomes.length > 0 ? 'drop ok' : 'drop'}
                    onDragEnter={(e) => surSurvolDepot(e, true)}
                    onDragOver={(e) => surSurvolDepot(e, true)}
                    onDragLeave={(e) => surSurvolDepot(e, false)}
                    onDrop={(e) => surSurvolDepot(e, false)}
                  >
                    <input type="file" accept={ACCEPT} multiple onChange={ajouterDiplomes} />
                    <i>
                      <IcoHX nom="medaille" />
                    </i>
                    <span className="fn">
                      {diplomes.length === 0
                        ? 'Aucun fichier choisi'
                        : `${diplomes.length} ${diplomes.length > 1 ? 'fichiers ajoutés' : 'fichier ajouté'} · cliquez pour en ajouter`}
                    </span>
                  </span>
                </label>

                <ul className="files">
                  {diplomes.map((fichier) => (
                    <li key={`${fichier.name}-${fichier.size}`}>
                      <span>{fichier.name}</span>
                      <small>{tailleLisible(fichier.size)}</small>
                      <button
                        type="button"
                        aria-label={`Retirer ${fichier.name}`}
                        onClick={() => setDiplomes((actuels) => actuels.filter((f) => f !== fichier))}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>

                <label className="ok-line">
                  <input type="checkbox" required checked={consentement} onChange={(e) => setConsentement(e.target.checked)} />
                  <span className="box">✓</span>
                  <span>
                    J’accepte que Hari Online Club conserve ces informations et documents pour étudier ma candidature
                    (voir la <a href="/confidentialite">politique de confidentialité</a>).
                  </span>
                </label>

                {erreur && (
                  <p role="alert" className="err show" style={{ marginBottom: 18 }}>
                    {erreur}
                  </p>
                )}

                <button type="submit" className="btn btn-gold send-b" disabled={!!etape}>
                  {etape ?? 'Envoyer ma candidature'} <FlecheBouton />
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
