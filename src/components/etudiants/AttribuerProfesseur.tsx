import { useState } from 'react'
import { jetonAcces } from '../../lib/jetonAcces'
import { supabase } from '../../lib/supabaseClient'
import { useProfileContext } from '../../context/ProfileContext'
import { useProfesseurs } from '../../hooks/useProfesseurs'
import type { PeriodeProfesseur } from '../../hooks/useDossierEtudiant'
import { MessageSucces } from '../ui/Etats'
import { Modale } from '../ui/Modale'
import { Bouton, boutonDangerStyle, boutonNeutreStyle, boutonSecondaireStyle } from '../ui/Boutons'

interface AttribuerProfesseurProps {
  studentId: string
  /* Les professeurs EN COURS, plus un seul (0138, demande client du 2026-10-27) : l'écran doit
     proposer d'en ajouter un et de retirer chacun nommément. */
  periodesActuelles: PeriodeProfesseur[]
  /* Élève en cours collectif (demande client du 2026-10-11, capture à l'appui) : « le bouton
     attribuer professeur devrait être grisé et non cliquable [...] l'attribution de professeur
     pour les cours collectifs devrait uniquement se faire dans l'onglet Vagues. » Ce mécanisme
     (teacher_assignments) n'a jamais concerné le collectif — c'est `cohort_classes.teacher_id`
     qui tranche, attribué depuis Cours collectifs › Vagues (AttribuerProfesseurClasse.tsx,
     CohortesAdmin.tsx) — mais rien n'empêchait jusqu'ici de cliquer ce bouton-ci par erreur sur
     le dossier d'un élève collectif, sans aucun effet puisque son planning ne dépend pas de
     `teacher_assignments`. */
  estCollectif?: boolean
  onTermine: () => void
}

type Formulaire = 'changer' | 'ajouter' | null

function nomDe(periode: PeriodeProfesseur): string {
  return periode.professeur ? `${periode.professeur.prenom} ${periode.professeur.nom}` : 'ce professeur'
}

