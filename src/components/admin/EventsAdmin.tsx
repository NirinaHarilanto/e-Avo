import { useState, type ChangeEvent } from 'react'
import { AdminLayout } from '../layout/AdminLayout'
import { useProfileContext } from '../../context/ProfileContext'
import { supabase } from '../../lib/supabaseClient'
import { urlImageEvent, useTousLesEvents, type Event } from '../../hooks/useEvents'
import { EnTetePage } from '../ui/EnTetePage'
import { GrilleStats, Stat } from '../ui/Stat'
import { GroupeSection } from '../ui/Section'
import { Modale } from '../ui/Modale'
import { ModaleConfirmation } from '../ui/ModaleConfirmation'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur } from '../ui/Etats'
import { Champ, champStyle } from '../ui/Champ'
import { boutonDangerStyle, boutonNeutreStyle, boutonPrimaireStyle, boutonSecondaireStyle } from '../ui/Boutons'
import { Icone } from '../ui/Icones'

/* Gestion des événements affichés dans la section Events de la vitrine — demande client du
   2026-10-19 (point 12) : « section Events dans l'espace admin, admin pourra rajouter du contenu
   events depuis l'espace admin et ça s'affichera dans la section Events de la page principale ».

   Un événement naît en BROUILLON : on le prépare, on relit, puis on publie. Sans ce palier, toute
   création apparaîtrait en ligne à la première frappe — et c'est le site public. */

const TYPES_IMAGE = ['image/jpeg', 'image/png', 'image/webp']
/* 3 Mo, la borne du bucket `events` (0130) : refusée ici aussi pour dire pourquoi, plutôt que de
   laisser le stockage renvoyer une erreur technique. */
const TAILLE_MAX_IMAGE = 3 * 1024 * 1024

/* `datetime-local` veut « AAAA-MM-JJTHH:MM » en heure LOCALE, alors que la base stocke un instant
   en UTC. Les deux conversions passent donc par les composantes locales de la date, jamais par
   `toISOString()` — qui décalerait l'heure affichée du décalage du fuseau. */
