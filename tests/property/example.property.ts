import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

describe('Example Property Test', () => {
  it('should verify addition is commutative', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        expect(a + b).toBe(b + a);
      })
    );
  });

  it('should verify string concatenation length', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        expect((a + b).length).toBe(a.length + b.length);
      })
    );
  });
});