export function AttribuerProfesseur({ studentId, periodesActuelles, estCollectif, onTermine }: AttribuerProfesseurProps) {
  const { session } = useProfileContext()
  const { professeurs, loading: chargementProfs } = useProfesseurs()
  const [formulaire, setFormulaire] = useState<Formulaire>(null)
  const [teacherId, setTeacherId] = useState('')
  const [motif, setMotif] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [aRetirer, setARetirer] = useState<PeriodeProfesseur | null>(null)
  /* Fenêtre de remplacement (demande client du 2026-10-31) : quelle affectation est clôturée, et
     par qui. Deux états distincts et non un seul objet, parce que le choix du remplacé se refait
     sans perdre la liste déjà cochée quand l'admin hésite. */
  const [remplacementOuvert, setRemplacementOuvert] = useState(false)
  const [affectationARemplacer, setAffectationARemplacer] = useState<string>('')
  const [remplacants, setRemplacants] = useState<string[]>([])

  const aUnProfesseur = periodesActuelles.length > 0
  /* Un professeur déjà attribué ne doit pas réapparaître dans la liste d'ajout : la base le
     refuserait (index unique du couple, 0138) et l'admin n'aurait découvert l'erreur qu'après
     avoir cliqué. */
  const dejaAttribues = new Set(periodesActuelles.map((p) => p.affectation.teacher_id))
  const professeursProposables = formulaire === 'ajouter' ? professeurs.filter((p) => !dejaAttribues.has(p.id)) : professeurs
  /* Repreneurs possibles : tous sauf ceux qui enseignent DÉJÀ à cet élève — y compris celui qu'on
     remplace, qu'on ne peut pas nommer son propre successeur, et son collègue, que la base
     refuserait en double (index unique du couple, 0138). */
  const professeursDisponibles = professeurs.filter((p) => !dejaAttribues.has(p.id))

  function fermer() {
    setFormulaire(null)
    setTeacherId('')
    setMotif('')
    setErreur(null)
  }

  async function valider() {
    if (!teacherId) return
    setEnCours(true)
    setErreur(null)

    /* Deux opérations distinctes, volontairement :
       - « Changer de professeur » (`attribuer_professeur`, 0039/0046/0055) REMPLACE : il clôture
         l'affectation en cours et transfère au nouveau professeur les séances encore à venir.
       - « Ajouter un professeur » (`ajouter_professeur`, 0138) n'ouvre qu'une affectation de
         plus : rien n'est clôturé, aucune séance ne change de main.
       Les faire passer par un seul appel aurait obligé la base à devenir ce que l'admin veut
       dire, ce qu'elle ne peut pas deviner. */
    if (formulaire === 'ajouter') {
      const { error } = await supabase.rpc('ajouter_professeur', {
        p_student_id: studentId,
        p_teacher_id: teacherId,
        p_motif: motif || null,
      })
      setEnCours(false)
      if (error) {
        setErreur(error.message)
        return
      }
      const nom = professeurs.find((p) => p.id === teacherId)
      setMessage(
        nom
          ? `${nom.prenom} ${nom.nom} enseigne maintenant à cet élève, en plus de son professeur actuel. Ses séances sont à planifier.`
          : 'Professeur ajouté.',
      )
    } else {
      const { data, error } = await supabase.rpc('attribuer_professeur', {
        p_student_id: studentId,
        p_teacher_id: teacherId,
        p_motif: motif || null,
      })
      setEnCours(false)
      if (error) {
        setErreur(error.message)
        return
      }
      const resultat = data?.[0]
      setMessage(
        resultat && (resultat.seances_individuelles_transferees > 0 || resultat.seances_collectives_desinscrites > 0)
          ? [
              resultat.seances_individuelles_transferees > 0
                ? `${resultat.seances_individuelles_transferees} séance(s) individuelle(s) transférée(s) au nouveau professeur.`
                : null,
              resultat.seances_collectives_desinscrites > 0
                ? `${resultat.seances_collectives_desinscrites} séance(s) collective(s) libérée(s) — à réinscrire manuellement si besoin.`
                : null,
            ]
              .filter(Boolean)
              .join(' ')
          : null,
      )
    }

    fermer()
    onTermine()

    /* E-mail automatique à l'élève (0091, demande client du 2026-10-01) : bienvenue pour une
       première attribution, annonce du nouveau formateur pour un changement, annonce d'un
       formateur supplémentaire depuis 0138 — le serveur choisit le modèle d'après l'historique
       réel des affectations. Appel SÉPARÉ de l'attribution, et volontairement sans blocage :
       l'attribution est déjà faite et `onTermine()` a rafraîchi l'écran. Un e-mail qui échoue
       (Resend non configuré, modèle désactivé) ne doit ni annuler l'attribution ni afficher une
       erreur alarmante. */
    if (session) {
      fetch('/api/admin/email-demarrage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonAcces()}` },
        body: JSON.stringify({ studentId, teacherId }),
      }).catch(() => undefined)
    }
  }

  function ouvrirRemplacement() {
    setMessage(null)
    setErreur(null)
    setMotif('')
    setRemplacants([])
    /* Un seul professeur en cours : il n'y a rien à choisir, la fenêtre s'ouvre déjà sur lui. */
    setAffectationARemplacer(periodesActuelles.length === 1 ? periodesActuelles[0].affectation.id : '')
    setRemplacementOuvert(true)
  }

  async function remplacer() {
    if (!affectationARemplacer || remplacants.length === 0) return
    setEnCours(true)
    setErreur(null)

    /* `remplacer_professeur` (0148) et non `attribuer_professeur` : celle-ci refuse d'agir dès
       que l'élève a plusieurs professeurs actifs, faute de savoir lequel clôturer (0138). Ici
       l'admin l'a désigné, et le ou les remplaçants avec. */
    const { data, error } = await supabase.rpc('remplacer_professeur', {
      p_affectation_id: affectationARemplacer,
      p_teacher_ids: remplacants,
      p_motif: motif || null,
    })
    setEnCours(false)
    if (error) {
      setErreur(error.message)
      return
    }

    const remplace = periodesActuelles.find((p) => p.affectation.id === affectationARemplacer)
    const nomsRemplacants = remplacants
      .map((id) => professeurs.find((p) => p.id === id))
      .map((p) => (p ? `${p.prenom} ${p.nom}` : null))
      .filter((n): n is string => !!n)
    const resultat = data?.[0]
    const transferees = resultat?.seances_individuelles_transferees ?? 0
    const desinscrites = resultat?.seances_collectives_desinscrites ?? 0
    setMessage(
      [
        nomsRemplacants.length > 0
          ? `${remplace ? nomDe(remplace) : 'Le professeur'} est remplacé par ${nomsRemplacants.join(' et ')}.`
          : 'Remplacement effectué.',
        transferees > 0 ? `${transferees} séance(s) à venir transférée(s) à ${nomsRemplacants[0]}.` : null,
        desinscrites > 0 ? `${desinscrites} séance(s) collective(s) libérée(s) — à réinscrire manuellement si besoin.` : null,
      ]
        .filter(Boolean)
        .join(' '),
    )

    setRemplacementOuvert(false)
    setRemplacants([])
    setMotif('')
    onTermine()

    /* Même e-mail automatique que l'attribution ordinaire, et pour la même raison : l'élève doit
       apprendre le changement de formateur. Envoyé pour le repreneur des séances — celui que
       l'élève verra en face de lui. Sans blocage : l'affectation est déjà écrite. */
    if (session) {
      fetch('/api/admin/email-demarrage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonAcces()}` },
        body: JSON.stringify({ studentId, teacherId: remplacants[0] }),
      }).catch(() => undefined)
    }
  }

  async function retirer() {
    if (!aRetirer || !session) return
    setEnCours(true)
    setErreur(null)

    /* Route serveur et non appel direct : retirer un professeur annule ses séances à venir, ce
       qui suppose de retirer la réunion de l'agenda Google et de prévenir les personnes
       concernées. Voir api/admin/retirer-professeur.ts. */
    const reponse = await fetch('/api/admin/retirer-professeur', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonAcces()}` },
      body: JSON.stringify({ affectationId: aRetirer.affectation.id, motif: motif || null }),
    })
    const resultat = (await reponse.json().catch(() => ({}))) as { error?: string; seancesAnnulees?: number }
    setEnCours(false)

    if (!reponse.ok) {
      setErreur(resultat.error ?? 'Le retrait du professeur a échoué.')
      return
    }

    const nom = aRetirer.professeur ? `${aRetirer.professeur.prenom} ${aRetirer.professeur.nom}` : 'Le professeur'
    const annulees = resultat.seancesAnnulees ?? 0
    setMessage(
      annulees > 0
        ? `${nom} ne suit plus cet élève. ${annulees} séance(s) à venir annulée(s) — l'élève et le professeur ont été prévenus.`
        : `${nom} ne suit plus cet élève. Aucune séance à venir n'était planifiée.`,
    )
    setARetirer(null)
    setMotif('')
    onTermine()
  }

  if (estCollectif) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          disabled
          title="L'attribution de professeur pour les cours collectifs se fait depuis Cours collectifs › Vagues."
          style={{
            width: '100%',
            fontSize: 12.5,
            padding: 10,
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'var(--voile-doux, rgba(255,255,255,.03))',
            color: 'var(--muted-2)',
            cursor: 'not-allowed',
          }}
        >
          Attribuer un professeur
        </button>
        <p style={{ fontSize: 11.5, color: 'var(--muted-2)', margin: 0, lineHeight: 1.5 }}>
          Élève en cours collectif : le professeur est celui de sa classe de niveau, attribué depuis{' '}
          <strong>Cours collectifs › Vagues</strong>, pas depuis ce dossier.
        </p>
      </div>
    )
  }

  if (!formulaire) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Deux gestes derrière un même bouton, selon ce que l'élève a déjà :
            — personne : une attribution, qui ne remplace rien (formulaire en ligne, inchangé) ;
            — un professeur ou plus : un remplacement, qui demande QUI s'en va et QUI reprend —
              demande client du 2026-10-31, capture à l'appui. Le pop-up est obligatoire dès le
              deuxième professeur (rien ne permettait de désigner lequel), et il sert aussi quand
              il n'y en a qu'un : l'écran reste le même d'un élève à l'autre, et c'est le seul
              endroit d'où l'on peut nommer plusieurs repreneurs. */}
        <button
          onClick={() => {
            if (aUnProfesseur) {
              ouvrirRemplacement()
              return
            }
            setMessage(null)
            setFormulaire('changer')
          }}
          className="btn-shine"
          style={{ width: '100%', fontSize: 12.5, padding: 10, background: 'var(--accent-blue-gradient)', color: '#fff' }}
        >
          {aUnProfesseur ? 'Changer de professeur' : 'Attribuer un professeur'}
        </button>

        {/* L'ajout n'a de sens qu'une fois un premier professeur en place : sans lui, « Attribuer »
            ci-dessus fait déjà exactement cela. */}
        {aUnProfesseur && (
          <button
            onClick={() => {
              setMessage(null)
              setFormulaire('ajouter')
            }}
            style={{ ...boutonSecondaireStyle, width: '100%', fontSize: 12.5, padding: 10 }}
          >
            Ajouter un second professeur
          </button>
        )}

        {/* Retrait nommé, professeur par professeur. Jamais proposé quand il n'en reste qu'un :
            « Changer de professeur » couvre ce cas sans laisser l'élève sans personne. */}
        {periodesActuelles.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-2)' }}>Retirer un professeur</span>
            {periodesActuelles.map((periode) => (
              <button
                key={periode.affectation.id}
                onClick={() => {
                  setMessage(null)
                  setMotif('')
                  setErreur(null)
                  setARetirer(periode)
                }}
                style={{ ...boutonNeutreStyle, fontSize: 12, padding: '8px 12px', justifyContent: 'flex-start' }}
              >
                Retirer {periode.professeur ? `${periode.professeur.prenom} ${periode.professeur.nom}` : 'ce professeur'}
              </button>
            ))}
          </div>
        )}

        {message && <MessageSucces>{message}</MessageSucces>}
        {erreur && !remplacementOuvert && <p style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>{erreur}</p>}

        {remplacementOuvert && (
          <Modale titre="Changer de professeur" onFermer={() => setRemplacementOuvert(false)} largeurMax={480}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {periodesActuelles.length > 1 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-2)' }}>Professeur à remplacer</span>
                  {periodesActuelles.map((periode) => (
                    <label
                      key={periode.affectation.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        fontSize: 12.5,
                        color: 'var(--ink-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: '9px 11px',
                        cursor: 'pointer',
                        background:
                          affectationARemplacer === periode.affectation.id
                            ? 'var(--hoc-pastille, rgba(169,140,255,.14))'
                            : 'transparent',
                      }}
                    >
                      <input
                        type="radio"
                        name="professeur-a-remplacer"
                        checked={affectationARemplacer === periode.affectation.id}
                        onChange={() => {
                          setAffectationARemplacer(periode.affectation.id)
                          /* Le remplacé ne peut pas se remplacer lui-même : son nom sort de la
                             liste des repreneurs au moment même où il est désigné. */
                          setRemplacants((actuels) => actuels.filter((id) => id !== periode.affectation.teacher_id))
                        }}
                      />
                      {nomDe(periode)}
                    </label>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.6 }}>
                  <strong>{nomDe(periodesActuelles[0])}</strong> ne suivra plus cet élève. Ses séances encore à venir
                  passeront au premier remplaçant choisi ci-dessous.
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-2)' }}>
                  Remplacé par {remplacants.length > 1 ? `(${remplacants.length} professeurs)` : ''}
                </span>
                {/* Plusieurs repreneurs possibles — « choisir le ou les professeurs qui le ou les
                    remplacent ». Les séances déjà planifiées, elles, ne se répartissent pas :
                    `sessions.teacher_id` ne porte qu'un nom, elles vont donc au premier coché,
                    ce que la phrase sous la liste annonce avant de valider. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 210, overflowY: 'auto' }}>
                  {professeursDisponibles.length === 0 && (
                    <span style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>
                      {chargementProfs ? 'Chargement…' : 'Aucun autre professeur disponible pour cet élève.'}
                    </span>
                  )}
                  {professeursDisponibles.map((p) => {
                    const coche = remplacants.includes(p.id)
                    return (
                      <label
                        key={p.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 9,
                          fontSize: 12.5,
                          color: 'var(--ink-2)',
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          padding: '9px 11px',
                          cursor: 'pointer',
                          background: coche ? 'var(--hoc-pastille, rgba(169,140,255,.14))' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={coche}
                          onChange={() =>
                            setRemplacants((actuels) =>
                              coche ? actuels.filter((id) => id !== p.id) : [...actuels, p.id],
                            )
                          }
                        />
                        {p.prenom} {p.nom}
                        {coche && remplacants[0] === p.id && remplacants.length > 1 && (
                          <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, color: 'var(--muted)' }}>
                            reprend les séances
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>

              <input
                placeholder="Motif du changement (optionnel)"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'var(--fond-champ, rgba(0,0,0,.22))' }}
              />

              {erreur && <p style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>{erreur}</p>}

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setRemplacementOuvert(false)} style={{ ...boutonNeutreStyle, flexGrow: 1 }}>
                  Annuler
                </button>
                <Bouton
                  onClick={remplacer}
                  enCours={enCours}
                  disabled={!affectationARemplacer || remplacants.length === 0}
                  libelle="Confirmer le changement"
                  libelleEnCours="Changement…"
                  style={{ flexGrow: 1, background: 'var(--accent-blue-gradient)', color: '#fff' }}
                />
              </div>
            </div>
          </Modale>
        )}

        {aRetirer && (
          <Modale
            titre={`Retirer ${aRetirer.professeur ? `${aRetirer.professeur.prenom} ${aRetirer.professeur.nom}` : 'ce professeur'} ?`}
            onFermer={() => setARetirer(null)}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.6 }}>
                Ses séances encore à venir avec cet élève seront <strong>annulées</strong> et sont à replanifier. L'élève et le
                professeur en seront prévenus, et les réunions correspondantes retirées de leurs agendas. Les séances déjà
                données ne sont pas touchées : elles restent dans le parcours de l'élève, avec les heures déjà décomptées.
              </p>
              <input
                placeholder="Motif du retrait (optionnel)"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'var(--fond-champ, rgba(0,0,0,.22))' }}
              />
              {erreur && <p style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>{erreur}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setARetirer(null)} style={{ ...boutonNeutreStyle, flexGrow: 1 }}>
                  Annuler
                </button>
                {/* Le composant Bouton impose le triptyque désactivé + opacité + libellé au
                    participe présent : un clic qui part en réseau doit toujours se voir
                    (convention posée le 2026-10-12, voir ui/Boutons.tsx). */}
                <Bouton
                  onClick={retirer}
                  enCours={enCours}
                  libelle="Retirer et annuler ses séances"
                  libelleEnCours="Retrait…"
                  style={{ ...boutonDangerStyle, flexGrow: 1 }}
                />
              </div>
            </div>
          </Modale>
        )}
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ fontSize: 14, color: 'var(--accent-gold, #e9cf94)' }}>
        {formulaire === 'ajouter' ? 'Ajouter un second professeur' : aUnProfesseur ? 'Changer de professeur' : 'Attribuer un professeur'}
      </h3>
      {formulaire === 'ajouter' && (
        <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
          Le professeur actuel reste en place. Les deux enseigneront à cet élève, chacun planifiant ses propres séances, sur le
          même forfait d'heures.
        </p>
      )}
      <select
        value={teacherId}
        onChange={(e) => setTeacherId(e.target.value)}
        style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'var(--fond-champ, rgba(0,0,0,.22))' }}
      >
        <option value="">{chargementProfs ? 'Chargement…' : 'Choisir un professeur'}</option>
        {professeursProposables.map((p) => (
          <option key={p.id} value={p.id}>
            {p.prenom} {p.nom}
          </option>
        ))}
      </select>
      {formulaire === 'ajouter' && !chargementProfs && professeursProposables.length === 0 && (
        <p style={{ fontSize: 11.5, color: 'var(--muted-2)', margin: 0 }}>
          Tous les professeurs sont déjà attribués à cet élève.
        </p>
      )}
      {(aUnProfesseur || formulaire === 'ajouter') && (
        <input
          placeholder={formulaire === 'ajouter' ? "Motif de l'ajout" : 'Motif du changement'}
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, color: 'var(--ink)', background: 'var(--fond-champ, rgba(0,0,0,.22))' }}
        />
      )}
      {erreur && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{erreur}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={fermer}
          style={{ flexGrow: 1, fontSize: 12.5, padding: 9, borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}
        >
          Annuler
        </button>
        <button
          onClick={valider}
          disabled={!teacherId || enCours}
          className="btn-shine"
          style={{ flexGrow: 1, fontSize: 12.5, padding: 9, background: 'var(--accent-blue-gradient)', color: '#fff', opacity: !teacherId || enCours ? 0.6 : 1 }}
        >
          Confirmer
        </button>
      </div>
    </div>
  )
}
