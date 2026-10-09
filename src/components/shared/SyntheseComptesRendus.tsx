import { useMemo, useState } from 'react'
import { useComptesRendusEtudiant } from '../../hooks/useComptesRendusEtudiant'
import { construireSynthese, LIBELLE_TENDANCE, syntheseEnTexte, type ExtraitDate, type SyntheseComptesRendus as Synthese } from '../../lib/syntheseComptesRendus'
import { formaterHeures, formaterMinutes } from '../../lib/heures'
import { libelleObjectif, libelleProgres } from '../../lib/compteRendu'
import { Modale } from '../ui/Modale'
import { GrilleStats, Stat } from '../ui/Stat'
import { EtatVide } from '../ui/EtatVide'
import { EtatChargement, MessageErreur, MessageInfo } from '../ui/Etats'
import { ListeRepliable, TexteRepliable } from '../ui/Repliable'
import { Icone } from '../ui/Icones'
import { boutonSecondaireStyle } from '../ui/Boutons'
import { etiquetteStyle } from '../ui/Champ'

/* Portée de la synthèse — ce que l'utilisateur a le droit de voir est déjà décidé par la RLS
   (voir useComptesRendusEtudiant) ; ce réglage ne fait que le DIRE à l'écran, pour qu'un
   professeur ne lise pas « tous les comptes rendus » là où il n'a que les siens. */
export type PorteeSynthese = 'etablissement' | 'mes-cours'

const SOUS_TITRE: Record<PorteeSynthese, string> = {
  etablissement: 'Tous les comptes rendus de séance de cet élève, tous professeurs confondus.',
  'mes-cours': 'Les comptes rendus des séances que vous avez assurées avec cet élève.',
}

const TON_TENDANCE = {
  hausse: { color: 'var(--accent-teal)', bg: 'rgba(111,227,192,.14)', border: 'rgba(111,227,192,.3)' },
  stable: { color: 'var(--accent-blue)', bg: 'rgba(169,140,255,.12)', border: 'rgba(169,140,255,.3)' },
  baisse: { color: 'var(--warning, #e0a94d)', bg: 'rgba(233,207,148,.12)', border: 'rgba(233,207,148,.32)' },
}

function EnTeteBloc({ titre, compteur }: { titre: string; compteur?: number }) {
  // `etiquetteStyle` (couleur `--ink`), pas `--muted` : demande client du 2026-09-30, une fenêtre
  // aussi dense que cette synthèse est justement le cas où un intitulé terne se perd le plus
  // facilement parmi les chiffres et badges qui l'entourent.
  return (
    <span style={{ ...etiquetteStyle, fontSize: 10.5 }}>
      {titre}
      {compteur !== undefined && ` · ${compteur}`}
    </span>
  )
}

function Bloc({ titre, compteur, children }: { titre: string; compteur?: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <EnTeteBloc titre={titre} compteur={compteur} />
      {children}
    </div>
  )
}

/* Liste datée d'extraits (contenu vu, points à améliorer, remarques) — même rendu pour les trois,
   repliée au-delà de trois entrées pour qu'un suivi de deux ans reste lisible d'un coup d'œil. */
function ListeExtraits({ extraits, montrerProfesseur }: { extraits: ExtraitDate[]; montrerProfesseur: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 12, border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
      <ListeRepliable visibles={3} nom="entrées">
        {extraits.map((x, index) => (
          <div key={`${x.date}-${index}`} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 13px', borderBottom: '1px solid var(--border-soft)' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted-2)' }}>
              {new Date(x.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              {montrerProfesseur && x.professeur ? ` · ${x.professeur}` : ''}
            </span>
            <TexteRepliable texte={x.texte} lignes={2} style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }} />
          </div>
        ))}
      </ListeRepliable>
    </div>
  )
}

