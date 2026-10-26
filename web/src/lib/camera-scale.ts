// The camera's own scale learnt by a one-time calibration (see calibrateCamera in box-measure.ts),
// kept per camera in this browser. Shared by the measuring tab and the photo tab.
const scaleKey = (deviceId: string) => `gv-camera-scale:${deviceId || "default"}`;

export function readScale(deviceId: string): number {
  try {
    return Number(localStorage.getItem(scaleKey(deviceId))) || 0;
  } catch {
    return 0;
  }
}

export function writeScale(deviceId: string, value: number) {
  try {
    if (value) localStorage.setItem(scaleKey(deviceId), String(value));
    else localStorage.removeItem(scaleKey(deviceId));
  } catch {
    // calibration is then asked for again next time
  }
}
