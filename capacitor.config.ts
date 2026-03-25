import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'za.co.security.commandcenter',
  appName: 'Security Command Center',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false
  }
};

export default config;
