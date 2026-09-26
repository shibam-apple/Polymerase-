import { adaptiveArtefacts, cleanIbis, hrvFromIbis } from '../src/signal/hrv';
import { analyzePpg } from '../src/signal/ppg';
import { fuseRespiration } from '../src/signal/respiration';
import { frameTimes, rng, simulatePpg } from '../src/signal/simulate';

describe('breathing rate by fusion', () => {
  for (const bpm of [8, 12, 18]) {
    it(`recovers ${bpm} breaths/min from a 60 s camera-like PPG`, () => {
      const t = frameTimes(60, 30);
      const x = simulatePpg(t, { hr: 66, respHz: bpm / 60, rsaMs: 60, ampMod: 0.12, baseMod: 0.15, noise: 0.03, inverted: true, seed: bpm });
      const a = analyzePpg(t, x, { inverted: true });
      expect(a.resp.rate).not.toBeNull();
      expect(Math.abs(a.resp.rate! - bpm)).toBeLessThanOrEqual(1.5);
      expect(a.resp.estimates.length).toBeGreaterThanOrEqual(2);
    });
  }

  it('says nothing rather than guessing when the modulations disagree', () => {
    const t = Array.from({ length: 60 }, (_, i) => i);
    const s = (f: number) => t.map(v => Math.sin(2 * Math.PI * f * v));
    const r = fuseRespiration([{ source: 'rifv', t, y: s(0.12) }, { source: 'riav', t, y: s(0.4) }]);
    expect(r.rate).toBeNull();
  });

  it('accepts two agreeing estimates when the third is off', () => {
    const t = Array.from({ length: 80 }, (_, i) => i * 0.9);
    const s = (f: number) => t.map(v => Math.sin(2 * Math.PI * f * v));
    const r = fuseRespiration([{ source: 'rifv', t, y: s(0.2) }, { source: 'riav', t, y: s(0.21) }, { source: 'riiv', t, y: s(0.45) }]);
    expect(r.rate).not.toBeNull();
    expect(Math.abs(r.rate! - 12.3)).toBeLessThan(1.5);
  });
});

describe('adaptive artefact rejection', () => {
  const rsa = (n: number, amp = 60) => { const r = rng(9); return Array.from({ length: n }, (_, i) => 900 + amp * Math.sin((2 * Math.PI * i) / 4.5) + (r() - 0.5) * 20); };

  it('keeps genuine breathing-driven variability', () => {
    const rr = rsa(80);
    expect(adaptiveArtefacts(rr).filter(Boolean).length).toBeLessThanOrEqual(1);
  });

  it('removes an ectopic beat (short then compensatory long)', () => {
    const rr = rsa(80, 20);
    rr[40] = 720; rr[41] = 1080; // premature beat + compensatory pause (each < 20% off the median)
    const flags = adaptiveArtefacts(rr);
    expect(flags[40] || flags[41]).toBe(true);
    const clean = hrvFromIbis(cleanIbis(rr))!, dirty = hrvFromIbis(rr.map(ms => ({ ms, valid: true })))!;
    expect(clean.rmssd).toBeLessThan(dirty.rmssd * 0.8);
  });
});
