// src/components/shell/BrandLogo.jsx — MODIFIED (real BizKenia logo; contextual business logo)
//
// AIM
// The product logo in one place (header, sidebar, top bar, footer, sign-in pages, 404).
// Two looks of the BizKenia logo:
//   variant "mark" (default)  the BK mark, plus the product name as text beside it. The name
//                             comes from Admin > Settings, so a rename still shows everywhere.
//   variant "full"            the full logo with the BizKenia wordmark baked in (footer, sign-in
//                             pages, 404).
// The logo is dark green, so it sits on a small light tile that shows in dark mode and always in
// the dark green sidebar (see BrandLogo.css).
//
// With `contextual`, and while a screen has told the business brand store which business it is
// about (business page, room request, /app/:slug), the mark and name become that business's logo
// (or its first letter on green when it has no logo) and its name. While that business is still
// loading, only its first letter shows. Inside a business the BizKenia logo is never the fallback.
// Without `contextual`, such as in the footer, it is always the platform logo.
//
// PROPS
//   variant      "mark" (default) or "full"
//   showName     "mark" only: show the name beside the mark (default true)
//   size         height of the image in pixels (default 32 for "mark", 80 for "full")
//   contextual   use the current business instead of the platform (default false)
//   className

import { useState } from "react";
import useBrand from "../../hooks/useBrand.js";
import useBusinessBrandStore from "../../store/businessBrandStore.js";
import markSrc from "../../assets/bizkenia-mark.png";
import fullSrc from "../../assets/bizkenia-logo.png";
import "./BrandLogo.css";

const MARK_RATIO = 282 / 160; // width / height of bizkenia-mark.png
const FULL_RATIO = 560 / 447; // width / height of bizkenia-logo.png

function BusinessMark({ business, showName, size, className }) {
  const [failedUrl, setFailedUrl] = useState("");
  const name = business.name || "";
  const showImg = !business.provisional && business.logo_url && failedUrl !== business.logo_url;
  const withName = showName && !business.provisional; // still loading: the letter only
  return (
    <span className={`shell-logo ${className}`.trim()}>
      {showImg ? (
        <img
          className="shell-logo__img"
          src={business.logo_url}
          alt={withName ? "" : name}
          width={size}
          height={size}
          onError={() => setFailedUrl(business.logo_url)}
        />
      ) : (
        <span
          className="shell-logo__letter"
          style={{ width: size, height: size }}
          role={withName ? undefined : "img"}
          aria-label={withName ? undefined : name}
          aria-hidden={withName ? "true" : undefined}
        >
          {(name.trim().charAt(0) || "?").toUpperCase()}
        </span>
      )}
      {withName && <span className="shell-logo__name shell-logo__name--business">{name}</span>}
    </span>
  );
}

export default function BrandLogo({ variant = "mark", showName = true, size, className = "", contextual = false }) {
  const BRAND = useBrand();
  const business = useBusinessBrandStore((s) => s.business);

  if (contextual && business) {
    return <BusinessMark business={business} showName={showName} size={size || 32} className={className} />;
  }

  if (variant === "full") {
    const h = size || 80;
    return (
      <span className={`shell-logo shell-logo--full ${className}`.trim()}>
        <span className="shell-logo__tile">
          <img className="shell-logo__full" src={fullSrc} alt={BRAND.name} width={Math.round(h * FULL_RATIO)} height={h} />
        </span>
      </span>
    );
  }

  const h = size || 32;
  return (
    <span className={`shell-logo ${className}`.trim()}>
      <span className="shell-logo__tile">
        <img className="shell-logo__mark" src={markSrc} alt={showName ? "" : BRAND.name} width={Math.round(h * MARK_RATIO)} height={h} />
      </span>
      {showName && <span className="shell-logo__name">{BRAND.name}</span>}
    </span>
  );
}
