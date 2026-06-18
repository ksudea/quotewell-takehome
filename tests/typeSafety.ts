import { submitAndConfirmRecord } from "../src/amsClient.ts";
import { validateAmsRecord } from "../src/validator.ts";
import type { ValidatedAmsRecord } from "../src/types.ts";

type Expect<T extends true> = T;
type IsExact<T, U> =
  (<G>() => G extends T ? 1 : 2) extends <G>() => G extends U ? 1 : 2
    ? (<G>() => G extends U ? 1 : 2) extends <G>() => G extends T ? 1 : 2
      ? true
      : false
    : false;

export type SubmissionInputIsValidatedRecord = Expect<
  IsExact<Parameters<typeof submitAndConfirmRecord>[0], ValidatedAmsRecord>
>;

export type ValidationSuccessReturnsValidatedRecord = Expect<
  IsExact<Extract<ReturnType<typeof validateAmsRecord>, { ok: true }>["record"], ValidatedAmsRecord>
>;
