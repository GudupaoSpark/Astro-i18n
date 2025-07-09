declare module 'cookie' {
  export function parse(cookieHeader: string): Record<string, string>;
  export function serialize(name: string, value: string, options?: {
    domain?: string;
    encode?: (value: string) => string;
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    priority?: 'low' | 'medium' | 'high';
    sameSite?: true | false | 'lax' | 'strict' | 'none';
    secure?: boolean;
  }): string;
}
