import { useState } from 'react';
import { AnchorConfig } from '@shared/types';
import styles from './ConfigEditor.module.css';

interface AnchorListEditorProps {
  anchors: AnchorConfig[];
  onChange: (anchors: AnchorConfig[]) => void;
  onApply: (anchors: AnchorConfig[]) => void;
}

const MAX_ANCHORS = 6;

const safeParseFloat = (value: string, fallback: number = 0): number => {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
};

export function AnchorListEditor({ anchors, onChange, onApply }: AnchorListEditorProps) {
  const [idErrors, setIdErrors] = useState<Record<number, string>>({});

  const validateAnchorId = (value: string): string => {
    if (!value) return 'ID is required';
    if (!/^\d{1,2}$/.test(value)) return 'Use 1-2 digits (0-99)';
    return '';
  };

  const setIdError = (index: number, error: string) => {
    setIdErrors((prev) => {
      const next = { ...prev };
      if (error) {
        next[index] = error;
      } else {
        delete next[index];
      }
      return next;
    });
  };

  const handleUpdate = (index: number, field: keyof AnchorConfig, value: string | number) => {
    const newAnchors = [...anchors];
    newAnchors[index] = { ...newAnchors[index], [field]: value };
    onChange(newAnchors);
    if (field === 'id') {
      setIdError(index, validateAnchorId(String(value)));
    }
  };

  const handleBlur = (index: number, field: keyof AnchorConfig, rawValue: string) => {
    // For numeric fields, validate and use fallback if invalid
    if (field !== 'id') {
      const value = safeParseFloat(rawValue, anchors[index][field] as number);
      const newAnchors = [...anchors];
      newAnchors[index] = { ...newAnchors[index], [field]: value };
      onChange(newAnchors);
      onApply(newAnchors);
    } else {
      const error = validateAnchorId(rawValue);
      setIdError(index, error);
      if (error) return;
      const newAnchors = [...anchors];
      newAnchors[index] = { ...newAnchors[index], id: rawValue };
      onChange(newAnchors);
      onApply(newAnchors);
    }
  };

  const handleAdd = () => {
    if (anchors.length >= MAX_ANCHORS) return;
    const newAnchors = [...anchors, { id: '0', x: 0, y: 0, z: 0 }];
    onChange(newAnchors);
    onApply(newAnchors);
  };

  const handleRemove = (index: number) => {
    const newAnchors = anchors.filter((_, i) => i !== index);
    onChange(newAnchors);
    onApply(newAnchors);
  };

  const canAdd = anchors.length < MAX_ANCHORS;

  return (
    <div className={styles.anchorList}>
      <div className={styles.anchorHeader}>
        <label>ID</label>
        <label>X (m)</label>
        <label>Y (m)</label>
        <label>Z (m)</label>
        <label></label>
      </div>
      {anchors.map((anchor, index) => {
        const error = idErrors[index];
        return (
          <div key={index} className={styles.anchorRowGroup}>
            <div className={styles.anchorRow}>
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
                value={anchor.x}
                onChange={(e) => handleUpdate(index, 'x', safeParseFloat(e.target.value, anchor.x))}
                onBlur={(e) => handleBlur(index, 'x', e.target.value)}
                className={styles.anchorInput}
              />
              <input
                type="number"
                step="0.01"
                value={anchor.y}
                onChange={(e) => handleUpdate(index, 'y', safeParseFloat(e.target.value, anchor.y))}
                onBlur={(e) => handleBlur(index, 'y', e.target.value)}
                className={styles.anchorInput}
              />
              <input
                type="number"
                step="0.01"
                value={anchor.z}
                onChange={(e) => handleUpdate(index, 'z', safeParseFloat(e.target.value, anchor.z))}
                onBlur={(e) => handleBlur(index, 'z', e.target.value)}
                className={styles.anchorInput}
              />
              <button onClick={() => handleRemove(index)} className={styles.removeBtn} title="Remove Anchor">×</button>
            </div>
            {error && <div className={styles.anchorError}>{error}</div>}
          </div>
        );
      })}
      <button onClick={handleAdd} disabled={!canAdd} className={styles.addBtn}>
        {canAdd ? '+ Add Anchor' : `Maximum ${MAX_ANCHORS} anchors`}
      </button>
    </div>
  );
}
