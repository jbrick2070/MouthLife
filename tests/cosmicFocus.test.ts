import { describe, expect, it } from 'vitest';
import { resolveFocusSelector } from '../src/ui/CosmicIntroOverlay';

describe('Cosmic intro focus preservation', () => {
  const has = (...sels: string[]) => (q: string) => sels.includes(q);

  it('keeps focus on the same Mohs specimen after it re-renders', () => {
    expect(resolveFocusSelector({ mohsIdx: '3' }, has('[data-mohs-idx="3"]', '#btn-next-beat'))).toBe('[data-mohs-idx="3"]');
  });

  it('keeps focus on the same navigation button', () => {
    expect(resolveFocusSelector({ id: 'btn-prev-beat' }, has('#btn-prev-beat', '#btn-next-beat'))).toBe('#btn-prev-beat');
  });

  it('falls back to Next, then Finish, when the focused button vanished', () => {
    expect(resolveFocusSelector({ id: 'btn-prev-beat' }, has('#btn-next-beat'))).toBe('#btn-next-beat');
    expect(resolveFocusSelector({ id: 'btn-next-beat' }, has('#btn-finish-cosmic'))).toBe('#btn-finish-cosmic');
    expect(resolveFocusSelector({}, () => false)).toBeNull();
  });
});
