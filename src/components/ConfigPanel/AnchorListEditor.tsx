import { AnchorConfig } from '@shared/types';
import { MAX_CONFIGURABLE_ANCHORS } from '@shared/anchors';
import styles from './AnchorListEditor.module.css';

interface AnchorListEditorProps {
  anchors: AnchorConfig[];
  onChange: (anchors: AnchorConfig[]) => void;
  onApply: (anchors: AnchorConfig[]) => void;
  /** Optional: bitmask of locked anchor positions (for dynamic positioning) */
  anchorPosLocked?: number;
  /** Optional: callback when lock state changes */
  onLockChange?: (newLockedMask: number) => void;
}

const safeParseFloat = (value: string, fallback: number = 0): number => {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
};

const numberInputValue = (value: number): number | string => Number.isFinite(value) ? value : '';

export function AnchorListEditor({ anchors, onChange, onApply, anchorPosLocked, onLockChange }: AnchorListEditorProps) {
  // Check if lock functionality is enabled
  const showLockButtons = anchorPosLocked !== undefined && onLockChange !== undefined;

  const isAnchorLocked = (anchorIndex: number): boolean => {
    if (anchorPosLocked === undefined) return false;
    return (anchorPosLocked & (1 << anchorIndex)) !== 0;
  };

  const handleLockToggle = (anchorIndex: number) => {
    if (anchorPosLocked === undefined || !onLockChange) return;
    const newMask = anchorPosLocked ^ (1 << anchorIndex);  // Toggle the bit
    onLockChange(newMask);
  };

  const validateAnchorId = (value: string, index: number, nextAnchors: AnchorConfig[]): string => {
    if (!value) return 'ID is required';
    if (!/^\d+$/.test(value)) return 'Use anchor IDs 0-7';
    const id = Number(value);
    if (!Number.isInteger(id) || id < 0 || id >= MAX_CONFIGURABLE_ANCHORS) return 'Use anchor IDs 0-7';
    if (nextAnchors.some((anchor, anchorIndex) => anchorIndex !== index && Number(anchor.id) === id)) {
      return 'Anchor ID must be unique';
    }
    return '';
  };

  const getIdErrors = (nextAnchors: AnchorConfig[]): Record<number, string> => {
    const errors = nextAnchors.reduce<Record<number, string>>((acc, anchor, index) => {
      const error = validateAnchorId(String(anchor.id), index, nextAnchors);
      if (error) {
        acc[index] = error;
      }
      return acc;
    }, {});

    if (Object.keys(errors).length > 0) {
      return errors;
    }

    const ids = new Set(nextAnchors.map((anchor) => Number(anchor.id)));
    for (let expected = 0; expected < nextAnchors.length; expected++) {
      if (!ids.has(expected)) {
        nextAnchors.forEach((_, index) => {
          errors[index] = 'Use contiguous IDs from 0';
        });
        break;
      }
    }

    return errors;
  };

  const hasIdErrors = (nextAnchors: AnchorConfig[]): boolean => Object.keys(getIdErrors(nextAnchors)).length > 0;

  const handleUpdate = (index: number, field: keyof AnchorConfig, value: string | number) => {
    const newAnchors = [...anchors];
    newAnchors[index] = { ...newAnchors[index], [field]: value };
    onChange(newAnchors);
  };

  const handleBlur = (index: number, field: keyof AnchorConfig, rawValue: string) => {
    // For numeric fields, validate and use fallback if invalid
    if (field !== 'id') {
      const value = safeParseFloat(rawValue, anchors[index][field] as number);
      const newAnchors = [...anchors];
      newAnchors[index] = { ...newAnchors[index], [field]: value };
      onChange(newAnchors);
      if (!hasIdErrors(newAnchors)) {
        onApply(newAnchors);
      }
    } else {
      const newAnchors = [...anchors];
      const normalizedId = String(Number(rawValue));
      newAnchors[index] = { ...newAnchors[index], id: normalizedId };
      if (Object.keys(getIdErrors(newAnchors)).length > 0) return;
      onChange(newAnchors);
      onApply(newAnchors);
    }
  };

  const handleAdd = () => {
    if (anchors.length >= MAX_CONFIGURABLE_ANCHORS) return;
    if (hasIdErrors(anchors)) return;
    const usedIds = new Set(
      anchors
        .map((anchor) => Number(anchor.id))
        .filter((id) => Number.isInteger(id) && id >= 0 && id < MAX_CONFIGURABLE_ANCHORS)
        .map(String)
    );
    let nextId = 0;
    while (usedIds.has(String(nextId)) && nextId < MAX_CONFIGURABLE_ANCHORS) {
      nextId++;
    }
    if (nextId >= MAX_CONFIGURABLE_ANCHORS) return;
    const newAnchors = [...anchors, { id: String(nextId), x: 0, y: 0, z: 0 }];
    onChange(newAnchors);
    onApply(newAnchors);
  };

  const handleRemove = (index: number) => {
    const newAnchors = anchors.filter((_, i) => i !== index);
    onChange(newAnchors);
    if (!hasIdErrors(newAnchors)) {
      onApply(newAnchors);
    }
  };

  const idErrors = getIdErrors(anchors);
  const canAdd = anchors.length < MAX_CONFIGURABLE_ANCHORS && Object.keys(idErrors).length === 0;
  const addButtonLabel = anchors.length >= MAX_CONFIGURABLE_ANCHORS
    ? `Maximum ${MAX_CONFIGURABLE_ANCHORS} anchors`
    : canAdd ? '+ Add Anchor' : 'Fix anchor IDs';

  const headerClass = showLockButtons ? styles.anchorHeaderWithLock : styles.anchorHeader;
  const rowClass = showLockButtons ? styles.anchorRowWithLock : styles.anchorRow;

  return (
    <div className={styles.anchorList}>
      <div className={headerClass}>
        <label>ID</label>
        <label>X (m)</label>
        <label>Y (m)</label>
        <label>Z (m)</label>
        {showLockButtons && <label title="Lock position">Lock</label>}
        <label></label>
      </div>
      {anchors.map((anchor, index) => {
        const error = idErrors[index];
        const locked = isAnchorLocked(index);
        return (
          <div key={index} className={styles.anchorRowGroup}>
            <div className={rowClass}>
              <input
                type="text"
                value={anchor.id}
                onChange={(e) => handleUpdate(index, 'id', e.target.value)}
                onBlur={(e) => handleBlur(index, 'id', e.target.value)}
                placeholder="ID"
                className={`${styles.anchorInputSmall} ${error ? styles.inputError : ''}`}
              />
              <input
                type="number"
                step="0.01"
                value={numberInputValue(anchor.x)}
                onChange={(e) => handleUpdate(index, 'x', safeParseFloat(e.target.value, anchor.x))}
                onBlur={(e) => handleBlur(index, 'x', e.target.value)}
                className={styles.anchorInput}
              />
              <input
                type="number"
                step="0.01"
                value={numberInputValue(anchor.y)}
                onChange={(e) => handleUpdate(index, 'y', safeParseFloat(e.target.value, anchor.y))}
                onBlur={(e) => handleBlur(index, 'y', e.target.value)}
                className={styles.anchorInput}
              />
              <input
                type="number"
                step="0.01"
                value={numberInputValue(anchor.z)}
                onChange={(e) => handleUpdate(index, 'z', safeParseFloat(e.target.value, anchor.z))}
                onBlur={(e) => handleBlur(index, 'z', e.target.value)}
                className={styles.anchorInput}
              />
              {showLockButtons && (
                <button
                  onClick={() => handleLockToggle(index)}
                  className={`${styles.lockBtn} ${locked ? styles.lockBtnLocked : ''}`}
                  title={locked ? 'Unlock anchor position' : 'Lock anchor position'}
                >
                  {locked ? '🔒' : '🔓'}
                </button>
              )}
              <button onClick={() => handleRemove(index)} className={styles.removeBtn} title="Remove Anchor">×</button>
            </div>
            {error && <div className={styles.anchorError}>{error}</div>}
          </div>
        );
      })}
      <button onClick={handleAdd} disabled={!canAdd} className={styles.addBtn}>
        {addButtonLabel}
      </button>
    </div>
  );
}
