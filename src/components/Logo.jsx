import logoDark from '../assets/branding/recall-plus-logo-dark.png'
import logoLight from '../assets/branding/recall-plus-logo-light.png'

export default function Logo({ compact = false, inverse = false, outlined = true }) {
  return (
    <span
      className={`flex min-w-0 items-center overflow-hidden transition-[width] duration-300 ${
        compact ? 'w-14 justify-center' : 'w-[13.5rem] max-w-full justify-start'
      }`}
    >
      <img
        className={`${outlined ? 'brand-logo-outline' : ''} h-auto w-full shrink-0 p-px object-contain`}
        src={inverse ? logoDark : logoLight}
        width={inverse ? 1064 : 1066}
        height={inverse ? 231 : 233}
        alt="Recall+"
      />
    </span>
  )
}
