export type ValidatorResult = { value?: unknown; warning?: string };
export type FieldValidator = (value: unknown) => ValidatorResult;
