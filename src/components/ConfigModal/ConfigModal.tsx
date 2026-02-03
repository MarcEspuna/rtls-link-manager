import { useState, useEffect } from 'react';
import { Device, DeviceConfig } from '@shared/types';
import { Commands } from '@shared/commands';
import { flatToAnchors, getAnchorWriteCommands, normalizeUwbShortAddr } from '@shared/anchors';
import { useDeviceCommand } from '../../hooks/useDeviceCommand';
import { GeneralSection } from './sections/GeneralSection';
import { UWBSection } from './sections/UWBSection';
import { AnchorListSection } from './sections/AnchorListSection';
import { AntennaCalibrationSection } from './sections/AntennaCalibrationSection';
import { DynamicAnchorsSection } from './sections/DynamicAnchorsSection';
import { WiFiSection } from './sections/WiFiSection';
import { LoggingSection } from './sections/LoggingSection';
import { AdvancedSection } from './sections/AdvancedSection';
import { FirmwareUpdate } from '../FirmwareUpdate';
import { LogTerminal } from '../ExpertMode/LogTerminal';
import styles from './ConfigModal.module.css';

type SectionId = 'general' | 'uwb' | 'anchors' | 'antennaCal' | 'dynamic' | 'wifi' | 'logging' | 'advanced' | 'firmware';

interface ConfigModalProps {
  device: Device;
  allDevices: Device[];
  onClose: () => void;
  isExpertMode?: boolean;
}

interface NavItem {
  id: SectionId;
  label: string;
  expertOnly?: boolean;
  condition?: (config: DeviceConfig | null, device: Device) => boolean;
}

const navItems: NavItem[] = [
  { id: 'general', label: 'General' },
  { id: 'uwb', label: 'UWB Mode' },
  { id: 'anchors', label: 'Anchor List' },
  { id: 'antennaCal', label: 'Antenna Calibration', condition: (config) => config?.uwb.mode === 3 },
  { id: 'dynamic', label: 'Dynamic Anchors', condition: (config) =>
    config?.uwb.mode === 4 },
  { id: 'wifi', label: 'WiFi', expertOnly: true },
  { id: 'logging', label: 'Logging', expertOnly: true },
  { id: 'advanced', label: 'Advanced', expertOnly: true },
  { id: 'firmware', label: 'Firmware' },
];

