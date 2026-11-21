import { describe, expect, it } from 'vitest';

import { pickGroup } from '../src/state/select';

describe('pickGroup', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };

  it('reopens the group last open on this device after a reload', () => {
    expect(pickGroup([a, b], null, 'b')).toBe(b);
  });

  it('keeps the group in use over the stored one', () => {
    expect(pickGroup([a, b], 'a', 'b')).toBe(a);
  });

  it('falls back to the first group when the stored one is gone or missing', () => {
    expect(pickGroup([a, b], null, 'gone')).toBe(a);
    expect(pickGroup([a, b], null, null)).toBe(a);
    expect(pickGroup([a, b], 'gone', 'b')).toBe(a);
  });

  it('returns null with no groups', () => {
    expect(pickGroup([], null, 'b')).toBeNull();
  });
});
