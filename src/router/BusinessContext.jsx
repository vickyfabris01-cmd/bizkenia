// src/router/BusinessContext.jsx — NEW FILE
//
// AIM
// Gives every screen inside /app/:slug the business and the person's role in it:
//   const { business, role } = useBusinessContext();   // null outside a business
// RequireMember (guards.jsx) fills it in.

import { createContext, useContext } from "react";

export const BusinessContext = createContext(null);
export const useBusinessContext = () => useContext(BusinessContext);
