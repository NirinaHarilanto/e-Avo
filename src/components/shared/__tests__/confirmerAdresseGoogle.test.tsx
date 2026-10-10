import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmerAdresseGoogleModale } from '../ConfirmerAdresseGoogleModale'

/* Pop-up de confirmation de l'adresse Gmail (0112, exigence client du 2026-10-10 : « un pop-up pour
   bien vérifier son adresse mail avant la validation de la synchronisation »).

   Ce que ces tests protègent : l'adresse part NETTOYÉE (le serveur la compare ensuite à celle que
   Google renvoie, une espace parasite ferait échouer la connexion), et on ne peut pas partir vers
   Google sans adresse plausible — chaque passage par l'écran de consentement avec un compte
   différent consomme définitivement une place du quota Google de l'application. */
describe('ConfirmerAdresseGoogleModale', () => {
  it('pré-remplit l’adresse suggérée et confirme la valeur nettoyée', () => {
    const onConfirmer = vi.fn()
    render(
      <ConfirmerAdresseGoogleModale
        adresseSuggeree="irinastefanefr@gmail.com"
        onConfirmer={onConfirmer}
        onFermer={() => {}}
      />,
    )

    /* Une espace collée à l'adresse se glisse facilement dans un copier-coller, et le serveur
       compare ensuite caractère par caractère ce qui a été confirmé à ce que Google renvoie. */
    fireEvent.change(screen.getByPlaceholderText('prenom.nom@gmail.com'), {
      target: { value: '  irinastefanefr@gmail.com  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Continuer vers Google/ }))

    expect(onConfirmer).toHaveBeenCalledWith('irinastefanefr@gmail.com')
  })

  it('refuse de continuer tant que l’adresse n’est pas plausible', () => {
    render(<ConfirmerAdresseGoogleModale adresseSuggeree="pas-une-adresse" onConfirmer={() => {}} onFermer={() => {}} />)

    expect(screen.getByRole('button', { name: /Continuer vers Google/ })).toHaveProperty('disabled', true)
  })

  it('avertit du coût d’un compte supplémentaire', () => {
    render(<ConfirmerAdresseGoogleModale onConfirmer={() => {}} onFermer={() => {}} />)

    expect(screen.getByText(/occupe une place définitive/)).toBeTruthy()
  })

  /* Reconnecter la MÊME adresse est libre (voir api/google-personnel/demarrer.ts) : le pop-up doit
     le dire, sinon un professeur dont le compte est resté en lecture seule croit devoir demander
     une autorisation pour réparer sa propre synchronisation. */
  it('part de l’adresse déjà reliée et rappelle qu’en changer demande un accord', () => {
    render(
      <ConfirmerAdresseGoogleModale
        adresseActuelle="irinastefanefr@gmail.com"
        adresseSuggeree="autre@gmail.com"
        onConfirmer={() => {}}
        onFermer={() => {}}
      />,
    )

    expect(screen.getByDisplayValue('irinastefanefr@gmail.com')).toBeTruthy()
    expect(screen.getByText(/En changer demande l’accord de l’administration/)).toBeTruthy()
  })
})
