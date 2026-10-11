import { CHAMPS_TEXTE_ANCIENS, CHAMPS_TEXTE_COMPTE_RENDU, CHAMPS_TEXTE_SUITE, compteRenduRempli, libelleObjectif, libelleProgres, type CompteRenduValeurs } from '../../lib/compteRendu'
import { TexteRepliable } from '../ui/Repliable'
import { etiquetteStyle } from '../ui/Champ'

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
              style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-blue)', background: 'rgba(169,140,255,.14)', border: '1px solid rgba(169,140,255,.3)', borderRadius: 999, padding: '2px 9px' }}
            >
              {libelleObjectif(objectif)}
            </span>
          ))}
        </div>
      )}

      {/* Intitulé sur sa propre ligne, dans la couleur la plus lumineuse du thème (voir
          etiquetteStyle) — demande client du 2026-10-11 : à l'identique du `<strong>` en ligne
          d'avant, « A été vu : » et « Points à améliorer : » se fondaient dans le texte qui les
          suit, de la même couleur `--ink-2` et à la suite sur la même ligne. */}
      {CHAMPS_TEXTE_COMPTE_RENDU.map((champ) => {
        const valeur = rapport[champ.cle as keyof CompteRenduValeurs] as string | null
        if (!valeur) return null
        return (
          <div key={champ.cle} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={etiquetteStyle}>{champ.libelle}</span>
            <TexteRepliable texte={valeur} style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }} />
          </div>
        )
      })}

      {rapport.progres && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={etiquetteStyle}>Progrès</span>
          <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{libelleProgres(rapport.progres)}</span>
        </div>
      )}

      {[...CHAMPS_TEXTE_SUITE, ...CHAMPS_TEXTE_ANCIENS].map((champ) => {
        const valeur = rapport[champ.cle as keyof CompteRenduValeurs] as string | null
        if (!valeur) return null
        return (
          <div key={champ.cle} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={etiquetteStyle}>{champ.libelle}</span>
            <TexteRepliable texte={valeur} style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }} />
          </div>
        )
      })}
    </div>
  )
}
