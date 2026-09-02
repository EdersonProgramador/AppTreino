import { assetUrl } from "../../lib/urls";

export const paymentAssets = {
  pixLogo: assetUrl("assets/payments/pix-logo.png"),
  cardBrands: assetUrl("assets/payments/card-brands.png")
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
