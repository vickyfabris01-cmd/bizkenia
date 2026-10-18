// src/components/auth/AfterSignIn.jsx — NEW FILE
//
// AIM
// Shown when a signed-in person opens the login or sign-up page: works out where they belong
// (see lib/landing.js) and sends them there. `next` (from ?next=…) wins when it is safe.

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FullPageLoader } from "../../router/guards.jsx";
import { useSession } from "../../store/sessionStore.js";
import { landingFor, safeNext } from "../../lib/landing.js";

export default function AfterSignIn({ next }) {
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const profile = useSession((s) => s.profile);

  useEffect(() => {
    if (!user || !profile) return undefined;
    let alive = true;
    landingFor(profile, user.id).then((to) => {
      if (alive) navigate(safeNext(next, to), { replace: true });
    });
    return () => { alive = false; };
  }, [user, profile, next, navigate]);

  return <FullPageLoader />;
}