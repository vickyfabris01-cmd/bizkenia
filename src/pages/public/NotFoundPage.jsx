// src/pages/public/NotFoundPage.jsx — MODIFIED (full BizKenia logo)
//
// AIM
// The 404 page: shown for any address that does not exist. Built on the design tokens, so it
// works in light and dark mode and on every screen size. (The old inline 404 inside
// AppRouter used the previous brand colours.)

import "./NotFoundPage.css";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button.jsx";
import ThemeToggle from "../../components/ui/ThemeToggle.jsx";
import BrandLogo from "../../components/shell/BrandLogo.jsx";

export default function NotFoundPage() {
  return (
    <div className="nf">
      <div className="nf__theme">
        <ThemeToggle />
      </div>

      <main className="nf__card">
        <BrandLogo variant="full" size={88} />
        <p className="nf__code" aria-hidden="true">
          404
        </p>
        <h1 className="nf__title">Page not found</h1>
        <p className="nf__text">
          The page you are looking for does not exist, or you do not have access to it.
        </p>
        <Button as={Link} to="/" size="lg">
          Go to the home page
        </Button>
      </main>
    </div>
  );
}