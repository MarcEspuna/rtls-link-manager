import { DeviceConfig } from '@shared/types';
import { Commands } from '@shared/commands';

export function validateDynamicAnchorEnable(config: DeviceConfig): string | null {
  if ((config.uwb.use2DEstimator ?? 1) === 0) {
    const planeSeparation = Number(config.uwb.anchorPlaneSeparation);
    if (!Number.isFinite(planeSeparation) || planeSeparation <= 0) {
      return 'Set a positive plane separation before enabling dynamic 3D anchors';
    }
  }
  return null;
}

export function getDynamicAnchorEnableCommands(config: DeviceConfig): string[] {
  return [
    Commands.writeParam('uwb', 'anchorLayout', config.uwb.anchorLayout ?? 0),
    Commands.writeParam('uwb', 'anchorHeight', config.uwb.anchorHeight ?? 0),
    Commands.writeParam('uwb', 'anchorPlaneSeparation', config.uwb.anchorPlaneSeparation ?? 0),
    Commands.writeParam('uwb', 'distanceAvgSamples', config.uwb.distanceAvgSamples ?? 50),
    Commands.writeParam('uwb', 'anchorPosLocked', config.uwb.anchorPosLocked ?? 0),
    Commands.writeParam('uwb', 'dynamicAnchorPosEnabled', 1),
    Commands.writeParam('uwb', 'use2DEstimator', config.uwb.use2DEstimator ?? 1),
  ];
}
