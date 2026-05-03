1. Minimum API Compatibility

Baseline: The application must maintain full compatibility with Android 11 (API level 30).

Prohibited APIs: Strictly avoid using Java/Kotlin APIs introduced in later versions (e.g., API 33/35) without proper SDK version checks.

❌ DO NOT use List.removeLast() or List.removeFirst() (Requires API 35).

✅ DO use List.removeAt(list.size - 1) or List.remove(list.size - 1).

2. Dependency & Patch Management

Native Audit: Before adding any React Native library, verify its minimum supported Android version.

Patch-Package Scrutiny: When applying patches to node_modules (e.g., react-native-screens), manually scan all modified .java or .kt files for incompatible syntax to prevent runtime crashes on older devices.

3. Asset & Versioning Integrity

Asset Enforcement: The App Logo must always reference the actual image file at src/assets/logo.png. Never attempt to recreate the logo using primitive UI components (Views/Text).

Single Source of Truth (SSOT): Displayed version numbers must be dynamically pulled from package.json. Hardcoding version strings in UI components is strictly forbidden.

4. Pre-release Verification

Mandatory Testing: Prior to any release or merge into main, a smoke test must be conducted on an Android 11 (API 30) emulator or physical device.