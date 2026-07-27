import logoMark from '../assets/recall-plus-logo.png'

export default function Logo({ compact = false, inverse = false }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <img
        className="size-10 shrink-0 object-contain"
        src={logoMark}
        width="260"
        height="260"
        alt=""
      />
      {compact ? null : (
        <span className={`whitespace-nowrap text-[1.75rem] font-black uppercase leading-none tracking-[-0.055em] ${inverse ? 'text-white' : 'text-foreground'}`}>
          RECALL<span className="ml-0.5 text-[#8B2CFF]">+</span>
        </span>
      )}
    </span>
  )
}