function CorpsSynthese({ synthese, portee }: { synthese: Synthese; portee: PorteeSynthese }) {
  const manquants = Math.max(0, synthese.nbSeancesTerminees - synthese.nbComptesRendus)
  const montrerProfesseur = portee === 'etablissement' && synthese.professeurs.length > 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <GrilleStats min={140} compact>
        <Stat
          compact
          libelle="Comptes rendus"
          valeur={synthese.nbComptesRendus}
          ton="or"
          aide={
            synthese.periode
              ? `Du ${new Date(synthese.periode.premiere).toLocaleDateString('fr-FR')} au ${new Date(synthese.periode.derniere).toLocaleDateString('fr-FR')}`
              : undefined
          }
        />
        <Stat compact libelle="Heures résumées" valeur={formaterHeures(synthese.heures)} ton="bleu" aide={`${synthese.nbComptesRendus} séance${synthese.nbComptesRendus > 1 ? 's' : ''} documentée${synthese.nbComptesRendus > 1 ? 's' : ''}`} />
        <Stat
          compact
          libelle="Présence"
          valeur={synthese.presence.renseignees > 0 ? `${Math.round((synthese.presence.presents / synthese.presence.renseignees) * 100)} %` : '—'}
          ton="teal"
          aide={synthese.presence.renseignees > 0 ? `${synthese.presence.presents} présence(s), ${synthese.presence.absents} absence(s)` : 'Présence non renseignée'}
        />
        <Stat
          compact
          libelle="Dernier progrès"
          valeur={<span style={{ fontSize: 15 }}>{synthese.dernierProgres?.libelle ?? '—'}</span>}
          ton="violet"
          aide={synthese.dernierProgres ? `Évalué le ${new Date(synthese.dernierProgres.date).toLocaleDateString('fr-FR')}` : 'Aucune note de progrès'}
          pied={
            synthese.tendance ? (
              <span style={{ fontSize: 10, fontWeight: 700, color: TON_TENDANCE[synthese.tendance].color, background: TON_TENDANCE[synthese.tendance].bg, border: `1px solid ${TON_TENDANCE[synthese.tendance].border}`, borderRadius: 999, padding: '2px 8px' }}>
                {LIBELLE_TENDANCE[synthese.tendance]}
              </span>
            ) : undefined
          }
        />
      </GrilleStats>

      {manquants > 0 && (
        <MessageInfo>
          {manquants} séance{manquants > 1 ? 's' : ''} clôturée{manquants > 1 ? 's' : ''} n’{manquants > 1 ? 'ont' : 'a'} pas de compte rendu
          rempli : {manquants > 1 ? 'elles ne sont' : 'elle n’est'} donc pas {manquants > 1 ? 'reprises' : 'reprise'} dans cette synthèse.
        </MessageInfo>
      )}

      {synthese.professeurs.length > 0 && portee === 'etablissement' && (
        <Bloc titre={synthese.professeurs.length > 1 ? 'Professeurs intervenus' : 'Professeur'}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {synthese.professeurs.map((p) => (
              <span key={p} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-blue)', background: 'rgba(169,140,255,.1)', border: '1px solid rgba(169,140,255,.28)', borderRadius: 999, padding: '3px 10px' }}>
                {p}
              </span>
            ))}
          </div>
        </Bloc>
      )}

      {synthese.competences.length > 0 && (
        <Bloc titre="Compétences travaillées">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {synthese.competences.map((c) => (
              <div key={c.libelle} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--ink-2)', width: 92, flexShrink: 0 }}>{c.libelle}</span>
                <span
                  role="progressbar"
                  aria-valuenow={c.part}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${c.libelle} : ${c.part} % des séances`}
                  style={{ flexGrow: 1, height: 8, borderRadius: 999, background: 'rgba(0,0,0,.28)', overflow: 'hidden', display: 'flex' }}
                >
                  <span style={{ width: `${c.part}%`, background: 'linear-gradient(90deg,#a98cff,#e9cf94)', borderRadius: 999 }} />
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)', width: 78, flexShrink: 0, textAlign: 'right' }}>
                  {c.nb} séance{c.nb > 1 ? 's' : ''} · {c.part} %
                </span>
              </div>
            ))}
          </div>
        </Bloc>
      )}

      {synthese.progres.length > 0 && (
        <Bloc titre="Notes de progrès">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {synthese.progres.map((p) => (
              <span key={p.libelle} style={{ fontSize: 11.5, color: 'var(--ink-2)', background: 'rgba(255,255,255,.05)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 11px' }}>
                {p.libelle} · {p.nb}
              </span>
            ))}
          </div>
        </Bloc>
      )}

      {/* Thèmes récurrents : mots porteurs de sens qui reviennent dans au moins deux comptes
          rendus (voir syntheseComptesRendus.ts). Ce sont des repères de lecture, pas une
          analyse — d'où le libellé explicite plutôt qu'une affirmation pédagogique. */}
      {synthese.themes.length > 0 && (
        <Bloc titre="Mots qui reviennent d’un compte rendu à l’autre">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {synthese.themes.map((t) => (
              <span key={t.mot} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-violet)', background: 'rgba(199,156,255,.1)', border: '1px solid rgba(199,156,255,.28)', borderRadius: 999, padding: '3px 10px' }}>
                {t.mot} <span style={{ fontWeight: 600, color: 'var(--muted)' }}>×{t.nb}</span>
              </span>
            ))}
          </div>
        </Bloc>
      )}

      {synthese.pointsAAmeliorer.length > 0 && (
        <Bloc titre="Points à améliorer" compteur={synthese.pointsAAmeliorer.length}>
          <ListeExtraits extraits={synthese.pointsAAmeliorer} montrerProfesseur={montrerProfesseur} />
        </Bloc>
      )}

      {synthese.aEteVu.length > 0 && (
        <Bloc titre="Ce qui a été vu, du plus récent au plus ancien" compteur={synthese.aEteVu.length}>
          <ListeExtraits extraits={synthese.aEteVu} montrerProfesseur={montrerProfesseur} />
        </Bloc>
      )}

      {synthese.remarques.length > 0 && (
        <Bloc titre="Remarques des professeurs" compteur={synthese.remarques.length}>
          <ListeExtraits extraits={synthese.remarques} montrerProfesseur={montrerProfesseur} />
        </Bloc>
      )}

      {/* Fil des séances : la ligne par ligne d'où sort tout ce qui précède, replié par défaut —
          la synthèse doit rester « concise et claire » (demande client), sans pour autant couper
          l'accès à la source. */}
      <Bloc titre="Fil des séances" compteur={synthese.entrees.length}>
        <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 12, border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
          <ListeRepliable visibles={4} nom="séances">
            {synthese.entrees.map((e, index) => (
              <div key={`${e.debut}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 13px', borderBottom: '1px solid var(--border-soft)' }}>
                <span style={{ fontSize: 12, color: 'var(--ink-2)', width: 108, flexShrink: 0 }}>
                  {new Date(e.debut).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted-2)', width: 96, flexShrink: 0 }}>
                  {e.type === 'individuel' ? 'Individuel' : 'Collectif'} · {formaterMinutes(e.dureeMinutes)}
                </span>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flexGrow: 1, minWidth: 0 }}>
                  {e.rapport.objectifs.map((o) => (
                    <span key={o} style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-blue)', background: 'rgba(169,140,255,.12)', border: '1px solid rgba(169,140,255,.28)', borderRadius: 999, padding: '1px 8px' }}>
                      {libelleObjectif(o)}
                    </span>
                  ))}
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{libelleProgres(e.rapport.progres) ?? '—'}</span>
              </div>
            ))}
          </ListeRepliable>
        </div>
      </Bloc>
    </div>
  )
}

