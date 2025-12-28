- This project uses Yarn 4.
- When implementing a plan, only proceed to next phase when instructed to.
- When asking to proceed, only show me the plan for the next phase.
- Write specs before code.

Formatting rules:
- lines should not be more than 80 chars wide.

Spec rules:
- Each spec in the `spec` directory should correspond to a module in the `src`
  directory.
- Each public function of a module should have a corresponding top-level
  `describe` block. E.g:
  - the `format` function in `src/index.ts` will have a `describe("format()")`
    block in `spec/index.spec.ts`.
