import { useState, type FormEvent } from 'react'
import { useProfileContext } from '../../context/ProfileContext'
import { useEtudiants } from '../../hooks/useEtudiants'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import { useEtablissement } from '../../hooks/useEtablissement'
import { useDossierEtudiant } from '../../hooks/useDossierEtudiant'
import { useProfesseurDetailAdmin } from '../../hooks/useProfesseurDetailAdmin'
import { supabase } from '../../lib/supabaseClient'
import { libelleTypeProgramme, preparerVariables, substituerVariables, type ContexteProgramme } from '../../lib/contrats'
import type { Database, Role } from '../../types/database.types'
import { Champ, LigneInfo, champStyle } from '../ui/Champ'
import { MessageErreur } from '../ui/Etats'
import { boutonNeutreStyle, boutonPrimaireStyle } from '../ui/Boutons'

type ContractTemplate = Database['public']['Tables']['contract_templates']['Row']

interface LancerApprobationContratProps {
  etablissementId: string
  modeles: ContractTemplate[]
  onLance: () => void
  onAnnuler: () => void
}

/* Trois choix et un bouton : type de contrat, personne concernée, modèle. Chaque variable du
   modèle porte une `source` explicite choisie par l'admin dans l'éditeur de modèle (voir
   CreerContratTemplate.tsx) — c'est ce mapping, pas une convention de nom, qui détermine si elle
   se remplit seule depuis la fiche ou reste à saisir ici (au besoin avec une valeur par défaut
   suggérée). Le contrat part directement au statut « envoyé » : lancer l'approbation, c'est le
   rendre visible et signable dans l'espace du destinataire. */
