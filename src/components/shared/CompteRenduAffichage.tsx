import { CHAMPS_TEXTE_COMPTE_RENDU, CHAMPS_TEXTE_SUITE, compteRenduRempli, libelleObjectif, libelleProgres, type CompteRenduValeurs } from '../../lib/compteRendu'
import { TexteRepliable } from '../ui/Repliable'

/* Lecture seule du compte rendu structuré (0052), partagée entre l'onglet Documents de l'admin
   et l'espace « Mes documents » de l'élève : mêmes champs, mêmes libellés, un seul endroit à
   retoucher si le template change. */
export function CompteRenduAffichage({ rapport }: { rapport: CompteRenduValeurs }) {
  if (!compteRenduRempli(rapport)) {
    return <p style={{ fontSize: 12.5, color: 'var(--muted-2)', margin: 0 }}>Compte rendu vide.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rapport.objectifs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {rapport.objectifs.map((objectif) => (
            <span
              key={objectif}
              style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-blue)', background: 'rgba(94,179,255,.14)', border: '1px solid rgba(94,179,255,.3)', borderRadius: 999, padding: '2px 9px' }}
            >
              {libelleObjectif(objectif)}
            </span>
          ))}
        </div>
      )}

      {CHAMPS_TEXTE_COMPTE_RENDU.map((champ) => {
        const valeur = rapport[champ.cle as keyof CompteRenduValeurs] as string | null
        if (!valeur) return null
        return (
          <p key={champ.cle} style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55 }}>
            <strong>{champ.libelle} :</strong> <TexteRepliable texte={valeur} style={{ fontSize: 12.5, color: 'var(--ink-2)' }} />
          </p>
        )
      })}

      {rapport.progres && (
        <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0 }}>
          <strong>Progrès :</strong> {libelleProgres(rapport.progres)}
        </p>
      )}

      {CHAMPS_TEXTE_SUITE.map((champ) => {
        const valeur = rapport[champ.cle as keyof CompteRenduValeurs] as string | null
        if (!valeur) return null
        return (
          <p key={champ.cle} style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55 }}>
            <strong>{champ.libelle} :</strong> <TexteRepliable texte={valeur} style={{ fontSize: 12.5, color: 'var(--ink-2)' }} />
          </p>
        )
      })}
    </div>
  )
}
