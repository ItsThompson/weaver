export type ValidatorResult = {
  value?: unknown;
  warning?: string;
  fieldErrors?: Record<string, string>;
};
export type FieldValidator = (value: unknown) => ValidatorResult;