function versChampDateHeure(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const deuxChiffres = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}T${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`
}

function depuisChampDateHeure(valeur: string): string | null {
  if (!valeur) return null
  const d = new Date(valeur)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function dateLisible(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

function FormulaireEvent({
  etablissementId,
  profileId,
  event,
  onFermer,
  onEnregistre,
}: {
  etablissementId: string
  profileId: string
  /* `null` pour une création. */
  event: Event | null
  onFermer: () => void
  onEnregistre: () => void
}) {
  const [titre, setTitre] = useState(event?.titre ?? '')
  const [accroche, setAccroche] = useState(event?.accroche ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [debut, setDebut] = useState(versChampDateHeure(event?.debut ?? null))
  const [fin, setFin] = useState(versChampDateHeure(event?.fin ?? null))
  const [lieu, setLieu] = useState(event?.lieu ?? '')
  const [lienUrl, setLienUrl] = useState(event?.lien_url ?? '')
  const [lienLibelle, setLienLibelle] = useState(event?.lien_libelle ?? '')
  const [imagePath, setImagePath] = useState(event?.image_path ?? null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const debutIso = depuisChampDateHeure(debut)
  const finIso = depuisChampDateHeure(fin)
  const complet = titre.trim().length > 0 && description.trim().length > 0 && debutIso !== null
  /* Les deux contraintes de la table (0130) sont vérifiées ici AUSSI, pour les dire en français
     plutôt que de laisser remonter un message Postgres. */
  const finInvalide = finIso !== null && debutIso !== null && finIso <= debutIso
  const lienIncomplet = (lienUrl.trim().length > 0) !== (lienLibelle.trim().length > 0)

  async function televerserImage(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0]
    e.target.value = ''
    if (!fichier) return
    if (!TYPES_IMAGE.includes(fichier.type)) {
      setErreur('L’image doit être au format JPEG, PNG ou WebP.')
      return
    }
    if (fichier.size > TAILLE_MAX_IMAGE) {
      setErreur('L’image ne doit pas dépasser 3 Mo.')
      return
    }
    setEnCours(true)
    setErreur(null)
    const extension = fichier.type === 'image/png' ? 'png' : fichier.type === 'image/webp' ? 'webp' : 'jpg'
    /* Nom tiré au hasard et non celui du fichier : deux admins qui déposent « affiche.jpg » ne
       doivent pas se recouvrir, et le nom d'origine n'apporte rien côté public. */
    const chemin = `${etablissementId}/${crypto.randomUUID()}.${extension}`
    const { error } = await supabase.storage.from('events').upload(chemin, fichier, { contentType: fichier.type })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setImagePath(chemin)
  }

  async function enregistrer() {
    if (!complet || finInvalide || lienIncomplet) return
    setEnCours(true)
    setErreur(null)

    const champs = {
      titre: titre.trim(),
      accroche: accroche.trim() || null,
      description: description.trim(),
      debut: debutIso as string,
      fin: finIso,
      lieu: lieu.trim() || null,
      image_path: imagePath,
      lien_url: lienUrl.trim() || null,
      lien_libelle: lienLibelle.trim() || null,
    }

    const { error } = event
      ? await supabase.from('events').update({ ...champs, updated_at: new Date().toISOString() }).eq('id', event.id)
      : await supabase.from('events').insert({ ...champs, etablissement_id: etablissementId, cree_par: profileId })

    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    onEnregistre()
  }

  const apercu = urlImageEvent(imagePath)

  return (
    <Modale titre={event ? 'Modifier l’événement' : 'Nouvel événement'} onFermer={onFermer} largeurMax={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        <Champ label="Titre" obligatoire>
          <input value={titre} onChange={(e) => setTitre(e.target.value)} style={champStyle} placeholder="Atelier conversation du samedi" />
        </Champ>

        <Champ label="Accroche" aide="Une ligne mise en avant sur la carte, au-dessus de la description.">
          <input value={accroche} onChange={(e) => setAccroche(e.target.value)} style={champStyle} placeholder="Ouvert à tous les niveaux" />
        </Champ>

        <Champ label="Description" obligatoire>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            style={{ ...champStyle, resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="Ce qui se passe, pour qui, ce qu’il faut prévoir…"
          />
        </Champ>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 11 }}>
          <Champ label="Début" obligatoire>
            <input type="datetime-local" value={debut} onChange={(e) => setDebut(e.target.value)} style={champStyle} />
          </Champ>
          <Champ label="Fin" aide="Facultative : inutile pour un événement d’une journée entière.">
            <input type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} style={champStyle} />
          </Champ>
        </div>
        {finInvalide && <MessageErreur>La fin doit être postérieure au début.</MessageErreur>}

        <Champ label="Lieu" aide="« En ligne (Google Meet) », « Antananarivo »… Laissez vide si cela n’a pas de sens.">
          <input value={lieu} onChange={(e) => setLieu(e.target.value)} style={champStyle} />
        </Champ>

        <Champ label="Image" aide="JPEG, PNG ou WebP, 3 Mo maximum. Sans image, la carte s’affiche avec le dégradé de la marque.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {apercu && (
              <img
                src={apercu}
                alt=""
                style={{ width: 108, height: 61, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
              />
            )}
            <label style={{ ...boutonSecondaireStyle, cursor: 'pointer' }}>
              <Icone nom="documents" taille={13} />
              {apercu ? 'Remplacer' : 'Choisir une image'}
              <input type="file" accept={TYPES_IMAGE.join(',')} onChange={televerserImage} style={{ display: 'none' }} />
            </label>
            {apercu && (
              /* Retire l'image de la carte sans effacer le fichier du stockage : l'admin peut
                 changer d'avis, et un fichier orphelin de quelques centaines de kilo-octets coûte
                 moins cher qu'une image perdue par erreur. */
              <button type="button" onClick={() => setImagePath(null)} style={boutonNeutreStyle}>
                Retirer
              </button>
            )}
          </div>
        </Champ>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 11 }}>
          <Champ label="Lien du bouton" aide="Inscription, billetterie, page de détails…">
            <input value={lienUrl} onChange={(e) => setLienUrl(e.target.value)} style={champStyle} placeholder="https://…" />
          </Champ>
          <Champ label="Texte du bouton">
            <input value={lienLibelle} onChange={(e) => setLienLibelle(e.target.value)} style={champStyle} placeholder="Je m’inscris" />
          </Champ>
        </div>
        {lienIncomplet && <MessageErreur>Le lien et le texte du bouton vont ensemble : renseignez les deux, ou aucun.</MessageErreur>}

        {erreur && <MessageErreur>{erreur}</MessageErreur>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}>
          <button type="button" onClick={onFermer} style={boutonNeutreStyle}>
            Annuler
          </button>
          <button
            type="button"
            onClick={enregistrer}
            disabled={enCours || !complet || finInvalide || lienIncomplet}
            className="btn-shine"
            style={{
              ...boutonPrimaireStyle,
              fontSize: 12.5,
              padding: '9px 18px',
              opacity: enCours || !complet || finInvalide || lienIncomplet ? 0.6 : 1,
            }}
          >
            {enCours ? 'Enregistrement…' : event ? 'Enregistrer' : 'Créer en brouillon'}
          </button>
        </div>
      </div>
    </Modale>
  )
}

function LigneEvent({
  event,
  passe,
  onModifier,
  onChange,
}: {
  event: Event
  /* Calculé une seule fois par la page, et non ici : l'heure courante lue pendant le rendu d'une
     ligne donnerait un résultat différent d'une ligne à l'autre au fil des réaffichages. */
  passe: boolean
  onModifier: () => void
  onChange: () => void
}) {
  const [enCours, setEnCours] = useState(false)
  const [suppressionOuverte, setSuppressionOuverte] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const publie = event.statut === 'publie'
  const image = urlImageEvent(event.image_path)

  async function basculerPublication() {
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase
      .from('events')
      .update({ statut: publie ? 'brouillon' : 'publie', updated_at: new Date().toISOString() })
      .eq('id', event.id)
    setEnCours(false)
    if (error) setErreur(error.message)
    else onChange()
  }

  async function supprimer() {
    setEnCours(true)
    setErreur(null)
    const { error } = await supabase.from('events').delete().eq('id', event.id)
    if (!error && event.image_path) {
      /* L'image part avec l'événement : plus rien ne la référence. Une erreur de stockage n'est
         pas remontée — l'événement, lui, est bien supprimé, et c'est ce que l'admin a demandé. */
      await supabase.storage.from('events').remove([event.image_path])
    }
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setSuppressionOuverte(false)
    onChange()
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 13,
        padding: '13px 15px',
        borderRadius: 12,
        border: '1px solid var(--border-soft, var(--border))',
        background: 'var(--surface)',
        opacity: passe && !publie ? 0.75 : 1,
      }}
    >
      {image && (
        <img
          src={image}
          alt=""
          style={{ width: 96, height: 54, objectFit: 'cover', borderRadius: 8, flexShrink: 0, alignSelf: 'flex-start' }}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexGrow: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{event.titre}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: publie ? 'var(--accent-teal)' : 'var(--muted)',
              background: publie ? 'rgba(111,227,192,.14)' : 'rgba(255,255,255,.04)',
              border: `1px solid ${publie ? 'rgba(111,227,192,.32)' : 'var(--border)'}`,
              borderRadius: 999,
              padding: '2px 8px',
            }}
          >
            {publie ? 'Publié' : 'Brouillon'}
          </span>
          {passe && (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-2)' }}>déjà passé</span>
          )}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          {dateLisible(event.debut)}
          {event.lieu ? ` · ${event.lieu}` : ''}
        </span>
        {event.accroche && <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{event.accroche}</span>}
        {erreur && <MessageErreur>{erreur}</MessageErreur>}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, flexShrink: 0, flexWrap: 'wrap' }}>
        <button type="button" onClick={onModifier} style={boutonSecondaireStyle}>
          Modifier
        </button>
        <button type="button" onClick={basculerPublication} disabled={enCours} style={{ ...boutonNeutreStyle, opacity: enCours ? 0.6 : 1 }}>
          {publie ? 'Dépublier' : 'Publier'}
        </button>
        <button type="button" onClick={() => setSuppressionOuverte(true)} style={boutonDangerStyle}>
          Supprimer
        </button>
      </div>

      {suppressionOuverte && (
        <ModaleConfirmation
          titre="Supprimer cet événement ?"
          description={`« ${event.titre} » et son image seront définitivement supprimés. Pour le retirer du site sans le perdre, utilisez plutôt « Dépublier ».`}
          libelleConfirmer="Supprimer"
          enCours={enCours}
          erreur={erreur}
          onConfirmer={supprimer}
          onFermer={() => setSuppressionOuverte(false)}
        />
      )}
    </div>
  )
}

export function EventsAdmin() {
  const { profile } = useProfileContext()
  const { events, maintenant, loading, recharger } = useTousLesEvents()
  /* `undefined` = fermé, `null` = création, un événement = édition. Trois états dans une seule
     variable plutôt qu'un booléen et un identifiant qui pourraient se contredire. */
  const [formulaire, setFormulaire] = useState<Event | null | undefined>(undefined)

  const publies = events.filter((e) => e.statut === 'publie')
  const aVenir = publies.filter((e) => new Date(e.debut).getTime() >= maintenant)

  return (
    <AdminLayout actif="Events">
      <EnTetePage
        compact
        titre="Events"
        actions={
          profile && (
            <button onClick={() => setFormulaire(null)} className="btn-shine" style={boutonPrimaireStyle}>
              <Icone nom="plus" taille={15} />
              Nouvel événement
            </button>
          )
        }
      />

      <GuideEvents />

      {!loading && events.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <GrilleStats min={170} compact>
            <Stat compact libelle="Événements" valeur={events.length} ton="or" />
            <Stat compact libelle="Publiés sur le site" valeur={publies.length} ton="teal" aide="Visibles dans la section Events de la vitrine" />
            <Stat
              compact
              libelle="À venir"
              valeur={aVenir.length}
              ton={aVenir.length > 0 ? 'teal' : 'neutre'}
              aide="Publiés et dont la date n’est pas passée"
            />
            <Stat
              compact
              libelle="Brouillons"
              valeur={events.length - publies.length}
              ton={events.length - publies.length > 0 ? 'alerte' : 'neutre'}
              aide="Préparés, pas encore visibles du public"
            />
          </GrilleStats>
        </div>
      )}

      {loading && <EtatChargement lignes={3} hauteur={82} />}

      {!loading && events.length === 0 && (
        <EtatVide
          icone="communication"
          titre="Aucun événement"
          description="Créez votre premier événement : il restera en brouillon jusqu’à ce que vous le publiiez, et apparaîtra alors dans la section Events du site public."
        />
      )}

      {!loading && events.length > 0 && (
        <GroupeSection titre={`Tous les événements (${events.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {events.map((event) => (
              <LigneEvent
                key={event.id}
                event={event}
                passe={new Date(event.debut).getTime() < maintenant}
                onModifier={() => setFormulaire(event)}
                onChange={recharger}
              />
            ))}
          </div>
        </GroupeSection>
      )}

      {formulaire !== undefined && profile && (
        <FormulaireEvent
          etablissementId={profile.etablissement_id}
          profileId={profile.id}
          event={formulaire}
          onFermer={() => setFormulaire(undefined)}
          onEnregistre={() => {
            setFormulaire(undefined)
            recharger()
          }}
        />
      )}
    </AdminLayout>
  )
}

function GuideEvents() {
  return (
    <div
      style={{
        marginBottom: 14,
        padding: '12px 15px',
        borderRadius: 12,
        border: '1px solid var(--border-soft, var(--border))',
        background: 'var(--surface-alt)',
        fontSize: 12.5,
        lineHeight: 1.65,
        color: 'var(--ink-2)',
      }}
    >
      Ce que vous publiez ici apparaît dans la section <strong>Events</strong> du site public, à côté de « Cours &
      tarifs » et « Témoignages ». Les événements à venir s’affichent en premier, du plus proche au plus lointain ; les
      événements passés restent visibles, estompés, pour montrer la vie du club. Un nouvel événement est créé en
      brouillon : rien n’est en ligne avant que vous ne cliquiez sur « Publier ».
    </div>
  )
}
