import { assetUrl } from "../../lib/urls";
import { PAYMENT_ASSETS_VERSION } from "./payment-assets.version";

function paymentAssetUrl(path: string) {
  return `${assetUrl(path)}?v=${PAYMENT_ASSETS_VERSION}`;
}

export const paymentAssets = {
  pixLogo: paymentAssetUrl("assets/payments/pix-logo.png"),
  cardBrands: paymentAssetUrl("assets/payments/card-brands.png"),
  trustBadges: paymentAssetUrl("assets/payments/trust-badges.png")
} as const;

type ImageProps = {
  className?: string;
  alt?: string;
};

export function PixBrandImage({ className, alt = "Pix" }: ImageProps) {
  return <img className={className} src={paymentAssets.pixLogo} alt={alt} loading="lazy" decoding="async" />;
}

export function CardBrandsImage({ className, alt = "Bandeiras aceitas" }: ImageProps) {
  return <img className={className} src={paymentAssets.cardBrands} alt={alt} loading="lazy" decoding="async" />;
}

export function CardMethodPreview({ className }: { className?: string }) {
  return (
    <CardBrandsImage
      className={className}
      alt="Cartões de crédito aceitos"
    />
  );
}

export function TrustBadgesImage({
  className,
  alt = "Compra segura, satisfação garantida e privacidade protegida"
}: ImageProps) {
  return <img className={className} src={paymentAssets.trustBadges} alt={alt} loading="lazy" decoding="async" />;
}
