import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  checkBluetoothPermissions,
  requestBluetoothPermissions,
  type BluetoothPermissionResult,
} from '../bluetooth/BluetoothPermissions';

/**
 * High-level summary of the current Bluetooth permission state.
 *
 * - `unknown`  — no check has been performed yet
 * - `granted`  — every required permission is granted
 * - `denied`   — at least one permission is denied (user can still be prompted)
 * - `blocked`  — at least one permission is permanently denied (must open system settings)
 */
export type BluetoothPermissionStatus =
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'blocked';

export type UseBluetoothPermissionsOptions = {
  /**
   * If `true`, the hook calls `requestBluetoothPermissions()` once on mount.
   * Defaults to `false` so the consumer can decide when to prompt.
   */
  requestOnMount?: boolean;
  /**
   * If `true`, the hook silently re-checks permissions whenever the app
   * returns to the foreground. Defaults to `true`.
   */
  recheckOnForeground?: boolean;
};

export type UseBluetoothPermissionsReturn = {
  /** Coarse, easy-to-render status. */
  status: BluetoothPermissionStatus;
  /** Convenience boolean: every required permission is granted. */
  granted: boolean;
  /** Convenience boolean: at least one permission is permanently denied. */
  blocked: boolean;
  /** True while a request or check is in flight. */
  loading: boolean;
  /** Raw last result from the underlying check/request, or `null`. */
  lastResult: BluetoothPermissionResult | null;
  /** Prompt the user (shows the OS dialog if needed). */
  request: () => Promise<BluetoothPermissionResult>;
  /** Silently re-check current permissions (no dialog). */
  check: () => Promise<BluetoothPermissionResult>;
};

function deriveStatus(
  result: BluetoothPermissionResult
): BluetoothPermissionStatus {
  if (result.granted) return 'granted';
  if (result.blocked) return 'blocked';
  return 'denied';
}

/**
 * React hook that manages Bluetooth permission state.
 *
 * Wraps `requestBluetoothPermissions` / `checkBluetoothPermissions` from the
 * core API and exposes a small reactive state machine for use inside React
 * components.
 *
 * @example
 * ```tsx
 * const { status, granted, request } = useBluetoothPermissions({
 *   requestOnMount: true,
 * });
 *
 * if (status === 'blocked') return <OpenSettingsButton />;
 * if (!granted) return <Button title="Allow Bluetooth" onPress={request} />;
 * return <PrinterScreen />;
 * ```
 */
export function useBluetoothPermissions(
  options: UseBluetoothPermissionsOptions = {}
): UseBluetoothPermissionsReturn {
  const { requestOnMount = false, recheckOnForeground = true } = options;

  const [status, setStatus] = useState<BluetoothPermissionStatus>('unknown');
  const [lastResult, setLastResult] =
    useState<BluetoothPermissionResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Track mount state so async callbacks don't update state after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const apply = useCallback((result: BluetoothPermissionResult) => {
    if (!mountedRef.current) return;
    setLastResult(result);
    setStatus(deriveStatus(result));
  }, []);

  const request = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestBluetoothPermissions();
      apply(result);
      return result;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [apply]);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const result = await checkBluetoothPermissions();
      apply(result);
      return result;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [apply]);

  // Optional: prompt on mount.
  useEffect(() => {
    if (requestOnMount) {
      request().catch(() => {
        // Errors are surfaced via lastResult / status; nothing to do here.
      });
    }
    // Intentionally only on mount — we don't want to re-prompt if `request`
    // identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optional: silent re-check whenever the app returns to the foreground.
  useEffect(() => {
    if (!recheckOnForeground) return;

    const onChange = (next: AppStateStatus) => {
      if (next === 'active') {
        check().catch(() => {
          // Errors are surfaced via lastResult / status.
        });
      }
    };

    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [recheckOnForeground, check]);

  return {
    status,
    granted: status === 'granted',
    blocked: status === 'blocked',
    loading,
    lastResult,
    request,
    check,
  };
}
