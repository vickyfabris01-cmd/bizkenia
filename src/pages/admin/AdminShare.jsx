// src/pages/admin/AdminShare.jsx — NEW FILE
//
// AIM
// /admin/share — the super admin shares the main site: the home page, Explore (to bring customers) and
// Pricing (to bring new business owners). Links go through the Worker so previews show the brand name,
// tagline and logo set in Settings.

import "./Admin.css";
import "../../components/share/ShareMenu.css";
import { Card, CardBody, CardHeader } from "../../components/ui";
import ShareMenu from "../../components/share/ShareMenu.jsx";
import useBrand from "../../hooks/useBrand.js";
import { message, shareLink, sharePath } from "../../lib/share.js";

export default function AdminShare() {
  const brand = useBrand();
  const pages = [
    { key: "home", title: "Main site", meta: "The home page: what the platform is and who it is for.", text: message.home(brand) },
    { key: "explore", title: "Explore businesses", meta: "For customers looking for rooms, products and farm produce.", text: message.explore(brand) },
    { key: "pricing", title: "Plans and pricing", meta: "For business owners who want to join.", text: message.pricing(brand) },
  ];

  return (
    <div className="adm">
      <h2 className="adm__title">Share the site</h2>
      <Card>
        <CardHeader title="Promote the platform" subtitle="Share these pages on WhatsApp, Facebook, X, Telegram and more. Each link shows the brand name and tagline from Settings." />
        <CardBody>
          <div className="share-list">
            {pages.map((p) => (
              <div className="share-row" key={p.key}>
                <div className="share-row__text">
                  <div className="share-row__title">{p.title}</div>
                  <div className="share-row__meta">{p.meta}</div>
                  <div className="share-row__meta">{shareLink(sharePath.page(p.key))}</div>
                </div>
                <ShareMenu target={{ path: sharePath.page(p.key), title: `${p.title} | ${brand.name}`, text: p.text }}
                  label={p.key === "home" ? "Share the site" : "Share"} variant={p.key === "home" ? "primary" : "outline"} size={p.key === "home" ? "md" : "sm"} />
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
