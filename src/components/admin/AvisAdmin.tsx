import { useMemo, useState, type ChangeEvent } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { useTousLesTemoignages, urlPhotoTemoignage, type Temoignage } from '../../hooks/useTemoignages'
import { supabase } from '../../lib/supabaseClient'
import type { StatutTemoignage } from '../../types/database.types'
import { EnTetePage } from '../ui/EnTetePage'
import { GuidePage } from '../ui/GuidePage'
import { Section } from '../ui/Section'
import { Onglets, type Onglet } from '../ui/Onglets'
import { GrilleStats, Stat } from '../ui/Stat'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { Champ, champStyle } from '../ui/Champ'
import { boutonPrimaireStyle, boutonSecondaireStyle, boutonNeutreStyle, boutonDangerStyle } from '../ui/Boutons'

/* Gestion des avis — demande client du 2026-10-13 : valider les avis déposés par les élèves en
   fin de parcours, et gérer (ajout, modification, suppression) les témoignages déjà en ligne.
   Une seule page pour les deux : ce sont les mêmes objets (table `temoignages`, 0128), à des
   stades différents de leur vie. Les séparer en deux écrans obligerait à chercher au même endroit
   deux fois.

   Les trois états ont chacun leur couleur d'accent, reprise sur l'intitulé de chaque bloc et sur
   la pastille de statut — demande client : « il faut que la gestion soit bien organisée
   ergonomiquement, avec les intitulés bien mises en valeur ». */

type OngletAvis = StatutTemoignage

const ETATS: Record<StatutTemoignage, { titre: string; couleur: string; pastille: string; aide: string }> = {
  en_attente: {
    titre: 'À valider',
    couleur: 'var(--accent-gold, #e9cf94)',
    pastille: 'En attente',
    aide: 'Avis déposés par vos élèves. Rien n’est visible sur le site tant que vous n’avez pas publié.',
  },
  publie: {
    titre: 'En ligne',
    couleur: 'var(--accent-teal)',
    pastille: 'Publié',
    aide: 'Ces témoignages s’affichent sur la page publique Témoignages, dans l’ordre défini ci-dessous.',
  },
  refuse: {
    titre: 'Écartés',
    couleur: 'var(--muted)',
    pastille: 'Écarté',
    aide: 'Non publiés. L’élève voit votre motif dans son espace et peut en proposer un autre.',
  },
}

/* Les photos ajoutées par l'admin vont dans le même bucket public que celles des élèves
   (`photos-profil`, 0128), sous un dossier à part : elles n'appartiennent à aucun profil. */
const DOSSIER_PHOTOS_ADMIN = 'temoignages'
const TYPES_PHOTO = ['image/jpeg', 'image/png', 'image/webp']

function PastilleStatut({ statut }: { statut: StatutTemoignage }) {
  const etat = ETATS[statut]
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '.04em',
        textTransform: 'uppercase',
        color: etat.couleur,
        border: `1px solid ${etat.couleur}`,
        borderRadius: 999,
        padding: '2px 9px',
        whiteSpace: 'nowrap',
      }}
    >
      {etat.pastille}
    </span>
  )
}

function Vignette({ temoignage, dossierAssets }: { temoignage: Temoignage; dossierAssets: string }) {
  const url = urlPhotoTemoignage(temoignage, dossierAssets)
  const initiales = temoignage.nom_affiche
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot.charAt(0))
    .join('')
    .toUpperCase()
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--surface-2, rgba(255,255,255,.06))',
        border: '1px solid var(--border-soft, var(--border))',
        color: 'var(--muted)',
        fontSize: 15,
        fontWeight: 700,
      }}
    >
      {url ? (
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        initiales || '—'
      )}
    </div>
  )
}

