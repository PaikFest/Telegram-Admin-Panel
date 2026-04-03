import xss, { IFilterXSSOptions } from 'xss';

const plainTextXssOptions: IFilterXSSOptions = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script'],
};

export function sanitizePlainText(value: string): string {
  return xss(value.trim(), plainTextXssOptions);
}

export function sanitizeOptionalPlainText(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const sanitized = sanitizePlainText(value);
  return sanitized.length > 0 ? sanitized : null;
}
