// src/components/brand/BusinessLogo.jsx — NEW FILE
//
// AIM
// Shows a business logo. This is the one place every screen uses, so a logo looks the same in the
// directory, on the business page, in the dashboard header and in the shop bar.
//
// HOW IT CHOOSES
//   1. The logo the owner uploaded (business.logo_url), when there is one and it loads.
//   2. Otherwise a logo DRAWN in the browser from the saved recipe (business.logo_design). A business
//      with no recipe gets one worked out from its id, so nobody is ever left without a logo.
// The drawn logo is always there underneath, so on a slow connection there is never an empty box:
// the uploaded picture simply fades in over it once it has arrived, and if it fails the drawn logo stays.
//
// PROPS
//   business   { id, name, business_type, logo_url, logo_design }
//   size       height in pixels. Leave out to fill the box the logo is placed in.
//   layout     "icon" (default: the symbol on its own, square) or "wordmark" (symbol + name, twice as
//              wide as tall; always drawn, since an uploaded picture has no wordmark)
//   className  added to the wrapper
//   alt        text for screen readers (default: the business name)

import { useState } from "react";
import { logoUri } from "../../lib/brandStudio/index.js";
import "./BusinessLogo.css";

export default function BusinessLogo({ business, size, layout = "icon", className = "", alt }) {
  const b = business || {};
  const name = b.name || "";
  const [state, setState] = useState({ url: "", status: "" }); // status: "loaded" | "failed" for url

  const drawn = logoUri({ id: b.id, name, type: b.business_type, design: b.logo_design, layout });
  const upload = layout === "icon" && b.logo_url ? b.logo_url : "";
  const uploadLoaded = upload && state.url === upload && state.status === "loaded";
  const uploadFailed = upload && state.url === upload && state.status === "failed";

  const style = size ? { width: layout === "wordmark" ? size * 2 : size, height: size } : undefined;
  return (
    <span className={`bk-logo${size ? "" : " bk-logo--fill"} ${className}`.trim()} style={style} role="img" aria-label={alt ?? (name || "Business logo")}>
      <img className="bk-logo__img bk-logo__img--drawn" src={drawn} alt="" aria-hidden="true" decoding="async" style={{ opacity: uploadLoaded ? 0 : 1 }} />
      {upload && !uploadFailed && (
        <img
          key={upload}
          className="bk-logo__img bk-logo__img--upload"
          src={upload}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          style={{ opacity: uploadLoaded ? 1 : 0 }}
          onLoad={() => setState({ url: upload, status: "loaded" })}
          onError={() => setState({ url: upload, status: "failed" })}
        />
      )}
    </span>
  );
}
