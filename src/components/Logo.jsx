import logoMark from '../assets/recall-plus-logo.png'

export default function Logo({ compact = false, inverse = false }) {
  return (
    <div className={`flex items-center gap-3 ${inverse ? 'rounded-xl bg-background px-2.5 py-1.5' : ''}`}>
      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-background">
        <img className="h-full w-full object-contain" src={logoMark} alt="" />
      </span>
      {compact ? null : (
        <span className={`whitespace-nowrap text-[2rem] font-black uppercase leading-none tracking-[-0.055em] ${inverse ? 'text-black' : 'text-black'}`}>
          RECALL<span className="ml-0.5 text-[#8B2CFF]">+</span>
        </span>
      )}
    </div>
  )
}
