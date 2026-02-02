import { useMemo, useState } from 'react';
import { Device } from '@shared/types';
import { Commands } from '@shared/commands';
import styles from './ConfigEditor.module.css';

const DW1000_TIME_TO_METERS = 0.004691763978616;

type LayoutId = 0 | 1 | 2 | 3;

interface AnchorEndpoint {
  anchorId: number;
  ip: string;
}

interface TdoaDistancesResponse {
  anchorId: number;
  antennaDelay: number;
  activeSlots: number;
  distances: number[];
  error?: string;
}

class Stats {
  count = 0;
  mean = 0;
  m2 = 0;

  add(x: number) {
    this.count += 1;
    const delta = x - this.mean;
    this.mean += delta / this.count;
    const delta2 = x - this.mean;
    this.m2 += delta * delta2;
  }
}

interface Measurement {
  i: number;
  j: number;
  b: number;
  weight: number;
}

interface ErrorReport {
  rmsM: number;
  maxAbsM: number;
  pairErrors: Array<{ a: number; b: number; errorM: number }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function wsSend(ip: string, command: string, timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(`ws://${ip}/ws`);

    const timeout = setTimeout(() => {
      ws.close();
      if (!settled) {
        settled = true;
        reject(new Error('Command timeout'));
      }
    }, timeoutMs);

    ws.onopen = () => ws.send(command);

    ws.onmessage = (event) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;
      ws.close();
      resolve(typeof event.data === 'string' ? event.data : String(event.data));
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      ws.close();
      if (!settled) {
        settled = true;
        reject(new Error('WebSocket error'));
      }
    };
  });
}

async function wsSendJson<T>(ip: string, command: string, timeoutMs: number): Promise<T> {
  const raw = await wsSend(ip, command, timeoutMs);
  const jsonStart = raw.indexOf('{');
  const payload = jsonStart !== -1 ? raw.substring(jsonStart) : raw;
  return JSON.parse(payload) as T;
}

function buildRectangularTargets(layout: LayoutId, x: number, y: number): number[][] {
  const pos: Array<[number, number]> = Array.from({ length: 4 }, () => [0, 0]);

  const [xAnchor, yAnchor, corner] = (() => {
    switch (layout) {
      case 0: return [1, 3, 2] as const;
      case 1: return [1, 2, 3] as const;
      case 2: return [3, 1, 2] as const;
      case 3: return [2, 3, 1] as const;
    }
  })();

  pos[0] = [0, 0];
  pos[xAnchor] = [x, 0];
  pos[yAnchor] = [0, y];
  pos[corner] = [x, y];

  const d = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => 0));
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const dx = pos[i][0] - pos[j][0];
      const dy = pos[i][1] - pos[j][1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      d[i][j] = dist;
      d[j][i] = dist;
    }
  }
  return d;
}

function robustScaleMad(residuals: number[]): number {
  if (residuals.length === 0) return 0;
  const abs = residuals.map((r) => Math.abs(r)).sort((a, b) => a - b);
  const mid = Math.floor(abs.length / 2);
  const med = abs.length % 2 === 0 ? (abs[mid - 1] + abs[mid]) / 2 : abs[mid];
  return med / 0.6745;
}

function solveLinearSystem(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row) => row.slice());
  const x = b.slice();

  for (let i = 0; i < n; i++) {
    let pivot = i;
    let max = Math.abs(m[i][i]);
    for (let r = i + 1; r < n; r++) {
      const v = Math.abs(m[r][i]);
      if (v > max) {
        max = v;
        pivot = r;
      }
    }
    if (max < 1e-12) {
      throw new Error('Singular system (insufficient measurements)');
    }
    if (pivot !== i) {
      [m[i], m[pivot]] = [m[pivot], m[i]];
      [x[i], x[pivot]] = [x[pivot], x[i]];
    }

    const diag = m[i][i];
    for (let c = i; c < n; c++) m[i][c] /= diag;
    x[i] /= diag;

    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const factor = m[r][i];
      if (Math.abs(factor) < 1e-12) continue;
      for (let c = i; c < n; c++) m[r][c] -= factor * m[i][c];
      x[r] -= factor * x[i];
    }
  }

  return x;
}

function solveDelaysIrls(measurements: Measurement[], prior: number[], priorSigmaTicks: number): number[] {
  const n = prior.length;
  const baseWeights = measurements.map((m) => Math.max(1, m.weight));
  let weights = baseWeights.slice();

  const meanW = baseWeights.reduce((a, c) => a + c, 0) / baseWeights.length;
  const lambda = priorSigmaTicks > 0 ? meanW / (priorSigmaTicks * priorSigmaTicks) : 0;

  let x = prior.slice();
  for (let it = 0; it < 3; it++) {
    const ata = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
    const atb = Array.from({ length: n }, () => 0);

    measurements.forEach((m, k) => {
      const w = weights[k];
      ata[m.i][m.i] += w;
      ata[m.j][m.j] += w;
      ata[m.i][m.j] += w;
      ata[m.j][m.i] += w;
      atb[m.i] += w * m.b;
      atb[m.j] += w * m.b;
    });

    for (let i = 0; i < n; i++) {
      ata[i][i] += lambda;
      atb[i] += lambda * prior[i];
    }

    x = solveLinearSystem(ata, atb);

    const residuals = measurements.map((m) => (x[m.i] + x[m.j] - m.b));
    const scale = Math.max(robustScaleMad(residuals), 1e-6);
    const delta = 1.5 * scale;
    residuals.forEach((r, k) => {
      const a = Math.abs(r);
      const huber = a <= delta ? 1 : delta / a;
      weights[k] = baseWeights[k] * huber;
    });
  }

  return x;
}

