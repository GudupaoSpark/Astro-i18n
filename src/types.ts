export type LocaleMap = Record<string, string>;
export type Locals = {
  t: (key: string) => string;
  lang?: string;
};