export function AvisAdmin() {
  const { profile, etablissement } = useProfileContext()
  const { temoignages, loading, recharger } = useTousLesTemoignages()
  const [onglet, setOnglet] = useState<OngletAvis>('en_attente')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null)
  const [edition, setEdition] = useState<Temoignage | null>(null)
  const [creation, setCreation] = useState(false)

  const dossierAssets = `/etablissements/${etablissement?.slug ?? ''}`

  const parStatut = useMemo(
    () => ({
      en_attente: temoignages.filter((t) => t.statut === 'en_attente'),
      publie: temoignages.filter((t) => t.statut === 'publie').sort((a, b) => a.ordre - b.ordre),
      refuse: temoignages.filter((t) => t.statut === 'refuse'),
    }),
    [temoignages],
  )

  const onglets: readonly Onglet<OngletAvis>[] = [
    { value: 'en_attente', label: ETATS.en_attente.titre, compteur: parStatut.en_attente.length },
    { value: 'publie', label: ETATS.publie.titre, compteur: parStatut.publie.length },
    { value: 'refuse', label: ETATS.refuse.titre, compteur: parStatut.refuse.length },
  ]

  async function changerStatut(temoignage: Temoignage, statut: StatutTemoignage, motif?: string) {
    setEnCours(temoignage.id)
    setErreur(null)
    /* Un avis qui vient d'être publié passe EN TÊTE, et avec un rang qui n'appartient qu'à lui :
       le rang par défaut est 0, déjà pris par le premier des témoignages repris de l'ancienne page
       (0128). Deux rangs identiques rendraient « Monter » et « Descendre » sans effet entre eux,
       puisqu'ils échangent justement ces rangs. */
    const rangTete = Math.min(0, ...parStatut.publie.map((t) => t.ordre)) - 1

    /* Au moment de publier, la photo de l'auteur est reprise de son profil : un élève dépose
       souvent son avis d'abord et ajoute sa photo ensuite (ou la change). Sans cela, l'avis
       partirait en ligne sans la photo pourtant déposée — demande client du 2026-10-13 :
       l'avis apparaît « avec la photo de l'étudiant ». Une photo choisie à la main par l'admin
       (`photo_fichier`, ou un fichier qu'il a téléversé) n'est jamais écrasée. */
    let photoAuteur: string | null | undefined
    if (statut === 'publie' && temoignage.auteur_profile_id && !temoignage.photo_fichier) {
      const { data: auteur } = await supabase
        .from('profiles')
        .select('photo_path')
        .eq('id', temoignage.auteur_profile_id)
        .maybeSingle()
      if (auteur?.photo_path) photoAuteur = auteur.photo_path
    }

    const { error } = await supabase
      .from('temoignages')
      .update({
        statut,
        ...(statut === 'publie' && temoignage.statut !== 'publie' ? { ordre: rangTete } : {}),
        ...(photoAuteur ? { photo_path: photoAuteur } : {}),
        motif_refus: statut === 'refuse' ? (motif?.trim() || null) : null,
        decide_le: new Date().toISOString(),
        decide_par: profile?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', temoignage.id)
    setEnCours(null)
    if (error) {
      setErreur(error.message)
      return
    }
    recharger()
  }

  async function supprimer(temoignage: Temoignage) {
    if (!window.confirm(`Supprimer définitivement le témoignage de ${temoignage.nom_affiche} ?`)) return
    setEnCours(temoignage.id)
    setErreur(null)
    const { error } = await supabase.from('temoignages').delete().eq('id', temoignage.id)
    // La photo n'est retirée que si elle appartenait à ce témoignage seul : celle d'un élève vit
    // sur son profil et doit lui rester, même si son avis est supprimé.
    if (!error && temoignage.photo_path?.startsWith(`${DOSSIER_PHOTOS_ADMIN}/`)) {
      await supabase.storage.from('photos-profil').remove([temoignage.photo_path])
    }
    setEnCours(null)
    if (error) {
      setErreur(error.message)
      return
    }
    recharger()
  }

  async function deplacer(temoignage: Temoignage, sens: -1 | 1) {
    const liste = [...parStatut.publie]
    const index = liste.findIndex((t) => t.id === temoignage.id)
    if (index < 0 || !liste[index + sens]) return
    setEnCours(temoignage.id)
    setErreur(null)
    /* La liste entière est renumérotée, plutôt que deux rangs échangés : rien ne garantit que les
       rangs soient tous distincts (un témoignage ajouté à la main, un import, deux publications
       simultanées), et deux rangs égaux feraient un bouton qui ne fait rien — le genre de défaut
       qu'on met longtemps à comprendre. Une vingtaine de lignes à réécrire, c'est sans effet
       perceptible, et la liste en ressort toujours saine. */
    ;[liste[index], liste[index + sens]] = [liste[index + sens], liste[index]]
    const resultats = await Promise.all(
      liste.map((t, rang) => supabase.from('temoignages').update({ ordre: rang }).eq('id', t.id)),
    )
    setEnCours(null)
    const echec = resultats.find((r) => r.error)
    if (echec?.error) {
      setErreur(echec.error.message)
      return
    }
    recharger()
  }

  const liste = parStatut[onglet]
  const etat = ETATS[onglet]

  return (
    <AdminLayout actif="Gestion des avis">
      <EnTetePage
        titre="Gestion des avis"
        description="Les avis d’ensemble déposés par vos élèves en fin de parcours, et les témoignages affichés sur votre site. À ne pas confondre avec les enquêtes de satisfaction remplies après chaque séance, visibles sur la fiche de chaque professeur."
        actions={
          <button type="button" style={boutonPrimaireStyle} onClick={() => setCreation(true)}>
            + Ajouter un témoignage
          </button>
        }
      />

      <GuidePage
        id="avis"
        etapes={[
          <>
            Un élève qui a consommé <strong>toutes les heures de son forfait</strong> (individuel, duo
            ou collectif) reçoit une notification l’invitant à raconter son parcours depuis son espace
            personnel. Son avis arrive ici, dans <strong>À valider</strong>.
          </>,
          <>
            <strong>Publier</strong> fait apparaître l’avis sur la page Témoignages du site, avec la
            photo de profil de l’élève s’il en a déposé une. <strong>Écarter</strong> ne le publie pas :
            l’élève voit le motif que vous indiquez et peut en proposer un autre.
          </>,
          <>
            L’onglet <strong>En ligne</strong> regroupe tous les témoignages visibles, y compris ceux
            d’avant cette fonctionnalité. Vous pouvez les modifier, les réordonner (ce sont les
            premiers que voient vos visiteurs) ou les retirer.
          </>,
          <>
            <strong>Ajouter un témoignage</strong> sert aux avis reçus hors de l’application (message,
            e-mail, oral) : vous saisissez vous-même le nom, l’année et le texte.
          </>,
        ]}
      />

      <GrilleStats>
        <Stat libelle="À valider" valeur={parStatut.en_attente.length} ton="or" aide="Avis en attente de votre relecture" />
        <Stat libelle="En ligne" valeur={parStatut.publie.length} ton="teal" aide="Visibles sur la page Témoignages" />
        <Stat libelle="Écartés" valeur={parStatut.refuse.length} ton="neutre" aide="Non publiés" />
      </GrilleStats>

      <div style={{ marginTop: 18 }}>
        <Onglets onglets={onglets} actif={onglet} onChange={setOnglet} etiquette="Filtrer les avis" />
      </div>

      {erreur && (
        <div style={{ marginTop: 14 }}>
          <MessageErreur>{erreur}</MessageErreur>
        </div>
      )}

      <Section
        titre={<span style={{ color: etat.couleur }}>{etat.titre}</span>}
        description={etat.aide}
        compteur={liste.length}
        style={{ marginTop: 14 }}
      >
        {loading ? (
          <EtatChargement lignes={3} />
        ) : liste.length === 0 ? (
          <EtatVide
            titre={
              onglet === 'en_attente'
                ? 'Aucun avis à valider'
                : onglet === 'publie'
                  ? 'Aucun témoignage en ligne'
                  : 'Aucun avis écarté'
            }
            description={
              onglet === 'en_attente'
                ? 'Les avis de vos élèves apparaîtront ici dès qu’ils en déposeront un.'
                : onglet === 'publie'
                  ? 'Publiez un avis en attente, ou ajoutez un témoignage reçu hors de l’application.'
                  : 'Les avis que vous n’aurez pas retenus se retrouveront ici.'
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {liste.map((temoignage, index) => (
              <CarteAvis
                key={temoignage.id}
                temoignage={temoignage}
                dossierAssets={dossierAssets}
                occupe={enCours === temoignage.id}
                premier={index === 0}
                dernier={index === liste.length - 1}
                onPublier={() => changerStatut(temoignage, 'publie')}
                onEcarter={(motif) => changerStatut(temoignage, 'refuse', motif)}
                onRetirer={() => changerStatut(temoignage, 'en_attente')}
                onModifier={() => setEdition(temoignage)}
                onSupprimer={() => supprimer(temoignage)}
                onMonter={() => deplacer(temoignage, -1)}
                onDescendre={() => deplacer(temoignage, 1)}
              />
            ))}
          </div>
        )}
      </Section>

      {(creation || edition) && (
        <FormulaireTemoignage
          temoignage={edition}
          etablissementId={profile?.etablissement_id ?? ''}
          dossierAssets={dossierAssets}
          onFerme={() => {
            setCreation(false)
            setEdition(null)
          }}
          onEnregistre={() => {
            setCreation(false)
            setEdition(null)
            recharger()
          }}
        />
      )}
    </AdminLayout>
  )
}

interface CarteAvisProps {
  temoignage: Temoignage
  dossierAssets: string
  occupe: boolean
  premier: boolean
  dernier: boolean
  onPublier: () => void
  onEcarter: (motif: string) => void
  onRetirer: () => void
  onModifier: () => void
  onSupprimer: () => void
  onMonter: () => void
  onDescendre: () => void
}

function CarteAvis({
  temoignage,
  dossierAssets,
  occupe,
  premier,
  dernier,
  onPublier,
  onEcarter,
  onRetirer,
  onModifier,
  onSupprimer,
  onMonter,
  onDescendre,
}: CarteAvisProps) {
  const [motifOuvert, setMotifOuvert] = useState(false)
  const [motif, setMotif] = useState('')

  return (
    <article
      style={{
        border: '1px solid var(--border-soft, var(--border))',
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        background: 'var(--surface-2, rgba(255,255,255,.03))',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Vignette temoignage={temoignage} dossierAssets={dossierAssets} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14.5, color: 'var(--ink)' }}>{temoignage.nom_affiche}</strong>
            <PastilleStatut statut={temoignage.statut} />
            {temoignage.annee && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{temoignage.annee}</span>}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {temoignage.auteur_profile_id ? 'Déposé par l’élève' : 'Saisi par l’établissement'} ·{' '}
            {new Date(temoignage.soumis_le).toLocaleDateString('fr-FR')}
          </span>
        </div>
      </header>

      <blockquote
        style={{
          margin: 0,
          padding: '10px 13px',
          borderLeft: `3px solid ${ETATS[temoignage.statut].couleur}`,
          borderRadius: 8,
          background: 'var(--surface, rgba(0,0,0,.12))',
          fontSize: 13,
          lineHeight: 1.65,
          color: 'var(--ink-2)',
        }}
      >
        « {temoignage.texte} »
      </blockquote>

      {temoignage.statut === 'refuse' && temoignage.motif_refus && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
          <strong>Motif communiqué à l’élève :</strong> {temoignage.motif_refus}
        </p>
      )}

      {motifOuvert ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Champ label="Motif" aide="Transmis à l’élève dans son espace. Facultatif, mais toujours préférable.">
            <input
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Par exemple : avis trop court pour être publié."
              style={champStyle}
            />
          </Champ>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" style={boutonDangerStyle} onClick={() => onEcarter(motif)} disabled={occupe}>
              Confirmer l’écartement
            </button>
            <button type="button" style={boutonNeutreStyle} onClick={() => setMotifOuvert(false)} disabled={occupe}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {temoignage.statut !== 'publie' && (
            <button type="button" style={boutonPrimaireStyle} onClick={onPublier} disabled={occupe}>
              {temoignage.statut === 'refuse' ? 'Publier quand même' : 'Publier'}
            </button>
          )}
          {temoignage.statut === 'en_attente' && (
            <button type="button" style={boutonSecondaireStyle} onClick={() => setMotifOuvert(true)} disabled={occupe}>
              Écarter…
            </button>
          )}
          {temoignage.statut === 'publie' && (
            <>
              <button type="button" style={boutonSecondaireStyle} onClick={onMonter} disabled={occupe || premier}>
                ↑ Monter
              </button>
              <button type="button" style={boutonSecondaireStyle} onClick={onDescendre} disabled={occupe || dernier}>
                ↓ Descendre
              </button>
              <button type="button" style={boutonNeutreStyle} onClick={onRetirer} disabled={occupe}>
                Retirer du site
              </button>
            </>
          )}
          <button type="button" style={boutonSecondaireStyle} onClick={onModifier} disabled={occupe}>
            Modifier
          </button>
          <button type="button" style={boutonDangerStyle} onClick={onSupprimer} disabled={occupe}>
            Supprimer
          </button>
        </div>
      )}
    </article>
  )
}

