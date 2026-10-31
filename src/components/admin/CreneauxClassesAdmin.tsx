import { useState } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useCreneauxClasses } from '../../hooks/useCreneauxClasses'
import { supabase } from '../../lib/supabaseClient'
import { Section } from '../ui/Section'
import { EtatChargement, MessageErreur, MessageInfo, MessageSucces } from '../ui/Etats'
import { boutonPrimaireStyle } from '../ui/Boutons'
import { Champ, champStyle } from '../ui/Champ'
import { ChampDate } from '../ui/ChampDate'
import { Icone } from '../ui/Icones'

/* Clé technique dérivée du libellé : c'est elle que porte `cohort_classes.creneau`, et elle ne
   change jamais ensuite — renommer « Soir » en « Fin de journée » ne doit pas détacher les
   classes déjà rattachées. Sans accents ni espaces, pour rester lisible dans la base et dans les
   anciennes valeurs ('matin', 'midi', 'soir'), qui suivent déjà cette forme. */
function cleDepuisLibelle(libelle: string): string {
  return libelle
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
}

/* Créneaux horaires des classes de niveau — demande client du 2026-10-31 : « rajouter un bouton
   "Ajouter créneau" afin que l'utilisateur puisse rajouter plus de choix ».
   Ils étaient trois, figés dans le formulaire voisin (matin / midi / soir, migration 0074) ;
   c'est maintenant une liste libre (0150), lue partout où un créneau s'affiche — création d'une
   classe, dossier de l'élève, espace professeur — par le même hook. */
export function CreneauxClassesAdmin() {
  const { profile } = useProfileContext()
  const { creneaux, loading, erreur, recharger } = useCreneauxClasses()
  const [message, setMessage] = useState<string | null>(null)
  const [echec, setEchec] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  /* Libellés en cours de saisie, le temps que le champ perde le focus. */
  const [libelles, setLibelles] = useState<Record<string, string>>({})

  const [nouveauLibelle, setNouveauLibelle] = useState('')
  const [nouvelleHeure, setNouvelleHeure] = useState('09:00')

  async function ajouter() {
    if (!profile) return
    const libelle = nouveauLibelle.trim()
    const cle = cleDepuisLibelle(libelle)
    if (!libelle || !cle) {
      setEchec('Donnez un nom au créneau (par exemple « Après-midi »).')
      return
    }
    if (creneaux.some((c) => c.cle === cle)) {
      setEchec(`Un créneau « ${libelle} » existe déjà.`)
      return
    }
    setEnCours(true)
    setEchec(null)
    const { error } = await supabase.from('creneaux_classes').insert({
      etablissement_id: profile.etablissement_id,
      cle,
      libelle,
      heure: nouvelleHeure,
      /* À la fin de la liste : l'ordre d'ajout est celui que l'administration a en tête, et un
         tri par heure replacerait un créneau du soir avant un créneau du matin ajouté après. */
      ordre: creneaux.length + 1,
    })
    setEnCours(false)
    if (error) {
      setEchec(error.message)
      return
    }
    setNouveauLibelle('')
    setMessage(`Créneau « ${libelle} » ajouté.`)
    recharger()
  }

  async function modifier(id: string, champs: { libelle?: string; heure?: string; actif?: boolean }) {
    setEchec(null)
    const { error } = await supabase.from('creneaux_classes').update(champs).eq('id', id)
    if (error) {
      setEchec(error.message)
      return
    }
    setMessage('Créneau mis à jour.')
    recharger()
  }

  async function supprimer(id: string, libelle: string) {
    if (!window.confirm(`Supprimer le créneau « ${libelle} » ? Les classes qui le portent gardent leur horaire, mais il ne sera plus proposé.`)) {
      return
    }
    setEchec(null)
    const { error } = await supabase.from('creneaux_classes').delete().eq('id', id)
    if (error) {
      setEchec(error.message)
      return
    }
    setMessage(`Créneau « ${libelle} » supprimé.`)
    recharger()
  }

  if (loading) return <EtatChargement lignes={2} hauteur={70} />

  return (
    <Section titre="Créneaux horaires des classes">
      {erreur && <MessageErreur>{erreur}</MessageErreur>}
      {echec && <MessageErreur>{echec}</MessageErreur>}
      {message && <MessageSucces>{message}</MessageSucces>}

      <MessageInfo>
        Heures proposées à la création d’une classe de niveau en cours collectif. Toute modification est prise en compte
        immédiatement, partout où le créneau s’affiche.
      </MessageInfo>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '14px 0 16px' }}>
        {creneaux.length === 0 && (
          <MessageInfo>Aucun créneau : ajoutez-en au moins un pour pouvoir créer une classe de niveau.</MessageInfo>
        )}
        {creneaux.map((creneau) => (
          <div
            key={creneau.id}
            className="carte-ligne"
            style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 10, background: 'var(--surface-alt)' }}
          >
            {/* Enregistré à la sortie du champ, pas à chaque frappe : écrire en base lettre par
                lettre ferait autant d'aller-retours que de caractères tapés. */}
            <input
              value={libelles[creneau.id] ?? creneau.libelle}
              onChange={(e) => setLibelles((l) => ({ ...l, [creneau.id]: e.target.value }))}
              onBlur={() => {
                const saisi = (libelles[creneau.id] ?? creneau.libelle).trim()
                if (!saisi || saisi === creneau.libelle) return
                modifier(creneau.id, { libelle: saisi })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              aria-label={`Nom du créneau ${creneau.libelle}`}
              style={{ ...champStyle, width: 190, opacity: creneau.actif ? 1 : 0.6 }}
            />
            <ChampDate
              type="time"
              value={creneau.heure.slice(0, 5)}
              onChange={(e) => modifier(creneau.id, { heure: e.target.value })}
              aria-label={`Heure du créneau ${creneau.libelle}`}
              style={{ ...champStyle, width: 130, opacity: creneau.actif ? 1 : 0.6 }}
            />
            <span style={{ flexGrow: 1 }} />
            {!creneau.actif && (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>Retiré des choix</span>
            )}
            <button type="button" onClick={() => modifier(creneau.id, { actif: !creneau.actif })} style={boutonDiscret}>
              {creneau.actif ? 'Retirer des choix' : 'Reproposer'}
            </button>
            <button
              type="button"
              onClick={() => supprimer(creneau.id, creneau.libelle)}
              style={{ ...boutonDiscret, color: 'var(--danger)' }}
            >
              Supprimer
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <Champ label="Nom du créneau" style={{ minWidth: 190 }}>
          <input
            value={nouveauLibelle}
            onChange={(e) => setNouveauLibelle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ajouter()
            }}
            placeholder="Ex. Après-midi"
            style={champStyle}
          />
        </Champ>
        <Champ label="Heure" style={{ minWidth: 130 }}>
          <ChampDate type="time" value={nouvelleHeure} onChange={(e) => setNouvelleHeure(e.target.value)} style={champStyle} />
        </Champ>
        <button type="button" onClick={ajouter} disabled={enCours} className="btn-shine" style={{ ...boutonPrimaireStyle, opacity: enCours ? 0.7 : 1 }}>
          <Icone nom="plus" taille={15} />
          {enCours ? 'Ajout…' : 'Ajouter créneau'}
        </button>
      </div>
    </Section>
  )
}

const boutonDiscret = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--muted)',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
