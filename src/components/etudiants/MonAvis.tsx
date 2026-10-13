import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import type { Database } from '../../types/database.types'
import { useMonTemoignage } from '../../hooks/useTemoignages'
import { Section } from '../ui/Section'
import { Champ, champStyle } from '../ui/Champ'
import { MessageErreur, MessageInfo, MessageSucces } from '../ui/Etats'
import { boutonPrimaireStyle, boutonNeutreStyle } from '../ui/Boutons'

type Profile = Database['public']['Tables']['profiles']['Row']

const LONGUEUR_MIN = 40

/* « Mon avis » — demande client du 2026-10-13 : l'élève qui a terminé ses heures est invité à
   « renseigner un avis sur son parcours pédagogique dans son espace personnel », avis ensuite
   « transféré à l'admin pour validation ».

   Le bloc est visible en permanence, pas seulement après la notification de fin de forfait : un
   élève peut vouloir écrire plus tard, ou avoir manqué la notification. C'est l'INVITATION qui est
   déclenchée par la fin du parcours (api/_lib/finDeForfait.ts), pas la possibilité d'écrire.

   Les quatre situations possibles sont traitées explicitement : rien d'écrit, en attente de
   relecture, publié, ou écarté — avec, dans ce dernier cas, le motif et la possibilité d'en
   proposer un autre. Un avis publié n'est plus modifiable depuis ici : il est en ligne, son
   contenu relève alors de l'administration (la RLS le refuserait de toute façon). */
export function MonAvis({ profile }: { profile: Profile }) {
  const { temoignage, loading, recharger } = useMonTemoignage(profile.id)
  const [brouillon, setBrouillon] = useState('')
  const [edition, setEdition] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const nomAffiche = [profile.prenom, profile.nom].filter(Boolean).join(' ') || 'Un élève'
  const texteSaisi = brouillon.trim()
  const manquant = LONGUEUR_MIN - texteSaisi.length
  const assezLong = manquant <= 0

  async function envoyer() {
    setEnCours(true)
    setErreur(null)
    /* Un avis en attente est corrigé sur place ; sinon (rien encore écrit, ou avis précédemment
       écarté) une nouvelle ligne est créée — l'historique des avis écartés reste au dossier.
       Le statut n'est jamais décidé ici : la RLS impose « en attente » à l'insertion comme à la
       mise à jour (0128), c'est elle qui garantit qu'un avis ne peut pas se publier tout seul. */
    const enAttente = temoignage?.statut === 'en_attente'
    const { error } = enAttente
      ? await supabase
          .from('temoignages')
          .update({ texte: texteSaisi, updated_at: new Date().toISOString() })
          .eq('id', temoignage.id)
      : await supabase.from('temoignages').insert({
          etablissement_id: profile.etablissement_id,
          auteur_profile_id: profile.id,
          nom_affiche: nomAffiche,
          texte: texteSaisi,
          annee: new Date().getFullYear(),
          photo_path: profile.photo_path,
          statut: 'en_attente',
        })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }
    setEdition(false)
    setBrouillon('')
    recharger()
  }

  function ouvrirEdition(texteInitial: string) {
    setBrouillon(texteInitial)
    setErreur(null)
    setEdition(true)
  }

  if (loading) return null

  const formulaire = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Champ
        label="Votre avis"
        aide={`Racontez votre parcours : ce que vous êtes venu chercher, ce qui a changé. ${LONGUEUR_MIN} caractères minimum.`}
      >
        <textarea
          value={brouillon}
          onChange={(e) => setBrouillon(e.target.value)}
          rows={6}
          placeholder="Ce que ces cours m’ont apporté…"
          style={{ ...champStyle, resize: 'vertical', lineHeight: 1.6 }}
        />
      </Champ>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
        Publié sous le nom <strong>{nomAffiche}</strong>
        {profile.photo_path
          ? ', avec votre photo de profil.'
          : '. Ajoutez une photo ci-dessus pour qu’elle accompagne votre avis.'}
      </p>
      {!assezLong && texteSaisi.length > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
          Encore {manquant} caractère{manquant > 1 ? 's' : ''} pour pouvoir envoyer.
        </p>
      )}
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" style={boutonPrimaireStyle} onClick={envoyer} disabled={enCours || !assezLong}>
          {enCours ? 'Envoi…' : 'Envoyer mon avis'}
        </button>
        <button type="button" style={boutonNeutreStyle} onClick={() => setEdition(false)} disabled={enCours}>
          Annuler
        </button>
      </div>
    </div>
  )

  return (
    <Section
      /* « sur mon parcours » n'est pas de trop : l'espace élève propose déjà une enquête de
         satisfaction APRÈS CHAQUE SÉANCE (0068), qui s'ouvre en pop-up et s'appelle elle aussi un
         avis. Les deux n'ont ni la même portée ni la même destination — celui-ci est public, une
         fois validé — et doivent se distinguer au premier coup d'œil. */
      titre="Mon avis sur mon parcours"
      description="Votre expérience d’ensemble, relue par l’équipe avant d’éventuellement rejoindre les témoignages du site."
      style={{ marginTop: 20 }}
    >
      {edition ? (
        formulaire
      ) : temoignage ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {temoignage.statut === 'en_attente' && (
            <MessageInfo>Votre avis a bien été transmis. Il sera relu par l’équipe avant d’être publié.</MessageInfo>
          )}
          {temoignage.statut === 'publie' && (
            <MessageSucces>Votre avis est en ligne dans les témoignages du site. Merci !</MessageSucces>
          )}
          {temoignage.statut === 'refuse' && (
            <MessageErreur>
              Votre avis n’a pas été retenu pour la publication
              {temoignage.motif_refus ? ` : ${temoignage.motif_refus}` : '.'}
            </MessageErreur>
          )}
          <blockquote
            style={{
              margin: 0,
              padding: '12px 14px',
              borderLeft: '3px solid var(--accent-gold, #e9cf94)',
              background: 'var(--surface-2, rgba(255,255,255,.04))',
              borderRadius: 8,
              fontSize: 13.5,
              lineHeight: 1.65,
              color: 'var(--ink)',
            }}
          >
            « {temoignage.texte} »
          </blockquote>
          {temoignage.statut === 'en_attente' && (
            <button
              type="button"
              style={{ ...boutonNeutreStyle, width: 'fit-content' }}
              onClick={() => ouvrirEdition(temoignage.texte)}
            >
              Modifier mon avis
            </button>
          )}
          {temoignage.statut === 'refuse' && (
            <button type="button" style={{ ...boutonPrimaireStyle, width: 'fit-content' }} onClick={() => ouvrirEdition('')}>
              Proposer un nouvel avis
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            Vous n’avez pas encore laissé d’avis. Quelques lignes suffisent — elles aideront d’autres
            élèves à se décider.
          </p>
          <button
            type="button"
            style={{ ...boutonPrimaireStyle, width: 'fit-content' }}
            onClick={() => ouvrirEdition('')}
          >
            Écrire mon avis
          </button>
        </div>
      )}
    </Section>
  )
}