interface FormulaireProps {
  temoignage: Temoignage | null
  etablissementId: string
  dossierAssets: string
  onFerme: () => void
  onEnregistre: () => void
}

/* Saisie ou correction d'un témoignage par l'admin. Sert aux deux cas demandés : l'ajout d'un avis
   reçu hors de l'application, et la modification d'un témoignage existant — y compris ceux repris
   de l'ancienne page codée en dur, dont la photo est un fichier livré avec le site
   (`photo_fichier`) et non une image téléversée. Ce champ-là n'est pas modifiable ici : il
   désigne un fichier du dépôt, pas un contenu administrable. */
function FormulaireTemoignage({ temoignage, etablissementId, dossierAssets, onFerme, onEnregistre }: FormulaireProps) {
  const [nom, setNom] = useState(temoignage?.nom_affiche ?? '')
  const [texte, setTexte] = useState(temoignage?.texte ?? '')
  const [annee, setAnnee] = useState(String(temoignage?.annee ?? new Date().getFullYear()))
  const [photoPath, setPhotoPath] = useState(temoignage?.photo_path ?? null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const apercu = urlPhotoTemoignage(
    { photo_fichier: temoignage?.photo_fichier ?? null, photo_path: photoPath },
    dossierAssets,
  )
  const complet = nom.trim().length > 0 && texte.trim().length > 0

  async function televerserPhoto(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0]
    e.target.value = ''
    if (!fichier) return
    if (!TYPES_PHOTO.includes(fichier.type)) {
      setErreur('La photo doit être une image JPEG, PNG ou WebP.')
      return
    }
    setEnCours(true)
    setErreur(null)
    const extension = fichier.type === 'image/png' ? 'png' : fichier.type === 'image/webp' ? 'webp' : 'jpg'
    const chemin = `${DOSSIER_PHOTOS_ADMIN}/${crypto.randomUUID()}.${extension}`
    const { error } = await supabase.storage.from('photos-profil').upload(chemin, fichier, { contentType: fichier.type })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setPhotoPath(chemin)
  }

  async function enregistrer() {
    setEnCours(true)
    setErreur(null)
    const anneeNombre = Number(annee)
    const champs = {
      nom_affiche: nom.trim(),
      texte: texte.trim(),
      annee: Number.isFinite(anneeNombre) && anneeNombre > 0 ? anneeNombre : null,
      // Jamais les deux à la fois (contrainte `temoignages_une_seule_photo`, 0128) : une photo
      // téléversée remplace le fichier livré avec le site.
      photo_path: photoPath,
      photo_fichier: photoPath ? null : (temoignage?.photo_fichier ?? null),
      updated_at: new Date().toISOString(),
    }
    const { error } = temoignage
      ? await supabase.from('temoignages').update(champs).eq('id', temoignage.id)
      : await supabase.from('temoignages').insert({
          ...champs,
          etablissement_id: etablissementId,
          // Saisi par l'établissement : il n'y a personne à faire attendre, le témoignage est
          // publié directement.
          statut: 'publie',
          decide_le: new Date().toISOString(),
        })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onEnregistre()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={temoignage ? 'Modifier le témoignage' : 'Ajouter un témoignage'}
      onClick={onFerme}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        zIndex: 60,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: 'min(620px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: 20 }}
      >
        <h2 style={{ fontSize: 16, color: 'var(--accent-gold, #e9cf94)', margin: '0 0 14px' }}>
          {temoignage ? 'Modifier le témoignage' : 'Ajouter un témoignage'}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Champ label="Nom affiché" obligatoire>
            <input value={nom} onChange={(e) => setNom(e.target.value)} style={champStyle} placeholder="Prénom Nom" />
          </Champ>
          <Champ label="Année" aide="Affichée sur la carte, à côté des étoiles.">
            <input value={annee} onChange={(e) => setAnnee(e.target.value)} style={champStyle} inputMode="numeric" />
          </Champ>
          <Champ label="Témoignage" obligatoire>
            <textarea
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              rows={7}
              style={{ ...champStyle, resize: 'vertical', lineHeight: 1.6 }}
            />
          </Champ>
          <Champ label="Photo" aide="Facultative : sans photo, les initiales s’affichent à la place.">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {apercu && (
                <img
                  src={apercu}
                  alt=""
                  style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover' }}
                />
              )}
              <label
                style={{
                  ...boutonSecondaireStyle,
                  display: 'inline-flex',
                  width: 'fit-content',
                  cursor: enCours ? 'default' : 'pointer',
                  opacity: enCours ? 0.6 : 1,
                }}
              >
                {apercu ? 'Remplacer la photo' : 'Ajouter une photo'}
                <input
                  type="file"
                  accept={TYPES_PHOTO.join(',')}
                  onChange={televerserPhoto}
                  disabled={enCours}
                  style={{ display: 'none' }}
                />
              </label>
              {photoPath && (
                <button type="button" style={boutonNeutreStyle} onClick={() => setPhotoPath(null)} disabled={enCours}>
                  Retirer
                </button>
              )}
            </div>
          </Champ>

          {erreur && <MessageErreur>{erreur}</MessageErreur>}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
            <button type="button" style={boutonPrimaireStyle} onClick={enregistrer} disabled={enCours || !complet}>
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button type="button" style={boutonNeutreStyle} onClick={onFerme} disabled={enCours}>
              Annuler
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
