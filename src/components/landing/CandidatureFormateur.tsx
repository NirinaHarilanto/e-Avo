import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { SLUG_ETABLISSEMENT_PRINCIPAL } from '../../lib/etablissement'
import { DIPLOMES_DECLARES, type DiplomeDeclare } from '../../lib/recrutement'

const ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png'
const TAILLE_MAX = 10 * 1024 * 1024

const champ = {
  width: '100%',
  boxSizing: 'border-box' as const,
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '10px 13px',
  fontSize: 14,
  color: 'var(--ink)',
  background: '#fff',
  fontFamily: 'inherit',
}
const etiquette = { display: 'flex', flexDirection: 'column' as const, gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }

/* Canal d'entrée des candidats formateurs — bouton « Rejoignez-nous ! » de la vitrine (demande
   client du 2026-09-29). Les fichiers partent directement dans le stockage privé par URL signée
   (api/recrutement/preparer-envoi.ts), puis le dossier est enregistré (candidater.ts). */
export function CandidatureFormateur() {
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [ville, setVille] = useState('')
  const [diplome, setDiplome] = useState<DiplomeDeclare | ''>('')
  const [motivation, setMotivation] = useState('')
  const [experiences, setExperiences] = useState('')
  const [cv, setCv] = useState<File | null>(null)
  const [diplomes, setDiplomes] = useState<File[]>([])
  const [consentement, setConsentement] = useState(false)
  const [etape, setEtape] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoye, setEnvoye] = useState(false)

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
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
    <div className="page-claire" style={{ minHeight: '100vh', background: 'var(--bg-page)', padding: '28px 16px 60px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <a href="/" aria-label="Retour à l’accueil">
            <img src="/logo-hoc.png" alt="Hari Online Club" style={{ height: 44, width: 'auto', display: 'block' }} />
          </a>
          <a href="/" className="bouton-contour">
            ← Retour au site
          </a>
        </header>

        <div>
          <h1 style={{ fontSize: 30, margin: '0 0 8px', color: 'var(--ink)' }}>Rejoignez-nous !</h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--muted)', margin: 0 }}>
            Vous êtes formateur ou formatrice d’anglais et souhaitez enseigner en ligne avec Hari Online Club ? Présentez-vous
            ci-dessous. Pièce obligatoire : une <strong>licence en études anglophones</strong> ou une{' '}
            <strong>certification TEFL reconnue</strong>.
          </p>
        </div>

        {envoye ? (
          <div className="card" style={{ padding: 28, borderRadius: 16 }}>
            <h2 style={{ margin: '0 0 10px', color: 'var(--ink)' }}>Merci, votre candidature est bien arrivée</h2>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>
              Notre équipe étudie votre dossier. Si votre profil correspond à nos besoins, nous vous contacterons pour un
              premier appel de pré-sélection, suivi de tests d’anglais et d’une simulation de cours sur Google Meet.
            </p>
            <a href="/" className="bouton-contour" style={{ display: 'inline-block', marginTop: 18 }}>
              Retour au site
            </a>
          </div>
        ) : (
          <form onSubmit={envoyer} className="card" style={{ padding: 26, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <h2 style={{ margin: 0, fontSize: 18, color: 'var(--ink)' }}>Vos informations</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <label style={etiquette}>
                Prénom *
                <input required value={prenom} onChange={(e) => setPrenom(e.target.value)} style={champ} autoComplete="given-name" />
              </label>
              <label style={etiquette}>
                Nom *
                <input required value={nom} onChange={(e) => setNom(e.target.value)} style={champ} autoComplete="family-name" />
              </label>
              <label style={etiquette}>
                E-mail *
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={champ} autoComplete="email" />
              </label>
              <label style={etiquette}>
                Téléphone / WhatsApp
                <input value={telephone} onChange={(e) => setTelephone(e.target.value)} style={champ} autoComplete="tel" />
              </label>
              <label style={etiquette}>
                Ville
                <input value={ville} onChange={(e) => setVille(e.target.value)} style={champ} autoComplete="address-level2" />
              </label>
              <label style={etiquette}>
                Diplôme ou certification *
                <select required value={diplome} onChange={(e) => setDiplome(e.target.value as DiplomeDeclare)} style={champ}>
                  <option value="">Choisir…</option>
                  {DIPLOMES_DECLARES.map((d) => (
                    <option key={d.valeur} value={d.valeur}>
                      {d.libelle}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label style={etiquette}>
              Vos motivations *
              <textarea required rows={4} maxLength={5000} value={motivation} onChange={(e) => setMotivation(e.target.value)} style={{ ...champ, resize: 'vertical' }} placeholder="Pourquoi souhaitez-vous enseigner avec Hari Online Club ?" />
            </label>
            <label style={etiquette}>
              Vos expériences professionnelles *
              <textarea required rows={5} maxLength={5000} value={experiences} onChange={(e) => setExperiences(e.target.value)} style={{ ...champ, resize: 'vertical' }} placeholder="Postes occupés, années d’enseignement, publics (adultes, enfants, entreprises), cours en ligne…" />
            </label>

            <h2 style={{ margin: '6px 0 0', fontSize: 18, color: 'var(--ink)' }}>Vos documents</h2>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>PDF, Word, JPEG ou PNG, 10 Mo maximum par fichier.</p>
            <label style={etiquette}>
              CV *
              <input required type="file" accept={ACCEPT} onChange={(e) => setCv(e.target.files?.[0] ?? null)} style={champ} />
            </label>
            <label style={etiquette}>
              Diplômes ou certificats (licence en études anglophones, TEFL…) *
              <input
                required
                type="file"
                multiple
                accept={ACCEPT}
                onChange={(e) => setDiplomes(Array.from(e.target.files ?? []).slice(0, 5))}
                style={champ}
              />
              {diplomes.length > 0 && (
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>{diplomes.map((d) => d.name).join(', ')}</span>
              )}
            </label>

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--ink-2)' }}>
              <input type="checkbox" required checked={consentement} onChange={(e) => setConsentement(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                J’accepte que Hari Online Club conserve ces informations et documents pour étudier ma candidature
                (voir la <a href="/confidentialite">politique de confidentialité</a>).
              </span>
            </label>

            {erreur && (
              <p role="alert" style={{ margin: 0, fontSize: 13, color: '#b3261e', background: 'rgba(179,38,30,.08)', borderRadius: 10, padding: '10px 13px' }}>
                {erreur}
              </p>
            )}

            <button
              type="submit"
              disabled={!!etape}
              className="btn-shine"
              style={{ background: 'var(--accent-blue-gradient)', color: '#fff', border: 'none', alignSelf: 'flex-start', opacity: etape ? 0.7 : 1 }}
            >
              {etape ?? 'Envoyer ma candidature →'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