function computeError(pairStats: Stats[][], targetsM: number[][], delays: number[]): ErrorReport {
  const pairErrors: ErrorReport['pairErrors'] = [];
  let sumSq = 0;
  let count = 0;
  let maxAbs = 0;

  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const stats = pairStats[i][j];
      if (stats.count === 0) continue;
      const correctedTicks = stats.mean - delays[i] - delays[j];
      const correctedM = correctedTicks * DW1000_TIME_TO_METERS;
      const e = correctedM - targetsM[i][j];
      pairErrors.push({ a: i, b: j, errorM: e });
      sumSq += e * e;
      count += 1;
      maxAbs = Math.max(maxAbs, Math.abs(e));
    }
  }

  const rms = count > 0 ? Math.sqrt(sumSq / count) : Number.NaN;
  return { rmsM: rms, maxAbsM: maxAbs, pairErrors };
}

export function AnchorDelayCalibration({ devices }: { devices: Device[] }) {
  const [layout, setLayout] = useState<LayoutId>(0);
  const [x, setX] = useState('5.2');
  const [y, setY] = useState('2.3');
  const [dryRun, setDryRun] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<{ delays: number[]; error: ErrorReport } | null>(null);

  const anchors = useMemo(() => {
    const byId = new Map<number, Device>();
    for (const d of devices) {
      if (d.role !== 'anchor_tdoa') continue;
      const raw = (d.uwbShort || d.id || '').trim();
      const id = Number.parseInt(raw, 10);
      if (Number.isFinite(id)) {
        byId.set(id, d);
      }
    }
    return byId;
  }, [devices]);

  const endpoints = useMemo<AnchorEndpoint[] | null>(() => {
    const required = [0, 1, 2, 3];
    const eps: AnchorEndpoint[] = [];
    for (const id of required) {
      const dev = anchors.get(id);
      if (!dev) return null;
      eps.push({ anchorId: id, ip: dev.ip });
    }
    return eps;
  }, [anchors]);

  const addLog = (line: string) => setLog((prev) => [...prev.slice(-200), line]);

  const runCalibration = async () => {
    setResult(null);
    setLog([]);
    setStatus(null);

    if (!endpoints) {
      setStatus('Need 4 anchors in anchor_tdoa mode with IDs 0..3 on the network.');
      return;
    }

    const xM = Number.parseFloat(x);
    const yM = Number.parseFloat(y);
    if (!Number.isFinite(xM) || !Number.isFinite(yM) || xM <= 0 || yM <= 0) {
      setStatus('Invalid X/Y distances. Enter positive meters.');
      return;
    }

    const timeoutMs = 5000;
    const sampleDurationMs = 8000;
    const sampleIntervalMs = 250;
    const minSamples = 30;
    const maxIters = 3;
    const toleranceM = 0.05;
    const minImprovementM = 0.005;
    const priorSigmaTicks = 100;

    const targetsM = buildRectangularTargets(layout, xM, yM);
    const targetsTicks = targetsM.map((row) => row.map((d) => d / DW1000_TIME_TO_METERS));

    setRunning(true);
    try {
      const prior = Array.from({ length: 4 }, () => 0);
      for (const ep of endpoints) {
        const r = await wsSendJson<TdoaDistancesResponse>(ep.ip, Commands.tdoaDistances(), timeoutMs);
        if (typeof r.antennaDelay === 'number') {
          prior[ep.anchorId] = r.antennaDelay;
        }
      }

      let prevRms: number | null = null;
      for (let iter = 0; iter < maxIters; iter++) {
        addLog(`Iteration ${iter + 1}/${maxIters}: sampling inter-anchor distances...`);
        const pairStats = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => new Stats()));
        const lastDelays = new Map<number, number>();

        const start = Date.now();
        while (Date.now() - start < sampleDurationMs) {
          const reads = await Promise.allSettled(
            endpoints.map((ep) => wsSendJson<TdoaDistancesResponse>(ep.ip, Commands.tdoaDistances(), timeoutMs))
          );

          reads.forEach((res) => {
            if (res.status !== 'fulfilled') return;
            const data = res.value;
            if (typeof data.anchorId !== 'number' || data.anchorId < 0 || data.anchorId > 3) return;
            if (typeof data.antennaDelay === 'number') {
              lastDelays.set(data.anchorId, data.antennaDelay);
            }
            if (!Array.isArray(data.distances)) return;
            data.distances.forEach((dist, remoteId) => {
              if (remoteId < 0 || remoteId > 3) return;
              if (remoteId === data.anchorId) return;
              if (typeof dist !== 'number' || dist <= 0) return;
              const i = Math.min(data.anchorId, remoteId);
              const j = Math.max(data.anchorId, remoteId);
              pairStats[i][j].add(dist);
            });
          });

          const done = [0, 1, 2, 3].every((i) =>
            [i + 1, i + 2, i + 3].filter((j) => j < 4).every((j) => pairStats[i][j].count >= minSamples)
          );
          if (done) break;

          await sleep(sampleIntervalMs);
        }

        lastDelays.forEach((d, id) => {
          prior[id] = d;
        });

        const measurements: Measurement[] = [];
        for (let i = 0; i < 4; i++) {
          for (let j = i + 1; j < 4; j++) {
            const s = pairStats[i][j];
            if (s.count === 0) continue;
            measurements.push({
              i,
              j,
              b: s.mean - targetsTicks[i][j],
              weight: s.count,
            });
          }
        }
        if (measurements.length < 3) {
          throw new Error('Insufficient inter-anchor measurements. Check UWB sync/TDMA.');
        }

        const solved = solveDelaysIrls(measurements, prior, priorSigmaTicks);
        const delays = solved.map((v) => Math.round(Math.min(65535, Math.max(0, v))));
        const error = computeError(pairStats as unknown as Stats[][], targetsM, delays);

        setResult({ delays, error });
        addLog(`  RMS error: ${error.rmsM.toFixed(3)} m (max ${error.maxAbsM.toFixed(3)} m)`);
        addLog(`  Delays: A0=${delays[0]} A1=${delays[1]} A2=${delays[2]} A3=${delays[3]}`);

        if (!dryRun) {
          addLog('  Applying delays...');
          for (const ep of endpoints) {
            const value = delays[ep.anchorId];
            await wsSend(ep.ip, Commands.writeParam('uwb', 'ADelay', value), timeoutMs);
            for (let k = 0; k < 10; k++) {
              const verify = await wsSendJson<TdoaDistancesResponse>(ep.ip, Commands.tdoaDistances(), timeoutMs);
              if (verify.antennaDelay === value) break;
              await sleep(100);
            }
          }
        }

        if (dryRun) break;

        if (error.rmsM <= toleranceM) {
          addLog(`Converged (RMS <= ${toleranceM} m)`);
          break;
        }
        if (prevRms !== null) {
          const improvement = prevRms - error.rmsM;
          if (improvement < minImprovementM) {
            addLog(`Stopping (improvement ${improvement.toFixed(3)} m < ${minImprovementM} m)`);
            break;
          }
        }
        prevRms = error.rmsM;

        for (let i = 0; i < 4; i++) prior[i] = delays[i];
      }

      setStatus(null);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Calibration failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={styles.calibrationPanel}>
      <div className={styles.field}>
        <label>Layout</label>
        <select
          value={layout}
          onChange={(e) => setLayout(Number(e.target.value) as LayoutId)}
          disabled={running}
        >
          <option value={0}>RECTANGULAR_A1X_A3Y</option>
          <option value={1}>RECTANGULAR_A1X_A2Y</option>
          <option value={2}>RECTANGULAR_A3X_A1Y</option>
          <option value={3}>RECTANGULAR_A2X_A3Y</option>
        </select>
      </div>
      <div className={styles.field}>
        <label>X distance (m)</label>
        <input value={x} onChange={(e) => setX(e.target.value)} disabled={running} />
      </div>
      <div className={styles.field}>
        <label>Y distance (m)</label>
        <input value={y} onChange={(e) => setY(e.target.value)} disabled={running} />
      </div>
      <div className={styles.field}>
        <label>Dry run</label>
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
          disabled={running}
          style={{ width: 'auto' }}
        />
      </div>

      <div className={styles.calibrationActions}>
        <button
          type="button"
          className={styles.addBtn}
          onClick={runCalibration}
          disabled={running || !endpoints}
        >
          {running ? 'Calibrating…' : 'Run Calibration'}
        </button>
      </div>

      {!endpoints && (
        <div style={{ color: 'var(--accent-danger)', fontSize: '0.85rem' }}>
          Need anchors 0..3 in <code>anchor_tdoa</code> mode online.
        </div>
      )}

      {status && (
        <div style={{ color: 'var(--accent-danger)', fontSize: '0.85rem' }}>{status}</div>
      )}

      {result && (
        <div className={styles.calibrationResults}>
          <div className={styles.calibrationSummary}>
            RMS: {result.error.rmsM.toFixed(3)} m · Max: {result.error.maxAbsM.toFixed(3)} m
          </div>
          <div className={styles.calibrationDelayGrid}>
            {result.delays.slice(0, 4).map((d, idx) => (
              <div key={idx} className={styles.calibrationDelayCard}>
                <div style={{ fontWeight: 700 }}>A{idx}</div>
                <div style={{ fontFamily: 'monospace' }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className={styles.logBox}>
          {log.join('\n')}
        </div>
      )}
    </div>
  );
}

