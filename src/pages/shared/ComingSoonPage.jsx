// src/pages/shared/ComingSoonPage.jsx — NEW FILE
//
// AIM
// What every unbuilt screen shows: the screen's name, which build phase delivers it, and a
// way back. The site never shows a blank page or a 404 for a screen that is simply not built
// yet. The router passes `name` and `phase` from the module registry.
//
// PROPS
//   name       screen name ("Properties")
//   phase      number of the phase that delivers it
//   backTo     where "Back" goes (default: the previous page's parent via the router's "/")
//   backLabel  label for the back button
//   titleAs    heading tag for the name: "h1" (default) on public pages; "h2" inside the signed-in
//              shell, where the top bar already holds the page's h1

import "./ComingSoonPage.css";
import { Link } from "react-router-dom";
import { Button, Card, Icon } from "../../components/ui";

const PHASE_TEXT = {
  2: "Rental core for owners and managers",
  3: "Residents, workers, complaints, announcements and messages",
  4: "Reports and the agriculture module",
  5: "The shop module and the rest of the platform admin",
};

export default function ComingSoonPage({ name = "This screen", phase, backTo = "/", backLabel = "Go back", titleAs: Title = "h1" }) {
  return (
    <div className="soon">
      <Card className="soon__card">
        <span className="soon__icon" aria-hidden="true">
          <Icon name="info" size={26} />
        </span>
        <Title className="soon__title">{name}</Title>
        <p className="soon__badge">{phase ? `Coming in Phase ${phase}` : "Coming soon"}</p>
        <p className="soon__text">
          {phase && PHASE_TEXT[phase] ? `${PHASE_TEXT[phase]}. ` : ""}
          This screen is planned and its place in the menu is ready, but it has not been built yet.
        </p>
        <Button as={Link} to={backTo} variant="outline">
          {backLabel}
        </Button>
      </Card>
    </div>
  );
}
