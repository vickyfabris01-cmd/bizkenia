// src/pages/onboarding/Stepper.jsx — NEW FILE
// The four-step progress strip at the top of the onboarding pages.

const STEPS = ["Type", "Details", "Subscribe", "Approval"];

export default function Stepper({ step = 1 }) {
  return (
    <ol className="onb__steps" aria-label="Progress">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < step ? "done" : n === step ? "current" : "todo";
        return (
          <li key={label} className={`onb__step is-${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="onb__step-n">{state === "done" ? "✓" : n}</span>
            <span className="onb__step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
