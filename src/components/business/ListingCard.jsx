// src/components/business/ListingCard.jsx — MODIFIED (square card: picture 65%, text 35%)
//
// AIM
// One small card for something you can buy or rent: a shop product, farm produce or a room.
// A square. The picture fills the top 65% (first letter when there is none), with the room type
// or "Out of stock" badge on its top left corner. The bottom 35% is three single lines:
// title, price, then seller and county. Text sizes follow the card width (see ListingCard.css).
// Pass a ready-made `listing`: { key, to?, image?, title, price, place?, badge? }.
// With `to` the whole card is a link; without it the card is plain (used on a farm's own page).
// Rows and grids of cards use .crow / .cgrid from CardRows.css.

import "./CardRows.css";
import "./ListingCard.css";
import { Link } from "react-router-dom";
import { Badge, Skeleton } from "../ui";

export default function ListingCard({ listing }) {
  const { to, image, title, price, place, badge } = listing;
  const body = (
    <>
      <div className="listing__media">
        <div className="listing__img" style={image ? { backgroundImage: `url("${image}")` } : undefined}
          role={image ? "img" : undefined} aria-label={image ? title : undefined}>
          {!image && <span aria-hidden="true">{(title || "?").charAt(0).toUpperCase()}</span>}
        </div>
        {badge && <Badge variant="neutral" size="sm" className="listing__badge">{badge}</Badge>}
      </div>
      <div className="listing__body">
        <h3 className="listing__title">{title}</h3>
        <div className="listing__price">{price}</div>
        {place && <div className="listing__place">{place}</div>}
      </div>
    </>
  );
  return to ? <Link to={to} className="listing">{body}</Link> : <div className="listing">{body}</div>;
}

export function ListingCardSkeleton() {
  return (
    <div className="listing listing--skeleton" aria-hidden="true">
      <div className="listing__media"><Skeleton className="listing__fill" /></div>
      <div className="listing__body">
        <Skeleton height={12} width="80%" />
        <Skeleton height={12} width="50%" />
      </div>
    </div>
  );
}
