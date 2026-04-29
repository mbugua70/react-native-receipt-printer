import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  connect as btConnect,
  disconnect as btDisconnect,
  ensureReady,
  findDevice,
  getBondedDevices,
  getConnectedDevice,
  isBluetoothEnabled,
  startScan,
  stopScan,
  type BluetoothDevice,
  type BluetoothReadyResult,
  type DeviceQuery,
  type ScanOptions,
} from '../bluetooth/BluetoothManager';
import { checkBluetoothPermissions } from '../bluetooth/BluetoothPermissions';
import {
  onConnectionChange,
  onBluetoothStateChange,
} from '../bluetooth/BluetoothEvents';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BluetoothReadyError =
  | 'permission_denied'
  | 'permission_blocked'
  | 'bluetooth_disabled'
  | 'unsupported';

export type UseBluetoothReturn = {
  // ── State ──────────────────────────────────────────────────────────────────

  /** `true` once `ensureReady()` has passed — safe to scan and connect. */
  isReady: boolean;

  /**
   * Why `ensureReady()` failed, or `null` when ready / not yet checked.
   * Use this to show the correct UI:
   * - `permission_denied`  → "Grant Permission" button
   * - `permission_blocked` → "Open Settings" button
   * - `bluetooth_disabled` → "Turn on Bluetooth" button
   */
  readyError: BluetoothReadyError | null;

  /** Devices already paired with this phone. Populated after `loadBondedDevices()`. */
  bondedDevices: BluetoothDevice[];

  /** Devices found during an active scan. Resets to `[]` on each new scan. */
  discoveredDevices: BluetoothDevice[];

  /** The currently connected device, or `null`. */
  connectedDevice: BluetoothDevice | null;

  /** `true` if a device is currently connected. */
  isConnected: boolean;

  /** `true` while a scan is in progress. */
  isScanning: boolean;

  /** `true` while a connection attempt is in progress. */
  isConnecting: boolean;

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Check permissions + Bluetooth radio. Sets `isReady` and `readyError`. */
  checkReady: () => Promise<BluetoothReadyResult>;

  /** Load the list of already-paired devices into `bondedDevices`. */
  loadBondedDevices: () => Promise<void>;

  /**
   * Start scanning for nearby unpaired devices.
   * Each found device is appended to `discoveredDevices`.
   * Sets `isScanning` to `true` while running.
   */
  scan: (options?: ScanOptions) => Promise<void>;

  /** Cancel an active scan early. */
  cancelScan: () => Promise<void>;

  /**
   * Find a specific device by address or name.
   * Searches bonded devices first, then scans as a fallback.
   */
  find: (query: DeviceQuery) => Promise<BluetoothDevice | null>;

  /**
   * Connect to a device by its hardware address.
   * Sets `connectedDevice` and `isConnected` on success.
   * Call `checkReady()` before connecting.
   *
   * @throws if the connection fails
   */
  connect: (address: string) => Promise<void>;

  /** Disconnect the current device. Clears `connectedDevice`. */
  disconnect: () => Promise<void>;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * React hook that exposes the full Bluetooth lifecycle — readiness, device
 * discovery, and connection — as reactive state.
 *
 * @example
 * ```tsx
 * const {
 *   isReady, readyError,
 *   bondedDevices, discoveredDevices,
 *   connectedDevice, isScanning, isConnecting,
 *   checkReady, loadBondedDevices, scan, connect, disconnect,
 * } = useBluetooth();
 *
 * useEffect(() => {
 *   checkReady();
 * }, []);
 * ```
 */
export function useBluetooth(): UseBluetoothReturn {
  const [isReady, setIsReady] = useState(false);
  const [readyError, setReadyError] = useState<BluetoothReadyError | null>(
    null
  );
  const [bondedDevices, setBondedDevices] = useState<BluetoothDevice[]>([]);
  const [discoveredDevices, setDiscoveredDevices] = useState<BluetoothDevice[]>(
    []
  );
  const [connectedDevice, setConnectedDevice] =
    useState<BluetoothDevice | null>(() => getConnectedDevice());
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Guard against concurrent ensureReady() calls triggered by rapid BT toggles
  const isCheckingReadyRef = useRef(false);

  // ── Mount-time silent check ─────────────────────────────────────────────────
  // Hydrate isReady on mount — onBluetoothStateChange only fires on changes,
  // so if BT is already on when the hook mounts, isReady would stay false forever.
  useEffect(() => {
    async function initialCheck() {
      if (isCheckingReadyRef.current) return;
      isCheckingReadyRef.current = true;
      try {
        const permResult = await checkBluetoothPermissions();
        if (!mountedRef.current) return;
        if (!permResult.granted) {
          setIsReady(false);
          setReadyError(
            permResult.blocked ? 'permission_blocked' : 'permission_denied'
          );
          return;
        }
        const enabled = await isBluetoothEnabled();
        if (!mountedRef.current) return;
        setIsReady(enabled);
        setReadyError(enabled ? null : 'bluetooth_disabled');
      } catch {
      } finally {
        isCheckingReadyRef.current = false;
      }
    }
    initialCheck();
  }, []);

  // ── Event listeners ─────────────────────────────────────────────────────────

  useEffect(() => {
    // When a device connects or disconnects outside our control — e.g. the
    // printer powers off — update connectedDevice state immediately.
    const unsubConnection = onConnectionChange((event) => {
      if (!mountedRef.current) return;
      if (event.type === 'connected') {
        setConnectedDevice(event.device);
      } else {
        setConnectedDevice(null);
      }
    });

    // When the BT radio changes state — update readiness accordingly.
    const unsubState = onBluetoothStateChange(async (event) => {
      if (!mountedRef.current) return;

      if (!event.enabled) {
        // BT turned off — mark not ready, clear connection
        setIsReady(false);
        setReadyError('bluetooth_disabled');
        setConnectedDevice(null);
      } else {
        // event.enabled = true already tells us BT is on — no need to recheck radio.
        // Silently verify permissions only (no dialog) before marking ready.
        if (isCheckingReadyRef.current) return;
        isCheckingReadyRef.current = true;
        try {
          const permResult = await checkBluetoothPermissions();
          if (!mountedRef.current) return;
          if (permResult.granted) {
            setIsReady(true);
            setReadyError(null);
          } else {
            setIsReady(false);
            setReadyError(
              permResult.blocked ? 'permission_blocked' : 'permission_denied'
            );
          }
        } catch {
        } finally {
          isCheckingReadyRef.current = false;
        }
      }
    });

    return () => {
      unsubConnection();
      unsubState();
    };
  }, []);

  // ── Foreground recheck ──────────────────────────────────────────────────────
  // When the user goes to Settings to toggle BT and comes back, the
  // onBluetoothStateChange event may have fired while the app was backgrounded
  // and the state update was lost. Re-check silently on foreground resume.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active' || !mountedRef.current) return;
      if (isCheckingReadyRef.current) return;
      isCheckingReadyRef.current = true;
      try {
        const permResult = await checkBluetoothPermissions();
        if (!mountedRef.current) return;
        if (!permResult.granted) {
          setIsReady(false);
          setReadyError(
            permResult.blocked ? 'permission_blocked' : 'permission_denied'
          );
          return;
        }
        const enabled = await isBluetoothEnabled();
        if (!mountedRef.current) return;
        if (enabled) {
          setIsReady(true);
          setReadyError(null);
        } else {
          setIsReady(false);
          setReadyError('bluetooth_disabled');
        }
      } catch {
      } finally {
        isCheckingReadyRef.current = false;
      }
    });

    return () => sub.remove();
  }, []);

  // ── checkReady ──────────────────────────────────────────────────────────────

  const checkReady = useCallback(async (): Promise<BluetoothReadyResult> => {
    const result = await ensureReady();
    if (!mountedRef.current) return result;

    if (result.ready) {
      setIsReady(true);
      setReadyError(null);
    } else {
      setIsReady(false);
      setReadyError(result.reason as BluetoothReadyError);
    }

    return result;
  }, []);

  // ── loadBondedDevices ───────────────────────────────────────────────────────

  const loadBondedDevices = useCallback(async (): Promise<void> => {
    const devices = await getBondedDevices();
    if (mountedRef.current) setBondedDevices(devices);
  }, []);

  // ── scan ────────────────────────────────────────────────────────────────────

  const scan = useCallback(async (options?: ScanOptions): Promise<void> => {
    if (!mountedRef.current) return;

    setDiscoveredDevices([]);
    setIsScanning(true);

    try {
      await startScan((device) => {
        if (!mountedRef.current) return;
        setDiscoveredDevices((prev) => {
          // avoid duplicates — same address can be reported more than once
          const exists = prev.some((d) => d?.address === device?.address);
          return exists ? prev : [...prev, device];
        });
      }, options);
    } finally {
      if (mountedRef.current) setIsScanning(false);
    }
  }, []);

  // ── cancelScan ──────────────────────────────────────────────────────────────

  const cancelScan = useCallback(async (): Promise<void> => {
    await stopScan();
    if (mountedRef.current) setIsScanning(false);
  }, []);

  // ── find ────────────────────────────────────────────────────────────────────

  const find = useCallback(
    async (query: DeviceQuery): Promise<BluetoothDevice | null> => {
      return findDevice(query);
    },
    []
  );

  // ── connect ─────────────────────────────────────────────────────────────────

  const connect = useCallback(async (address: string): Promise<void> => {
    if (!mountedRef.current) return;
    setIsConnecting(true);

    try {
      await btConnect(address);
      if (mountedRef.current) setConnectedDevice(getConnectedDevice());
    } finally {
      if (mountedRef.current) setIsConnecting(false);
    }
  }, []);

  // ── disconnect ──────────────────────────────────────────────────────────────

  const disconnect = useCallback(async (): Promise<void> => {
    await btDisconnect();
    if (mountedRef.current) setConnectedDevice(null);
  }, []);

  return {
    isReady,
    readyError,
    bondedDevices,
    discoveredDevices,
    connectedDevice,
    isConnected: connectedDevice !== null,
    isScanning,
    isConnecting,
    checkReady,
    loadBondedDevices,
    scan,
    cancelScan,
    find,
    connect,
    disconnect,
  };
}
