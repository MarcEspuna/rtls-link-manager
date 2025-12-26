import { AnchorConfig } from '@shared/types';
import styles from './ConfigEditor.module.css';

interface AnchorListEditorProps {
  anchors: AnchorConfig[];
  onChange: (anchors: AnchorConfig[]) => void;
  onApply: (anchors: AnchorConfig[]) => void;
}

export function AnchorListEditor({ anchors, onChange, onApply }: AnchorListEditorProps) {
  const handleUpdate = (index: number, field: keyof AnchorConfig, value: string | number) => {
    const newAnchors = [...anchors];
    newAnchors[index] = { ...newAnchors[index], [field]: value };
    onChange(newAnchors);
  };

  const handleBlur = () => {
    onApply(anchors);
  };

  const handleAdd = () => {
    const newAnchors = [...anchors, { id: '0000', x: 0, y: 0, z: 0 }];
    onChange(newAnchors);
    onApply(newAnchors);
  };

  const handleRemove = (index: number) => {
    const newAnchors = anchors.filter((_, i) => i !== index);
    onChange(newAnchors);
    onApply(newAnchors);
  };

  return (
    <div className={styles.anchorList}>
      <div className={styles.anchorHeader}>
        <label>ID</label>
        <label>X (m)</label>
        <label>Y (m)</label>
        <label>Z (m)</label>
        <label></label>
      </div>
      {anchors.map((anchor, index) => (
        <div key={index} className={styles.anchorRow}>
          <input
            type="text"
            value={anchor.id}
            onChange={(e) => handleUpdate(index, 'id', e.target.value)}
            onBlur={handleBlur}
            placeholder="ID"
            className={styles.anchorInputSmall}
          />
          <input
            type="number"
            step="0.01"
            value={anchor.x}
            onChange={(e) => handleUpdate(index, 'x', parseFloat(e.target.value))}
            onBlur={handleBlur}
            className={styles.anchorInput}
          />
          <input
            type="number"
            step="0.01"
            value={anchor.y}
            onChange={(e) => handleUpdate(index, 'y', parseFloat(e.target.value))}
            onBlur={handleBlur}
            className={styles.anchorInput}
          />
          <input
            type="number"
            step="0.01"
            value={anchor.z}
            onChange={(e) => handleUpdate(index, 'z', parseFloat(e.target.value))}
            onBlur={handleBlur}
            className={styles.anchorInput}
          />
          <button onClick={() => handleRemove(index)} className={styles.removeBtn} title="Remove Anchor">×</button>
        </div>
      ))}
      <button onClick={handleAdd} className={styles.addBtn}>+ Add Anchor</button>
    </div>
  );
}