export function LancerApprobationContrat({ etablissementId, modeles, onLance, onAnnuler }: LancerApprobationContratProps) {
  const { profile, session } = useProfileContext()
  const etablissement = useEtablissement(etablissementId)
  const { etudiants } = useEtudiants()
  const { professeurs } = useProfesseurs()

  const [typeContrat, setTypeContrat] = useState<Role>('etudiant')
  const [destinataireId, setDestinataireId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [complements, setComplements] = useState<Record<string, string>>({})
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const personnes = typeContrat === 'professeur' ? professeurs : etudiants
  const modelesDuType = modeles.filter((m) => m.public_cible === typeContrat)
  const destinataire = personnes.find((p) => p.id === destinataireId) ?? null
  const modele = modelesDuType.find((m) => m.id === templateId) ?? null

  /* Ce que la fiche du destinataire seule ne porte pas — forfait, vague, affectation pour un
     étudiant ; élèves actifs et heures enseignées pour un professeur — vient de son dossier
     pédagogique complet, chargé via les mêmes hooks (et le même cache) que les pages Étudiants/
     Professeurs de l'admin. Un seul des deux hooks interroge réellement Supabase à la fois : les
     deux sont montés en permanence, mais chacun suspend sa requête tant que l'id qu'on lui passe
     n'est pas le sien (voir `useCacheRequete`, `cle` à `undefined`). */
  const { dossier } = useDossierEtudiant(typeContrat === 'etudiant' ? destinataireId || undefined : undefined)
  const { detail } = useProfesseurDetailAdmin(typeContrat === 'professeur' ? destinataireId || undefined : undefined)

  let contexteProgramme: ContexteProgramme | undefined
  if (typeContrat === 'etudiant' && dossier) {
    const periodeActuelle = dossier.periodes[0] ?? null
    const forfait = dossier.packages[0] ?? null
    contexteProgramme = {
      langueProgramme: dossier.cohorte?.langue ?? periodeActuelle?.affectation.langue ?? null,
      typeProgrammeLabel: dossier.cohorte ? libelleTypeProgramme('collectif') : forfait ? libelleTypeProgramme(forfait.type_programme) : null,
      heuresProgramme: forfait?.total_heures ?? null,
      montantProgramme: forfait?.montant ?? null,
      dateDebutProgramme: dossier.cohorte?.date_debut ?? periodeActuelle?.affectation.date_debut ?? null,
      dateEcheanceProgramme: forfait?.echeance ?? dossier.cohorte?.date_fin ?? null,
      rythmeProgramme: dossier.diagnostic?.rythme_convenu ?? null,
    }
  } else if (typeContrat === 'professeur' && detail) {
    contexteProgramme = {
      languesEnseignees: [...new Set(detail.eleves.map((e) => e.affectation.langue).filter((l): l is string => !!l))],
      nombreElevesActifs: detail.eleves.length,
      heuresEnseignees: detail.heuresTotalEnseignees,
    }
  }

  const variables = modele ? preparerVariables(modele.corps_template, modele.variables_disponibles, destinataire, etablissement, contexteProgramme) : []
  /* Une variable résolue à vide (clause de minorité d'un étudiant majeur : il n'y a rien à
     insérer) disparaît du récapitulatif — la mentionner ne ferait qu'attirer l'attention sur un
     champ dont la réponse est « rien à faire ». Elle reste bien substituée par du vide dans le
     texte du contrat. */
  const remplies = variables.filter((v) => !!v.valeurAuto)
  const aCompleter = variables.filter((v) => v.valeurAuto === undefined)

  const valeurs: Record<string, string> = {}
  for (const variable of variables) {
    const valeur = complements[variable.cle] ?? variable.valeurAuto ?? variable.defaut
    if (valeur !== undefined) valeurs[variable.cle] = valeur
  }
  const corpsGenere = modele ? substituerVariables(modele.corps_template, valeurs) : ''

  function changerType(nouveau: Role) {
    setTypeContrat(nouveau)
    setDestinataireId('')
    setTemplateId('')
    setComplements({})
  }

  const pret = !!(profile && destinataire && modele)

  async function lancer(e: FormEvent) {
    e.preventDefault()
    if (!pret || !profile || !destinataire || !modele) return
    setEnCours(true)
    setErreur(null)

    const aujourdhui = new Date().toISOString().slice(0, 10)
    const titre = `${modele.nom} — ${[destinataire.prenom, destinataire.nom].filter(Boolean).join(' ')}`

    const { error } = await supabase.from('contracts').insert({
      etablissement_id: etablissementId,
      template_id: modele.id,
      destinataire_profile_id: destinataire.id,
      destinataire_role: modele.public_cible,
      titre,
      corps_genere: corpsGenere,
      variables_valeurs: valeurs,
      statut: 'envoye',
      date_envoi: aujourdhui,
      created_by_profile_id: profile.id,
    })

    if (error) {
      setEnCours(false)
      setErreur(error.message)
      return
    }

    /* Le contrat est déjà visible dans l'espace du destinataire une fois au statut « envoyé » :
       si la notification échoue, l'approbation reste valide et la ligne du contrat propose
       « Envoyer un rappel ». On n'y bloque donc pas le lancement. */
    if (session) {
      await fetch('/api/admin/notifier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          destinataireProfileId: destinataire.id,
          type: 'contrat_a_signer',
          titre: `Contrat à signer · ${titre}`,
          lien: modele.public_cible === 'professeur' ? '/professeur/contrats' : '/mon-espace/contrats',
        }),
      }).catch(() => undefined)
    }

    setEnCours(false)
    onLance()
  }

  return (
    <form onSubmit={lancer} className="card" style={{ padding: 18, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15, color: 'var(--accent-gold, #e9cf94)' }}>Lancer une approbation de contrat</h3>
        <p style={{ margin: '5px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
          Le contrat est rédigé à partir du modèle et de la fiche de la personne choisie, puis envoyé pour signature.
          Aucune information n'est à ressaisir.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Champ label="1 · Type de contrat" obligatoire>
          <select value={typeContrat} onChange={(e) => changerType(e.target.value as Role)} style={champStyle}>
            <option value="etudiant">Contrat étudiant</option>
            <option value="professeur">Contrat professeur</option>
          </select>
        </Champ>

        <Champ label={typeContrat === 'professeur' ? '2 · Professeur concerné' : '2 · Étudiant concerné'} obligatoire>
          <select required value={destinataireId} onChange={(e) => setDestinataireId(e.target.value)} style={champStyle}>
            <option value="">Sélectionner…</option>
            {personnes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.prenom} {p.nom}
              </option>
            ))}
          </select>
        </Champ>

        <Champ label="3 · Modèle de contrat" obligatoire>
          <select required value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={champStyle}>
            <option value="">Sélectionner…</option>
            {modelesDuType.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom}
              </option>
            ))}
          </select>
        </Champ>
      </div>

      {modelesDuType.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
          Aucun modèle actif pour les {typeContrat === 'professeur' ? 'professeurs' : 'étudiants'} : créez-en un dans
          l'onglet « Modèles » avant de lancer une approbation.
        </p>
      )}

      {remplies.length > 0 && (
        <div style={{ borderRadius: 12, border: '1px solid rgba(111,227,192,.24)', background: 'rgba(111,227,192,.06)', padding: '12px 15px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-teal)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            {remplies.length} champ{remplies.length > 1 ? 's remplis' : ' rempli'} automatiquement
          </div>
          {remplies.map((variable) => (
            <LigneInfo key={variable.cle} label={variable.label} valeur={variable.valeurAuto} />
          ))}
        </div>
      )}

      {modele && aCompleter.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {aCompleter.length === 1 ? 'Une valeur reste à saisir' : `${aCompleter.length} valeurs restent à saisir`} — aucune fiche
            ne les porte. Les valeurs déjà remplies sont des suggestions courantes, à vérifier.
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {aCompleter.map((variable) => (
              <Champ key={variable.cle} label={variable.label}>
                <input
                  value={complements[variable.cle] ?? variable.defaut ?? ''}
                  onChange={(e) => setComplements({ ...complements, [variable.cle]: e.target.value })}
                  style={champStyle}
                />
              </Champ>
            ))}
          </div>
        </div>
      )}

      {modele && destinataire && (
        <details>
          <summary style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-blue)', cursor: 'pointer' }}>
            Aperçu du contrat
          </summary>
          <div style={{ ...champStyle, marginTop: 8, whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto', lineHeight: 1.6 }}>
            {corpsGenere}
          </div>
        </details>
      )}

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        <button type="button" onClick={onAnnuler} style={{ ...boutonNeutreStyle, fontSize: 12.5, padding: '10px 16px' }}>
          Annuler
        </button>
        <button type="submit" disabled={enCours || !pret} className="btn-shine" style={{ ...boutonPrimaireStyle, opacity: enCours || !pret ? 0.6 : 1 }}>
          {enCours ? 'Lancement…' : "Lancer l'approbation"}
        </button>
      </div>
    </form>
  )
}
