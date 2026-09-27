import type { CapacitorConfig } from '@capacitor/cli'

// iOS shell for the PWA (DECISIONS D9; ARCHITECTURE §15; docs/IOS_ROUTE.md).
// There is deliberately no `server` block: the built web app ships inside the binary and is served
// from capacitor://localhost, never from a remote URL (App Review 2.5.2 and 4.2). The CSP in
// index.html ('self' only) therefore still blocks every third-party request inside WKWebView.
const config: CapacitorConfig = {
  appId: 'au.com.servecoach.app',
  appName: 'Serve Coach',
  webDir: 'dist',
  ios: {
    // The web layout handles safe areas itself (viewport-fit=cover).
    contentInset: 'never',
    // No WKAppBoundDomains list: the app only ever loads its own bundle.
    limitsNavigationsToAppBoundDomains: false,
    // Phone layout on every device, including iPad compatibility mode.
    preferredContentMode: 'mobile',
    // No link previews on long-press (evidence frames and buttons are long-pressable).
    allowsLinkPreview: false,
    // webContentsDebuggingEnabled is left unset: Capacitor enables the Safari inspector in debug
    // builds only and disables it in release builds (ARCHITECTURE §15.2 step 3).
  },
}

export default config
