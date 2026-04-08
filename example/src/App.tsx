import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BluetoothPermissionProvider,
  checkBluetoothPermissions,
  requestBluetoothPermissions,
  useBluetoothPermissions,
  useBluetoothPermissionsContext,
  type BluetoothPermissionResult,
} from 'react-native-receipt-printer';

// ─── Layer 1: Raw functions ───────────────────────────────────────────────
function Layer1Demo() {
  const [result, setResult] = useState<BluetoothPermissionResult | null>(null);

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Layer 1 — Raw Functions</Text>
      <Text style={styles.subtitle}>
        Direct calls to requestBluetoothPermissions / checkBluetoothPermissions.
      </Text>

      <View style={styles.buttonRow}>
        <Button
          title="Request (dialog)"
          onPress={async () => setResult(await requestBluetoothPermissions())}
        />
        <Button
          title="Check (silent)"
          onPress={async () => setResult(await checkBluetoothPermissions())}
        />
      </View>

      <Text style={styles.json}>{JSON.stringify(result, null, 2)}</Text>
    </View>
  );
}

// ─── Layer 2: Hook ────────────────────────────────────────────────────────
function Layer2Demo() {
  const { status, granted, blocked, loading, lastResult, request, check } =
    useBluetoothPermissions();

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Layer 2 — useBluetoothPermissions Hook</Text>
      <Text style={styles.subtitle}>
        Local hook state — independent from the provider.
      </Text>

      <Text>Status: {status}</Text>
      <Text>Granted: {String(granted)}</Text>
      <Text>Blocked: {String(blocked)}</Text>
      <Text>Loading: {String(loading)}</Text>

      <View style={styles.buttonRow}>
        <Button title="Request" onPress={() => request()} />
        <Button title="Check" onPress={() => check()} />
      </View>

      <Text style={styles.json}>{JSON.stringify(lastResult, null, 2)}</Text>
    </View>
  );
}

// ─── Layer 3: Context ─────────────────────────────────────────────────────
function Layer3Demo() {
  const { status, granted, blocked, loading, lastResult, request, check } =
    useBluetoothPermissionsContext();

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Layer 3 — Context (Shared State)</Text>
      <Text style={styles.subtitle}>
        Reads from BluetoothPermissionProvider — shared across components.
      </Text>

      <Text>Status: {status}</Text>
      <Text>Granted: {String(granted)}</Text>
      <Text>Blocked: {String(blocked)}</Text>
      <Text>Loading: {String(loading)}</Text>

      <View style={styles.buttonRow}>
        <Button title="Request" onPress={() => request()} />
        <Button title="Check" onPress={() => check()} />
      </View>

      <Text style={styles.json}>{JSON.stringify(lastResult, null, 2)}</Text>
    </View>
  );
}

// A second consumer of the context — proves state is shared.
function Layer3Mirror() {
  const { status, granted } = useBluetoothPermissionsContext();
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Layer 3 — Mirror</Text>
      <Text style={styles.subtitle}>
        Another component reading the same provider. Always matches Layer 3.
      </Text>
      <Text>Status: {status}</Text>
      <Text>Granted: {String(granted)}</Text>
    </View>
  );
}

export default function App() {
  return (
    <BluetoothPermissionProvider>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.heading}>Bluetooth Permissions Demo</Text>
          <Layer1Demo />
          <Layer2Demo />
          <Layer3Demo />
          <Layer3Mirror />
        </ScrollView>
      </View>
    </BluetoothPermissionProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scroll: {
    padding: 16,
    paddingBottom: 48,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fafafa',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
    gap: 8,
  },
  json: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#333',
    marginTop: 8,
  },
});
