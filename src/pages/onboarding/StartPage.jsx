// src/pages/onboarding/StartPage.jsx — NEW FILE
//
// AIM
// Step 1 of onboarding: choose the type of business. Only types the super admin has switched on
// can be chosen; the others show "Coming soon" and cannot be selected.

import "./Onboarding.css";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, Icon } from "../../components/ui";
import Stepper from "./Stepper.jsx";
import { BUSINESS_TYPES } from "../../config/counties.js";

const ICONS = { rental: "building", agriculture: "home", shop: "card" };

export default function StartPage() {
  const navigate = useNavigate();
  return (
    <div className="pg pg--narrow">
      <Stepper step={1} />
      <h1 className="pg__title">What kind of business do you run?</h1>
      <p className="pg__lead">Choose a type. You can start another business later.</p>
      <div className="onb__types">
        {BUSINESS_TYPES.map((t) => {
          const open = t.open;
          return (
            <Card key={t.value} className={`onb__type${open ? "" : " is-disabled"}`}>
              <span className="onb__type-icon" aria-hidden="true"><Icon name={ICONS[t.value]} size={24} /></span>
              <div className="onb__type-text">
                <h2>{t.label} {!open && <Badge variant="neutral" size="sm">Coming soon</Badge>}</h2>
                <p>{t.blurb}</p>
              </div>
              <Button disabled={!open} onClick={() => navigate(`/start/details?type=${t.value}`)}>{open ? "Choose" : "Not open yet"}</Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
