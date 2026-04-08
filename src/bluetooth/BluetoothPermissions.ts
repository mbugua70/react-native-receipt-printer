import { Platform } from 'react-native';
import {
  PERMISSIONS,
  RESULTS,
  check,
  checkMultiple,
  request,
  requestMultiple,
  type Permission,
  type PermissionStatus,
} from 'react-native-permissions';

/**
 * Result of a permission check or request.
 *
 * - `granted`: every required permission is granted
 * - `blocked`: at least one permission was permanently denied — the user must
 *   open the system settings to grant it (a dialog will not appear again)
 * - `denied`: the list of permissions that are not currently granted, useful
 *   for showing the user exactly what is missing
 */
export type BluetoothPermissionResult = {
  granted: boolean;
  blocked: boolean;
  denied: Permission[];
};

/**
 * Returns the list of native permissions required for Bluetooth on the
 * current platform / OS version.
 *
 * Android 12 (API 31) split Bluetooth into runtime permissions:
 *   - BLUETOOTH_SCAN     — discover nearby devices
 *   - BLUETOOTH_CONNECT  — pair / connect to a device
 *
 * Older Android versions use the legacy install-time BLUETOOTH /
 * BLUETOOTH_ADMIN permissions, but still require ACCESS_FINE_LOCATION at
 * runtime in order to perform a Bluetooth scan.
 *
 * iOS only needs a single BLUETOOTH permission.
 */
function getRequiredPermissions(): Permission[] {
  if (Platform.OS === 'ios') {
    return [PERMISSIONS.IOS.BLUETOOTH];
  }

  if (Platform.OS === 'android') {
    // Platform.Version is a number on Android (the API level)
    const apiLevel =
      typeof Platform.Version === 'number'
        ? Platform.Version
        : parseInt(String(Platform.Version), 10);

    if (apiLevel >= 31) {
      return [
        PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
        PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
        PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
      ];
    }

    return [PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION];
  }

  return [];
}

function buildResult(
  permissions: Permission[],
  statuses: Record<string, PermissionStatus>
): BluetoothPermissionResult {
  const denied: Permission[] = [];
  let blocked = false;

  for (const permission of permissions) {
    const status = statuses[permission];
    if (status !== RESULTS.GRANTED) {
      denied.push(permission);
    }
    if (status === RESULTS.BLOCKED) {
      blocked = true;
    }
  }

  return {
    granted: denied.length === 0,
    blocked,
    denied,
  };
}

/**
 * Request Bluetooth permissions from the user.
 *
 * **Shows the native OS permission dialog** if any permission is not yet
 * granted. Use this on app boot or in response to a user action like
 * tapping a "Connect printer" button.
 *
 * Will not re-prompt for permissions the user has permanently denied
 * (`blocked`) — in that case the consumer should direct the user to the
 * system settings.
 */
export async function requestBluetoothPermissions(): Promise<BluetoothPermissionResult> {
  const permissions = getRequiredPermissions();
  if (permissions.length === 0) {
    return { granted: false, blocked: false, denied: [] };
  }

  if (permissions.length === 1) {
    const status = await request(permissions[0]!);
    return buildResult(permissions, { [permissions[0]!]: status });
  }

  const statuses = await requestMultiple(permissions);
  return buildResult(permissions, statuses);
}

/**
 * Silently check the current Bluetooth permission state.
 *
 * **Does not show any dialog.** Safe to call from polling loops, app
 * foreground listeners, pull-to-refresh handlers, etc.
 */
export async function checkBluetoothPermissions(): Promise<BluetoothPermissionResult> {
  const permissions = getRequiredPermissions();
  if (permissions.length === 0) {
    return { granted: false, blocked: false, denied: [] };
  }

  if (permissions.length === 1) {
    const status = await check(permissions[0]!);
    return buildResult(permissions, { [permissions[0]!]: status });
  }

  const statuses = await checkMultiple(permissions);
  return buildResult(permissions, statuses);
}