export function ConfigModal({ device, allDevices, onClose, isExpertMode = false }: ConfigModalProps) {
  const { sendCommand, sendCommands, loading, close } = useDeviceCommand(device.ip, { mode: 'persistent' });
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const [savedConfigs, setSavedConfigs] = useState<string[]>([]);
  const [activeConfig, setActiveConfig] = useState<string | null>(null);
  const [previewingConfig, setPreviewingConfig] = useState<string | null>(null);
  const [anchorBusy, setAnchorBusy] = useState(false);
  const [anchorError, setAnchorError] = useState<string | null>(null);
  const [showLogTerminal, setShowLogTerminal] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>('general');

  const findCommandError = (responses: string[] | null): string | null => {
    if (!responses) return 'No response from device';
    for (const response of responses) {
      if (/error|fail|invalid|not found/i.test(response)) {
        return response;
      }
    }
    return null;
  };

  useEffect(() => {
    loadConfig();
    loadSavedConfigs();
    return () => {
      close();
    };
  }, [device.ip, close]);

  const transformConfigResult = (result: any): DeviceConfig => {
    const uwb = result.uwb || {};
    const anchors = flatToAnchors(uwb, uwb.anchorCount || 0);
    return {
      ...result,
      uwb: {
        ...uwb,
        devShortAddr: normalizeUwbShortAddr(uwb.devShortAddr),
        anchors,
      }
    };
  };

  const loadConfig = async () => {
    const result = await sendCommand<any>(Commands.backupConfig());
    if (result) {
      setConfig(transformConfigResult(result));
      setPreviewingConfig(null);
    }
  };

  const loadSavedConfigs = async () => {
    const result = await sendCommand<{ activeConfig?: string; configs: { name: string }[] }>(
      Commands.listConfigs()
    );
    if (result) {
      setSavedConfigs(result.configs.map(c => c.name));
      setActiveConfig(result.activeConfig || null);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    try {
      const anchorCommands = getAnchorWriteCommands(config.uwb.anchors || [])
        .map((cmd) => Commands.writeParam('uwb', cmd.name, cmd.value));
      const batch = [...anchorCommands, Commands.saveConfig()];
      const result = await sendCommands(batch);
      const errorMessage = findCommandError(result);
      if (errorMessage) {
        throw new Error(errorMessage);
      }
      alert('Configuration saved to device');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save configuration');
    }
  };

  const handleSaveAs = async () => {
    const name = prompt('Configuration name:');
    if (name) {
      try {
        if (config) {
          const anchorCommands = getAnchorWriteCommands(config.uwb.anchors || [])
            .map((cmd) => Commands.writeParam('uwb', cmd.name, cmd.value));
          const batch = [...anchorCommands, Commands.saveConfigAs(name)];
          const result = await sendCommands(batch);
          const errorMessage = findCommandError(result);
          if (errorMessage) {
            throw new Error(errorMessage);
          }
        } else {
          await sendCommand(Commands.saveConfigAs(name));
        }
        await loadSavedConfigs();
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Failed to save configuration');
      }
    }
  };

  const handlePreviewConfig = async (name: string) => {
    const result = await sendCommand<any>(Commands.readConfigNamed(name));
    if (result && !result.error) {
      setConfig(transformConfigResult(result));
      setPreviewingConfig(name);
    } else {
      alert(result?.error || 'Failed to load configuration preview');
    }
  };

  const handleActivate = async () => {
    if (!previewingConfig) return;
    try {
      const result = await sendCommand<{ success: boolean; error?: string }>(
        Commands.loadConfigNamed(previewingConfig)
      );
      if (result?.success) {
        await loadSavedConfigs();
        setPreviewingConfig(null);
        alert(`Configuration "${previewingConfig}" activated successfully`);
      } else {
        throw new Error(result?.error || 'Failed to activate configuration');
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to activate configuration');
    }
  };

  const handleApply = async (group: string, name: string, value: any) => {
    await sendCommand(Commands.writeParam(group, name, value));
  };

  const handleApplyBatch = async (commands: string[]) => {
    const result = await sendCommands(commands);
    const errorMessage = findCommandError(result);
    if (errorMessage) {
      throw new Error(errorMessage);
    }
  };

  const handleChange = (group: keyof DeviceConfig, name: string, value: any) => {
    if (!config) return;
    const newConfig = { ...config, [group]: { ...config[group], [name]: value } };
    setConfig(newConfig);
  };

  const visibleNavItems = navItems.filter(item => {
    if (item.expertOnly && !isExpertMode) return false;
    if (item.condition && !item.condition(config, device)) return false;
    return true;
  });

  const renderSection = () => {
    if (!config) {
      return (
        <div className={styles.loadingState}>
          {loading ? 'Loading configuration...' : 'Failed to load configuration'}
        </div>
      );
    }

    switch (activeSection) {
      case 'general':
        return (
          <GeneralSection
            config={config}
            device={device}
            savedConfigs={savedConfigs}
            activeConfig={activeConfig}
            previewingConfig={previewingConfig}
            onPreviewConfig={handlePreviewConfig}
            onActivate={handleActivate}
            onChange={handleChange}
            onApply={handleApply}
            loading={loading}
          />
        );
      case 'uwb':
        return (
          <UWBSection
            config={config}
            onChange={handleChange}
            onApply={handleApply}
            isExpertMode={isExpertMode}
          />
        );
      case 'anchors':
        return (
          <AnchorListSection
            config={config}
            setConfig={setConfig}
            onApply={handleApply}
            onApplyBatch={handleApplyBatch}
            onBusyChange={setAnchorBusy}
            onError={setAnchorError}
            anchorError={anchorError}
          />
        );
      case 'antennaCal':
        return (
          <AntennaCalibrationSection
            devices={allDevices}
          />
        );
      case 'dynamic':
        return (
          <DynamicAnchorsSection
            config={config}
            device={device}
            onChange={handleChange}
            onApply={handleApply}
          />
        );
      case 'wifi':
        return (
          <WiFiSection
            config={config}
            onChange={handleChange}
            onApply={handleApply}
          />
        );
      case 'logging':
        return (
          <LoggingSection
            config={config}
            device={device}
            onChange={handleChange}
            onApply={handleApply}
            onOpenLogTerminal={() => setShowLogTerminal(true)}
          />
        );
      case 'advanced':
        return (
          <AdvancedSection
            config={config}
            onChange={handleChange}
            onApply={handleApply}
          />
        );
      case 'firmware':
        return <FirmwareUpdate device={device} />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2>Device Configuration</h2>
            <span className={styles.deviceInfo}>{device.id} ({device.ip})</span>
          </div>
          <div className={styles.headerRight}>
            <button className={styles.btnPrimary} onClick={handleSave} disabled={loading || anchorBusy}>
              Save
            </button>
            <button className={styles.btnSecondary} onClick={handleSaveAs} disabled={loading || anchorBusy}>
              Save As...
            </button>
            <button className={styles.btnSecondary} onClick={loadConfig} disabled={loading || anchorBusy}>
              Reload
            </button>
            <button className={styles.closeBtn} onClick={onClose}>&times;</button>
          </div>
        </div>

        {previewingConfig && (
          <div className={styles.previewBanner}>
            <span>Previewing: <strong>{previewingConfig}</strong></span>
            {previewingConfig !== activeConfig && (
              <button
                className={styles.btnActivate}
                onClick={handleActivate}
                disabled={loading}
              >
                Activate
              </button>
            )}
          </div>
        )}

        <div className={styles.body}>
          <nav className={styles.sidebar}>
            {visibleNavItems.map(item => (
              <button
                key={item.id}
                className={`${styles.navItem} ${activeSection === item.id ? styles.navItemActive : ''}`}
                onClick={() => setActiveSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <main className={styles.content}>
            {renderSection()}
          </main>
        </div>
      </div>

      {showLogTerminal && (
        <LogTerminal
          deviceIp={device.ip}
          onClose={() => setShowLogTerminal(false)}
        />
      )}
    </>
  );
}
