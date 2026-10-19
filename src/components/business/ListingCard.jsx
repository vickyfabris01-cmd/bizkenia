// src/components/business/ListingCard.jsx — NEW FILE
//
// AIM
// One small card for something you can buy or rent: a shop product, farm produce or a room.
// Photo on top (first letter when there is none), name, price, and where it is from.
// Pass a ready-made `listing`: { key, to?, image?, title, price, place?, badge? }.
// With `to` the whole card is a link; without it the card is plain (used on a farm's own page).

import "./ListingCard.css";
import { Link } from "react-router-dom";
import { Badge, Skeleton } from "../ui";

export default function ListingCard({ listing }) {
  const { to, image, title, price, place, badge } = listing;
  const body = (
    <>
      <div className="listing__img" style={image ? { backgroundImage: `url("${image}")` } : undefined}
        role={image ? "img" : undefined} aria-label={image ? title : undefined}>
        {!image && <span aria-hidden="true">{(title || "?").charAt(0).toUpperCase()}</span>}
      </div>
      <div className="listing__body">
        {badge && <Badge variant="neutral">{badge}</Badge>}
        <h3 className="listing__title">{title}</h3>
        <p className="listing__price">{price}</p>
        {place && <p className="listing__place">{place}</p>}
      </div>
    </>
  );
  return to ? <Link to={to} className="listing">{body}</Link> : <div className="listing">{body}</div>;
}

export function ListingCardSkeleton() {
  return (
    <div className="listing" aria-hidden="true">
      <Skeleton height={150} style={{ borderRadius: 0 }} />
      <div className="listing__body">
        <Skeleton height={16} width="80%" />
        <Skeleton height={16} width="50%" />
      </div>
    </div>
  );
}