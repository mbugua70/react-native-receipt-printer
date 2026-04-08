# react-native-receipt-printer

A React Native library for printing thermal receipts over Bluetooth, with device connection management and dynamic receipt building.

---

## 🚧 Status

Work in progress. Currently building core features.

---

## ✨ Features (planned)

- Bluetooth device scanning
- Printer connection management
- ESC/POS command support
- Dynamic receipt builder (JSON → receipt)
- POS receipt templates
- Support for 58mm / 80mm printers

---

## 📦 Installation

Install the library along with its peer dependencies:

```bash
yarn add react-native-receipt-printer react-native-permissions react-native-bluetooth-classic
```

or with npm:

```bash
npm install react-native-receipt-printer react-native-permissions react-native-bluetooth-classic
```

### Why peer dependencies?

`react-native-permissions` and `react-native-bluetooth-classic` ship native code. To
prevent duplicate native modules — which crash React Native apps at build time — this
library declares them as **peer dependencies** instead of bundling its own copies. You
install them once in your app and the library uses your copy.

### Platform setup

After installing, follow each peer dependency's native setup guide:

- [`react-native-permissions` setup](https://github.com/zoontek/react-native-permissions#setup) — declare the Bluetooth and location permissions in `Info.plist` (iOS) and `AndroidManifest.xml` (Android)
- [`react-native-bluetooth-classic` setup](https://github.com/kenjdavidson/react-native-bluetooth-classic#installation) — Bluetooth usage description on iOS