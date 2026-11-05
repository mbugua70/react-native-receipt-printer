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
  getImageCacheStats,
  ImageError,
  onBluetoothStateChange,
  onConnectionChange,
  prepareImage,
  print,
  ReceiptBuilder,
  useBluetoothContext,
  useBluetoothPermissionsContext,
  type MonochromeBitmap,
  type ReceiptData,
} from 'react-native-receipt-printer';

// A generic sample logo (transparent background — prints on white paper).
const SAMPLE_LOGO = require('../assets/sample-logo.png');

// A small public image, used to show remote (HTTPS) sources.
const REMOTE_IMAGE = 'https://reactnative.dev/img/tiny_logo.png';

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

// ─── Image printing demos ─────────────────────────────────────────────────────

type Paper = 58 | 80;

/** 1. Logo at the top of the receipt. */
function logoTopReceipt(paperWidth: Paper): ReceiptData {
  return new ReceiptBuilder({ paperWidth })
    .image(SAMPLE_LOGO, { width: paperWidth === 80 ? 360 : 240 })
    .header('ACME RIDES')
    .divider()
    .row('Waybill', 'NRB-0699')
    .row('Amount', 'KES 350')
    .qrCode('NRB-0699')
    .cut()
    .build();
}

/** 2. Images between sections — a remote image above the barcode. */
function imageBetweenReceipt(paperWidth: Paper): ReceiptData {
  return new ReceiptBuilder({ paperWidth })
    .header('ACME RIDES')
    .row('From', 'Nairobi')
    .row('To', 'Mombasa')
    .divider()
    .image(REMOTE_IMAGE, { width: 96, align: 'left' })
    .text('Parcel details', { bold: true })
    .row('Weight', '2.5 kg')
    .divider()
    .barcode('NRB-0699')
    .image(SAMPLE_LOGO, { width: 160, align: 'right', dither: 'atkinson' })
    .cut()
    .build();
}

/** 3. A receipt exactly as a backend might send it. */
const BACKEND_JSON = `{
  "paperWidth": 58,
  "lines": [
    { "type": "image", "source": "${REMOTE_IMAGE}", "width": 128, "align": "center" },
    { "type": "text", "content": "BACKEND RECEIPT", "align": "center", "bold": true },
    { "type": "text", "preText": "Ref", "content": "INV-1042" },
    { "type": "divider" },
    { "type": "cut" }
  ]
}`;

function ImagePrintSection() {
  const { isConnected } = useBluetoothContext();
  const [paper, setPaper] = useState<Paper>(58);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('Connect a printer, then try a demo.');

  const run = async (label: string, job: () => Promise<void>) => {
    setBusy(true);
    setResult(`${label}…`);
    const started = Date.now();
    try {
      await job();
      setResult(`${label}: done in ${Date.now() - started} ms`);
    } catch (err) {
      const e = err as Error;
      const code = err instanceof ImageError ? ` [${err.code}]` : '';
      setResult(`${label} failed${code}: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  /** 6. Prepare the logo once, then print it three times from the cache. */
  const printRepeated = async () => {
    const t0 = Date.now();
    const logo: MonochromeBitmap = await prepareImage(SAMPLE_LOGO, {
      width: 240,
      printableDots: paper === 80 ? 576 : 384,
    });
    const prepared = Date.now() - t0;
    for (let i = 1; i <= 3; i++) {
      await print(
        new ReceiptBuilder({ paperWidth: paper })
          .image(logo)
          .text(`Copy ${i} of 3`, { align: 'center' })
          .cut()
          .build()
      );
    }
    const stats = getImageCacheStats();
    setResult(
      `Logo prepared in ${prepared} ms, printed 3×. Cache: ${stats.entries} image(s), ${stats.bytes} bytes`
    );
  };

  const disabled = busy || !isConnected;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Image Printing</Text>
      <Text style={styles.subtitle}>
        Logos print in black and white. Paper: {paper}mm (
        {paper === 80 ? 576 : 384} dots).
      </Text>

      <View style={styles.buttonRow}>
        <Button
          title="58mm"
          onPress={() => setPaper(58)}
          color={paper === 58 ? '#007AFF' : '#aaa'}
        />
        <Button
          title="80mm"
          onPress={() => setPaper(80)}
          color={paper === 80 ? '#007AFF' : '#aaa'}
        />
      </View>

      <View style={styles.demoList}>
        <Button
          title="1. Logo at top"
          disabled={disabled}
          onPress={() => run('Logo at top', () => print(logoTopReceipt(paper)))}
        />
        <Button
          title="2. Images between sections"
          disabled={disabled}
          onPress={() =>
            run('Between sections', () => print(imageBetweenReceipt(paper)))
          }
        />
        <Button
          title="3. Backend JSON receipt"
          disabled={disabled}
          onPress={() =>
            run('Backend JSON', () =>
              print(JSON.parse(BACKEND_JSON) as ReceiptData)
            )
          }
        />
        <Button
          title="4. Same logo 3× (cached)"
          disabled={disabled}
          onPress={() => run('Repeated logo', printRepeated)}
        />
      </View>

      {busy && <ActivityIndicator style={styles.demoSpinner} />}
      <Text style={styles.demoResult}>{result}</Text>
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
            <ImagePrintSection />
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
  demoList: {
    marginTop: 12,
    gap: 8,
  },
  demoSpinner: {
    marginTop: 10,
  },
  demoResult: {
    marginTop: 10,
    fontSize: 12,
    color: '#555',
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
