jest.mock('react-native-bluetooth-classic', () => ({
  __esModule: true,
  default: {
    connectToDevice: jest.fn(),
    isDeviceConnected: jest.fn(),
    onDeviceDisconnected: jest.fn(() => ({ remove: jest.fn() })),
    onStateChanged: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('../bluetooth/BluetoothPermissions', () => ({
  requestBluetoothPermissions: jest.fn(),
}));

import RNBluetoothClassic from 'react-native-bluetooth-classic';
import {
  connect,
  getConnectedDevice,
  isConnected,
} from '../bluetooth/BluetoothManager';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRINTER = 'AA:BB:CC:DD:EE:FF';
const OTHER = '11:22:33:44:55:66';

const native = jest.mocked(RNBluetoothClassic);

// The native event listeners BluetoothManager registered on import, so the
// tests can fire "disconnected" / "Bluetooth off" events by hand.
const fireDisconnected = (address: string) =>
  (native.onDeviceDisconnected.mock.calls[0]![0] as (e: unknown) => void)({
    device: { address },
  });
const fireStateChanged = (enabled: boolean) =>
  (native.onStateChanged.mock.calls[0]![0] as (e: unknown) => void)({
    enabled,
  });

function device(address: string) {
  return { address, disconnect: jest.fn().mockResolvedValue(true) } as never;
}

async function connectTo(address: string) {
  native.connectToDevice.mockResolvedValueOnce(device(address));
  await connect(address);
}

// Let the async isDeviceConnected check inside the listener finish.
const flush = () =>
  new Promise<void>((resolve) => setImmediate(() => resolve()));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('connected device tracking', () => {
  beforeEach(() => native.isDeviceConnected.mockReset());

  it('forgets the printer when Android says it dropped', async () => {
    await connectTo(PRINTER);
    native.isDeviceConnected.mockResolvedValue(false);

    fireDisconnected(PRINTER);
    await flush();

    expect(isConnected()).toBe(false);
    expect(getConnectedDevice()).toBeNull();
  });

  it('keeps the printer when the native side still has it connected', async () => {
    // e.g. a late event for the socket closed by a quick reconnect
    await connectTo(PRINTER);
    native.isDeviceConnected.mockResolvedValue(true);

    fireDisconnected(PRINTER);
    await flush();

    expect(isConnected()).toBe(true);
  });

  it('ignores a disconnect for a different device', async () => {
    await connectTo(PRINTER);

    fireDisconnected(OTHER);
    await flush();

    expect(native.isDeviceConnected).not.toHaveBeenCalled();
    expect(getConnectedDevice()?.address).toBe(PRINTER);
  });

  it('keeps a printer connected to while the check was running', async () => {
    await connectTo(PRINTER);
    let finishCheck: (v: boolean) => void = () => {};
    native.isDeviceConnected.mockReturnValue(
      new Promise((resolve) => (finishCheck = resolve))
    );

    fireDisconnected(PRINTER);
    await connectTo(OTHER);
    finishCheck(false);
    await flush();

    expect(getConnectedDevice()?.address).toBe(OTHER);
  });

  it('treats a failed check as disconnected', async () => {
    await connectTo(PRINTER);
    native.isDeviceConnected.mockRejectedValue(new Error('Bluetooth off'));

    fireDisconnected(PRINTER);
    await flush();

    expect(isConnected()).toBe(false);
  });

  it('forgets the printer when Bluetooth is turned off', async () => {
    await connectTo(PRINTER);

    fireStateChanged(false);

    expect(isConnected()).toBe(false);
  });
});
