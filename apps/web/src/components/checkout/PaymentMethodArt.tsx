type IconProps = {
  className?: string;
};

export function PixLogo({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect width="48" height="48" rx="12" fill="#32BCAD" />
      <path
        fill="#fff"
        d="M24.2 11.5c-1.8 0-3.4.7-4.6 2L13.8 19l-2.4 2.4a6.4 6.4 0 0 0 0 9.1l2.4 2.4 5.8 5.5c1.2 1.2 2.8 2 4.6 2s3.4-.7 4.6-2l5.8-5.5 2.4-2.4a6.4 6.4 0 0 0 0-9.1L34.2 13l-2.4-2.4a6.5 6.5 0 0 0-4.6-2Zm3.2 6.8 2.4 2.4-5.8 5.5-5.8-5.5 2.4-2.4 3.4-3.2c.5-.5 1.3-.5 1.8 0l1.6 1.2Zm-6.4 14.4-2.4-2.4 5.8-5.5 5.8 5.5-2.4 2.4-3.4 3.2c-.5.5-1.3.5-1.8 0l-1.6-1.2Z"
      />
    </svg>
  );
}

export function CardPaymentLogo({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect width="48" height="48" rx="12" fill="url(#atllyCardGrad)" />
      <rect x="8" y="13" width="32" height="22" rx="4" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.35)" />
      <rect x="8" y="18" width="32" height="5" fill="rgba(255,255,255,0.28)" />
      <rect x="12" y="27" width="10" height="3" rx="1.5" fill="#fff" opacity="0.85" />
      <rect x="24" y="27" width="8" height="3" rx="1.5" fill="#fff" opacity="0.55" />
      <defs>
        <linearGradient id="atllyCardGrad" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1a2740" />
          <stop offset="1" stopColor="#243b5c" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function CardBrandStrip({ className }: IconProps) {
  return (
    <div className={className} aria-hidden="true">
      <span className="native-checkout__brand native-checkout__brand--visa">VISA</span>
      <span className="native-checkout__brand native-checkout__brand--master">Master</span>
      <span className="native-checkout__brand native-checkout__brand--elo">Elo</span>
      <span className="native-checkout__brand native-checkout__brand--amex">Amex</span>
    </div>
  );
}
