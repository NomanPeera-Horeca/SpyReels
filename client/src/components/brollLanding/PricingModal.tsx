type PricingModalProps = {
  open: boolean;
  onClose: () => void;
  onSeePlans: () => void;
  busy?: boolean;
};

export function PricingModal({
  open,
  onClose,
  onSeePlans,
  busy,
}: PricingModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
        aria-label="Close pricing modal"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricing-title"
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <button
          type="button"
          aria-label="Close"
          className="absolute right-4 top-4 text-zinc-400 transition hover:text-zinc-700"
          onClick={onClose}
        >
          ✕
        </button>
        <p className="font-ui text-[12px] font-bold uppercase tracking-[0.05em] text-violet-700 lg:text-[13px]">
          Full-resolution download
        </p>
        <h2
          id="pricing-title"
          className="mt-2 font-display text-[24px] font-semibold leading-tight text-zinc-900"
        >
          Unlock the watermark-free download
        </h2>
        <ul className="mt-5 flex flex-col gap-3 text-[15px] text-zinc-600">
          <li className="flex items-start gap-2">
            <span className="text-green-600">✓</span> Full-resolution clips, no watermark
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600">✓</span> Save projects and regenerate beats
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600">✓</span> Higher monthly B-roll generation limits
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600">✓</span> Viral Reel Finder + AI Personal Brand Coach
          </li>
        </ul>
        <button
          type="button"
          disabled={busy}
          onClick={onSeePlans}
          className="mt-6 block w-full rounded-xl bg-violet-600 px-5 py-3 text-center font-ui text-[15px] font-bold text-white transition hover:bg-violet-500 disabled:opacity-70"
        >
          {busy ? "Opening checkout…" : "See plans"}
        </button>
        <p className="mt-3 text-center font-ui text-[13px] text-zinc-400">
          Previewing and saving stay free.
        </p>
      </div>
    </div>
  );
}
