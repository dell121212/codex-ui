import { describe, expect, it } from 'vitest';
import { formatTokenExact, formatTokenM, formatTokenWithUnit } from './tokenDisplay';

describe('token display formatting', () => {
  it('uses decimal M units and trims only nonessential zeroes', () => {
    expect(formatTokenM(384_200)).toBe('0.384M');
    expect(formatTokenM(2_800_000)).toBe('2.8M');
    expect(formatTokenM(8_520_000)).toBe('8.52M');
    expect(formatTokenM(1_001_000)).toBe('1.001M');
  });

  it('keeps zero fixed and marks positive sub-thousand values as less than 0.001M', () => {
    expect(formatTokenM(0)).toBe('0.000M');
    expect(formatTokenM(1)).toBe('<0.001M');
    expect(formatTokenM(999)).toBe('<0.001M');
    expect(formatTokenM(1_000)).toBe('0.001M');
  });

  it('renders unavailable values as an em dash', () => {
    expect(formatTokenM(undefined)).toBe('—');
    expect(formatTokenM(null)).toBe('—');
    expect(formatTokenM(Number.NaN)).toBe('—');
    expect(formatTokenM(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatTokenWithUnit(null)).toBe('—');
  });

  it('preserves exact integer metadata separately from the abbreviated value', () => {
    expect(formatTokenExact(384_200)).toBe('384,200 Token');
    expect(formatTokenExact(2_800_000)).toBe('2,800,000 Token');
    expect(formatTokenExact(0)).toBe('0 Token');
    expect(formatTokenExact(undefined)).toBe('—');
  });
});
