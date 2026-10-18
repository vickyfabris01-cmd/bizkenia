// src/layouts/AuthLayout.jsx — MODIFIED (full BizKenia logo)
//
// AIM
// The centred card used by every sign-in screen (login, sign up, confirm, forgot, reset),
// with the logo above and the theme switch in the corner. Pass `title` and `subtitle`;
// the form goes in as children, extra links in `footer`.

import "./AuthLayout.css";
import { Link } from "react-router-dom";
import { ThemeToggle } from "../components/ui";
import BrandLogo from "../components/shell/BrandLogo.jsx";

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <div className="auth__theme"><ThemeToggle /></div>
      <main className="auth__card">
        <Link to="/" className="auth__logo" aria-label="Home"><BrandLogo variant="full" size={80} /></Link>
        <h1 className="auth__title">{title}</h1>
        {subtitle && <p className="auth__subtitle">{subtitle}</p>}
        {children}
        {footer && <div className="auth__footer">{footer}</div>}
      </main>
    </div>
  );
}
