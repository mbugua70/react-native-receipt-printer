import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  BluetoothPermissionProvider,
  BluetoothProvider,
  onBluetoothStateChange,
  onConnectionChange,
  useBluetoothContext,
  useBluetoothPermissionsContext,
} from 'react-native-receipt-printer';

// ─── Event log entry type ─────────────────────────────────────────────────────

type LogEntry = {
  id: number;
  time: string;
  message: string;
  color: string;
};

let logId = 0;

function makeLog(message: string, color: string): LogEntry {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = now.getHours();
  const m = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  const time = `${h}:${m}:${s}`;
  return { id: logId++, time, message, color };
}

// ─── Permission section ───────────────────────────────────────────────────────

function PermissionSection() {
  const { status, granted, blocked, loading, request, check } =
    useBluetoothPermissionsContext();

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Permissions</Text>

      <Row label="Status" value={status} />
      <Row label="Granted" value={String(granted)} />
      <Row label="Blocked" value={String(blocked)} />
      <Row label="Loading" value={String(loading)} />

      <View style={styles.buttonRow}>
        <Button title="Request" onPress={() => request()} />
        <Button title="Check (silent)" onPress={() => check()} />
      </View>
    </View>
  );
}

// ─── Bluetooth state section ──────────────────────────────────────────────────

function BluetoothSection() {
  const {
    isReady,
    readyError,
    isConnected,
    connectedDevice,
    isScanning,
    isConnecting,
    bondedDevices,
    discoveredDevices,
    checkReady,
    loadBondedDevices,
    scan,
    cancelScan,
    connect,
    disconnect,
  } = useBluetoothContext();

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Bluetooth State</Text>

      <Row label="Ready" value={String(isReady)} />
      <Row label="Error" value={readyError ?? 'none'} />
      <Row label="Connected" value={String(isConnected)} />
      <Row label="Device" value={connectedDevice?.name ?? 'none'} />
      <Row label="Scanning" value={String(isScanning)} />
      <Row label="Connecting" value={String(isConnecting)} />

      <View style={styles.buttonRow}>
        <Button title="Check Ready" onPress={() => checkReady()} />
        <Button title="Load Bonded" onPress={() => loadBondedDevices()} />
      </View>

      <View style={styles.buttonRow}>
        <Button
          title={isScanning ? 'Stop Scan' : 'Start Scan'}
          onPress={() => (isScanning ? cancelScan() : scan())}
        />
        {isConnected && (
          <Button title="Disconnect" onPress={() => disconnect()} />
        )}
      </View>

      {/* Bonded devices */}
      {bondedDevices.length > 0 && (
        <View style={styles.deviceList}>
          <Text style={styles.listTitle}>
            Bonded Devices ({bondedDevices.length})
          </Text>
          {bondedDevices.map((device) => (
            <TouchableOpacity
              key={device.address}
              style={styles.deviceItem}
              onPress={() => connect(device.address)}
            >
              <Text style={styles.deviceName}>{device.name}</Text>
              <Text style={styles.deviceAddress}>{device.address}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Discovered devices */}
      {isScanning && (
        <View style={styles.deviceList}>
          <View style={styles.scanningRow}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.listTitle}>
              Scanning... ({discoveredDevices.length} found)
            </Text>
          </View>
          {discoveredDevices.map((device) => (
            <TouchableOpacity
              key={device.address}
              style={styles.deviceItem}
              onPress={() => connect(device.address)}
            >
              <Text style={styles.deviceName}>{device.name}</Text>
              <Text style={styles.deviceAddress}>{device.address}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Live event log ───────────────────────────────────────────────────────────

function EventLog() {
  const [logs, setLogs] = useState<LogEntry[]>([
    makeLog('App started — waiting for events...', '#888'),
  ]);

  const addLog = (message: string, color: string) => {
    setLogs((prev) => [makeLog(message, color), ...prev].slice(0, 20));
  };

  useEffect(() => {
    // Listen to connection changes
    const unsubConnection = onConnectionChange((event) => {
      if (event.type === 'connected') {
        addLog(`Connected → ${event.device.name}`, '#2ecc71');
      } else {
        addLog(`Disconnected → ${event.device.name}`, '#e74c3c');
      }
    });

    // Listen to BT radio state changes
    const unsubState = onBluetoothStateChange((event) => {
      if (event.enabled) {
        addLog('Bluetooth turned ON', '#2ecc71');
      } else {
        addLog('Bluetooth turned OFF', '#e74c3c');
      }
    });

    return () => {
      unsubConnection();
      unsubState();
    };
  }, []);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Live Event Log</Text>
      <Text style={styles.subtitle}>
        Toggle Bluetooth or connect/disconnect a device to see events here.
      </Text>

      <FlatList
        data={logs}
        keyExtractor={(item) => String(item.id)}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.logEntry}>
            <Text style={styles.logTime}>{item.time}</Text>
            <Text style={[styles.logMessage, { color: item.color }]}>
              {item.message}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

// ─── Helper component ─────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}:</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BluetoothPermissionProvider>
      <BluetoothProvider>
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.heading}>Receipt Printer — Live Demo</Text>
            <PermissionSection />
            <BluetoothSection />
            <EventLog />
          </ScrollView>
        </View>
      </BluetoothProvider>
    </BluetoothPermissionProvider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scroll: {
    padding: 16,
    paddingBottom: 48,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
    color: '#111',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
    color: '#111',
  },
  subtitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowLabel: {
    fontSize: 13,
    color: '#555',
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
    gap: 8,
  },
  deviceList: {
    marginTop: 12,
  },
  listTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
    marginLeft: 6,
  },
  deviceItem: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },
  deviceAddress: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  scanningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  logEntry: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  logTime: {
    fontSize: 11,
    color: '#aaa',
    width: 60,
  },
  logMessage: {
    fontSize: 12,
    flex: 1,
    fontWeight: '500',
  },
});