/* Bouton brillant + fenêtre de synthèse, posé dans l'en-tête du dossier étudiant de l'espace
   admin ET de l'espace professeur (demande client du 2026-09-30). Rien n'est calculé ni chargé
   tant qu'on n'a pas cliqué. */
export function SyntheseComptesRendus({ studentId, nomEleve, portee }: { studentId: string; nomEleve: string; portee: PorteeSynthese }) {
  const [ouvert, setOuvert] = useState(false)
  const [copie, setCopie] = useState(false)
  const { entrees, nbSeancesTerminees, loading, erreur } = useComptesRendusEtudiant(studentId, ouvert)
  const synthese = useMemo(() => construireSynthese(entrees, nbSeancesTerminees), [entrees, nbSeancesTerminees])

  async function copier() {
    try {
      await navigator.clipboard.writeText(syntheseEnTexte(synthese, nomEleve, SOUS_TITRE[portee]))
      setCopie(true)
      window.setTimeout(() => setCopie(false), 2200)
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission navigateur) : la synthèse reste
      // lisible et sélectionnable à l'écran, inutile d'alarmer avec une erreur bloquante.
      setCopie(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="btn-shine btn-primary btn-brillant"
        style={{ fontSize: 12.5, padding: '9px 16px' }}
      >
        <Icone nom="etoile" taille={14} />
        Résumer les comptes rendus
      </button>

      {ouvert && (
        <Modale titre={`Synthèse des comptes rendus — ${nomEleve}`} onFermer={() => setOuvert(false)} largeurMax={760}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>{SOUS_TITRE[portee]}</p>

            {loading && <EtatChargement lignes={4} hauteur={62} />}
            {erreur && <MessageErreur>{erreur}</MessageErreur>}

            {!loading && !erreur && synthese.nbComptesRendus === 0 && (
              <EtatVide
                icone="documents"
                titre="Aucun compte rendu à résumer"
                description={
                  nbSeancesTerminees > 0
                    ? `${nbSeancesTerminees} séance${nbSeancesTerminees > 1 ? 's' : ''} clôturée${nbSeancesTerminees > 1 ? 's' : ''}, mais aucun compte rendu rempli pour le moment.`
                    : 'La synthèse se construit d’elle-même dès qu’un professeur rédige son premier compte rendu de séance.'
                }
              />
            )}

            {!loading && !erreur && synthese.nbComptesRendus > 0 && (
              <>
                <CorpsSynthese synthese={synthese} portee={portee} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
                  <button type="button" onClick={copier} style={boutonSecondaireStyle}>
                    <Icone nom={copie ? 'valide' : 'documents'} taille={13} />
                    {copie ? 'Synthèse copiée' : 'Copier la synthèse'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modale>
      )}
    </>
  )
}
