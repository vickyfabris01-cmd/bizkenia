// src/components/business/BusinessCard.jsx — MODIFIED (square card: cover 65%, text 35%, no description)
//
// AIM
// One business in a list (home page, explore). A square. The cover picture (or a coloured
// placeholder with the first letter) fills the top 65%, with the logo mark on its top left corner
// and the type badge on its top right corner. The bottom 35% is two single lines: name, then county.
// The whole card is one link to /b/:slug. Also exports BusinessCardSkeleton for the loading state.
// Rows and grids of cards use .crow / .cgrid from CardRows.css.

import "./CardRows.css";
import "./BusinessCard.css";
import { Link } from "react-router-dom";
import { Badge, Icon, Skeleton } from "../ui";
import { typeLabel } from "../../config/counties.js";

export default function BusinessCard({ business }) {
  const b = business;
  return (
    <Link to={`/b/${b.slug}`} className="bcard">
      <div className="bcard__cover" style={b.cover_url ? { backgroundImage: `url("${b.cover_url}")` } : undefined}>
        {!b.cover_url && <span aria-hidden="true">{b.name.charAt(0).toUpperCase()}</span>}
        {(b.logo_url || b.cover_url) && (
          <span className="bcard__mark" aria-hidden="true">
            {b.logo_url ? <img src={b.logo_url} alt="" loading="lazy" /> : b.name.charAt(0).toUpperCase()}
          </span>
        )}
        <Badge variant="brand" size="sm" className="bcard__type">{typeLabel(b.business_type)}</Badge>
      </div>
      <div className="bcard__body">
        <h3 className="bcard__name">{b.name}</h3>
        <div className="bcard__place"><Icon name="home" size={12} /><span>{b.county || "Kenya"}</span></div>
      </div>
    </Link>
  );
}

export function BusinessCardSkeleton() {
  return (
    <div className="bcard bcard--skeleton" aria-hidden="true">
      <div className="bcard__cover"><Skeleton className="bcard__fill" /></div>
      <div className="bcard__body">
        <Skeleton height={14} width="60%" />
        <Skeleton height={12} width="35%" />
      </div>
    </div>
  );
}
