import { useMemo, useState } from 'react';
import { Device, AnchorLayout } from '@shared/types';
import { LayoutSelector } from '../../SystemConfig';
import {
  CalibrationIteration,
  onAntennaCalibrationEvent,
  runAntennaCalibration,
} from '../../../lib/tauri-api';
import styles from '../ConfigModal.module.css';

const layoutToBackend = (layout: AnchorLayout) => {
  switch (layout) {
    case AnchorLayout.RECTANGULAR_A1X_A2Y:
      return 'rectangular-a1x-a2y' as const;
    case AnchorLayout.RECTANGULAR_A3X_A1Y:
      return 'rectangular-a3x-a1y' as const;
    case AnchorLayout.RECTANGULAR_A2X_A3Y:
      return 'rectangular-a2x-a3y' as const;
    case AnchorLayout.RECTANGULAR_A1X_A3Y:
    default:
      return 'rectangular-a1x-a3y' as const;
  }
};

export function AntennaCalibrationSection({ devices }: { devices: Device[] }) {
  const [anchorCount, setAnchorCount] = useState<4 | 8>(4);
  const [layout, setLayout] = useState<AnchorLayout>(AnchorLayout.RECTANGULAR_A1X_A3Y);
  const [x, setX] = useState('5.2');
  const [y, setY] = useState('2.3');
  const [planeSeparation, setPlaneSeparation] = useState('2.0');
  const [tolerance, setTolerance] = useState('0.15');
  const [maxDeltaTicks, setMaxDeltaTicks] = useState('500');
  const [minSamples, setMinSamples] = useState('30');
  const [sampleDurationS, setSampleDurationS] = useState('8');
  const [dryRun, setDryRun] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<CalibrationIteration | null>(null);

  const endpoints = useMemo(() => {
    const byId = new Map<number, Device>();
    for (const device of devices) {
      if (device.role !== 'anchor_tdoa') continue;
      const id = Number.parseInt(String(device.uwbShort ?? '').trim(), 10);
      if (Number.isFinite(id)) {
        byId.set(id, device);
      }
    }

    const anchors: Array<{ anchorId: number; ip: string }> = [];
    const requiredIds = Array.from({ length: anchorCount }, (_, id) => id);
    for (const id of requiredIds) {
      const device = byId.get(id);
      if (!device) return null;
      anchors.push({ anchorId: id, ip: device.ip });
    }
    return anchors;
  }, [devices, anchorCount]);

  const addLog = (line: string) => setLog((prev) => [...prev.slice(-200), line]);

  const runCalibration = async () => {
    setResult(null);
    setLog([]);
    setStatus(null);

    if (!endpoints) {
      setStatus('Need 4 anchors in anchor_tdoa role with IDs 0..3 discovered on the network.');
      return;
    }

    const xM = Number.parseFloat(x);
    const yM = Number.parseFloat(y);
    if (!Number.isFinite(xM) || !Number.isFinite(yM) || xM <= 0 || yM <= 0) {
      setStatus('Invalid X/Y distances. Enter positive meters.');
      return;
    }
    const planeSeparationM = Number.parseFloat(planeSeparation);
    if (anchorCount === 8 && (!Number.isFinite(planeSeparationM) || planeSeparationM <= 0)) {
      setStatus('Invalid plane separation. Enter a positive distance for 8-anchor calibration.');
      return;
    }

    const unlisten = await onAntennaCalibrationEvent((event) => {
      if (event.type === 'log') {
        addLog(event.message);
      } else if (event.type === 'iteration') {
        setResult({
          iteration: event.iteration,
          delays: event.delays,
          error: event.error,
        });
      } else if (event.type === 'complete') {
        setResult(event.result.finalResult ?? null);
      }
    });

    setRunning(true);
    try {
      const run = await runAntennaCalibration({
        anchorCount,
        x: xM,
        y: yM,
        planeSeparation: anchorCount === 8 ? planeSeparationM : undefined,
        layout: layoutToBackend(layout),
        ips: endpoints.map((endpoint) => endpoint.ip),
        discoveryDuration: 3,
        minSamples: Math.max(1, Number.parseInt(minSamples, 10) || 1),
        sampleDuration: Math.max(1, Number.parseInt(sampleDurationS, 10) || 8),
        sampleIntervalMs: 250,
        maxIters: 3,
        toleranceM: Math.max(0.01, Number.parseFloat(tolerance) || 0.15),
        minImprovementM: 0.005,
        priorSigmaTicks: 100,
        maxDeltaTicks: Math.max(1, Number.parseInt(maxDeltaTicks, 10) || 1),
        dryRun,
        timeoutMs: 5000,
      });
      setResult(run.finalResult ?? null);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Calibration failed');
    } finally {
      unlisten();
      setRunning(false);
    }
  };

  return (
    <div>
      <div className={styles.section}>
        <h3>Antenna Calibration (TDoA Anchors)</h3>
        <p>
          Uses inter-anchor ToF (<code>tdoa-distances</code>) and externally measured X/Y distances to solve per-anchor
          antenna delays (<code>uwb.ADelay</code>) and apply them live.
        </p>

        {!endpoints && (
          <div className={styles.fieldError}>
            Need anchors 0..{anchorCount - 1} in <code>anchor_tdoa</code> role online.
          </div>
        )}

        <div className={styles.field}>
          <label>Anchor Count</label>
          <select
            value={anchorCount}
            onChange={(e) => setAnchorCount(Number(e.target.value) === 8 ? 8 : 4)}
            disabled={running}
          >
            <option value={4}>4 anchors</option>
            <option value={8}>8 anchors</option>
          </select>
        </div>

        <div className={styles.field}>
          <label>Layout</label>
          <LayoutSelector
            value={layout}
            onChange={(v) => setLayout(v)}
            disabled={running}
          />
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>X distance (m)</label>
            <input value={x} onChange={(e) => setX(e.target.value)} disabled={running} />
          </div>
          <div className={styles.field}>
            <label>Y distance (m)</label>
            <input value={y} onChange={(e) => setY(e.target.value)} disabled={running} />
          </div>
          {anchorCount === 8 && (
            <div className={styles.field}>
              <label>Plane separation (m)</label>
              <input value={planeSeparation} onChange={(e) => setPlaneSeparation(e.target.value)} disabled={running} />
            </div>
          )}
          <div className={styles.field}>
            <label>Tolerance (m)</label>
            <input type="number" step="0.01" value={tolerance} onChange={(e) => setTolerance(e.target.value)} disabled={running} />
          </div>
          <div className={styles.field}>
            <label>Sample duration (s)</label>
            <input type="number" step="1" value={sampleDurationS} onChange={(e) => setSampleDurationS(e.target.value)} disabled={running} />
          </div>
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>Min samples / pair</label>
            <input type="number" step="1" value={minSamples} onChange={(e) => setMinSamples(e.target.value)} disabled={running} />
          </div>
          <div className={styles.field}>
            <label>Max delta (ticks)</label>
            <input type="number" step="10" value={maxDeltaTicks} onChange={(e) => setMaxDeltaTicks(e.target.value)} disabled={running} />
          </div>
          <div className={styles.field}>
            <label>Dry run</label>
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              disabled={running}
              style={{ width: 'auto', alignSelf: 'flex-start' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => { setLog([]); setStatus(null); setResult(null); }}
            disabled={running}
          >
            Clear
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={runCalibration}
            disabled={running || !endpoints}
          >
            {running ? 'Calibrating...' : 'Run Calibration'}
          </button>
        </div>

        {status && (
          <div className={styles.fieldError} style={{ marginTop: 12 }}>
            {status}
          </div>
        )}
      </div>

      {result && (
        <div className={styles.section}>
          <h3>Result</h3>
          <div className={styles.calibrationSummary}>
            RMS: {result.error.rmsM.toFixed(3)} m - Max: {result.error.maxAbsM.toFixed(3)} m
          </div>
          <div className={styles.calibrationDelayGrid}>
            {result.delays.map((d, idx) => (
              <div key={idx} className={styles.calibrationDelayCard}>
                <div style={{ fontWeight: 700 }}>A{idx}</div>
                <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace' }}>
                  {d}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className={styles.section}>
          <h3>Log</h3>
          <div className={styles.logBox}>
            {log.join('\n')}
          </div>
        </div>
      )}
    </div>
  );
}
