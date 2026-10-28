// src/components/share/ShareProvider.jsx — NEW FILE
//
// AIM
// Mounted once in the business frame and once in the admin frame. Any screen inside them can call
// useShare().share(request) (or render a <ShareButton>) and the platform picker (ShareMenu) opens right there,
// over the current screen. No page change, no extra page to load.
//
// When the thing is out of stock (a product) or has no free room (a room type), the owner or manager is
// asked first: "Share anyway?" Yes opens the picker, and the card will say "Out of stock" or "Fully occupied";
// No does nothing.

import { useCallback, useMemo, useState } from "react";
import { ConfirmDialog } from "../modals/Modal.jsx";
import ShareMenu from "./ShareMenu.jsx";
import { ShareContext } from "./shareContext.js";
import { unavailability } from "../../lib/share.js";

export default function ShareProvider({ children }) {
  const [request, setRequest] = useState(null); // what the picker is open for
  const [ask, setAsk] = useState(null);         // { req, title, message } while the "Share anyway?" question is open

  const share = useCallback((req) => {
    if (!req) return;
    const why = unavailability(req);
    if (why) setAsk({ req, ...why });
    else setRequest(req);
  }, []);
  const value = useMemo(() => ({ share }), [share]);

  return (
    <ShareContext.Provider value={value}>
      {children}
      <ShareMenu open={Boolean(request)} request={request} onClose={() => setRequest(null)} />
      <ConfirmDialog isOpen={Boolean(ask)} variant="warning" title={ask?.title || ""} message={ask?.message}
        confirmLabel="Share anyway" cancelLabel="Don't share"
        onConfirm={() => { const req = ask.req; setAsk(null); setRequest(req); }}
        onCancel={() => setAsk(null)} />
    </ShareContext.Provider>
  );
}
