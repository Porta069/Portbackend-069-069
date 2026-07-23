/**
 * The registration wizard.
 *
 * Steps 1–5 come FIRST and are intentionally left as PLACEHOLDERS — their
 * fields and validation are not defined yet ("noch in Bearbeitung"). The
 * backend accepts and stores each step's payload opaquely (RegistrationDraft.
 * stepData) so the frontend can build the wizard against a stable contract
 * today; the real per-step schema is filled in later.
 *
 * The final step (CONTACT_STEP) is fully defined: firstName, lastName, email,
 * phone (+ password) — see CompleteRegistrationDto. Completing it creates the
 * User account and returns an access token.
 */

export interface RegistrationStepDef {
  step: number;
  key: string;
  /** TODO: finalize the user-facing wording once the step is designed. */
  title: string;
  /** Placeholder steps flip to true once their real schema is implemented. */
  implemented: boolean;
}

/** The five leading placeholder steps. Extend/define these as the flow lands. */
export const PLACEHOLDER_STEPS: RegistrationStepDef[] = [
  {
    step: 1,
    key: 'step_1',
    title: 'Schritt 1 (noch offen)',
    implemented: false,
  },
  {
    step: 2,
    key: 'step_2',
    title: 'Schritt 2 (noch offen)',
    implemented: false,
  },
  {
    step: 3,
    key: 'step_3',
    title: 'Schritt 3 (noch offen)',
    implemented: false,
  },
  {
    step: 4,
    key: 'step_4',
    title: 'Schritt 4 (noch offen)',
    implemented: false,
  },
  {
    step: 5,
    key: 'step_5',
    title: 'Schritt 5 (noch offen)',
    implemented: false,
  },
];

/** The final, fully-defined contact step that creates the account. */
export const CONTACT_STEP = 6;

/** Total number of steps in the wizard (5 placeholders + contact). */
export const TOTAL_STEPS = CONTACT_STEP;

export const FIRST_PLACEHOLDER_STEP = PLACEHOLDER_STEPS[0].step;
export const LAST_PLACEHOLDER_STEP =
  PLACEHOLDER_STEPS[PLACEHOLDER_STEPS.length - 1].step;
