import Foundation
import Security

/**
 What the extension needs to reach the backend, and where it comes from.

 Two values, from two different places, for two different reasons:

   • The endpoint is PUBLISHED BY THE APP into App Group UserDefaults on every
     launch (see PlanNplateShareTargetModule.configureShareImport). It is not
     compiled in, because the URL differs between .env and .env.production and a
     constant here would silently point a TestFlight build at the wrong project.
     Nothing is lost by requiring the app to have run once: the import token is
     minted on the same launch, so a device with no endpoint has no credential
     either, and both resolve to the same safe answer — queue the link.

   • The token lives in the KEYCHAIN, in an access group the app and the
     extension share. It is never written to the App Group container, which
     carries only the link (see PendingShareQueue).

 Every accessor returns nil rather than throwing or guessing. A missing value
 means the extension does what it did before this feature existed: queue the
 link and let the app import it.
 */
enum ShareImportConfig {
  /// Must match `ios.entitlements` in app.config.js and expo-target.config.js.
  static let appGroupIdentifier = "group.com.vibecode.planplate.8ctfq2"

  /// Written by the app. Keys are mirrored in PlanNplateShareTargetModule.swift.
  private static let endpointKey = "plannplate.share.import-endpoint"

  /**
   Keychain item name. Mirrored in src/lib/share/import-token.ts (SHARE_TOKEN_KEY).

   The access group is read from the endpoint payload rather than hard-coded,
   because it must carry the app's TEAM PREFIX and a bare bundle id silently
   matches nothing.
   */
  private static let tokenKey = "plannplate.share.import-token"
  private static let accessGroupKey = "plannplate.share.keychain-access-group"

  /// `https://<project>.supabase.co/functions/v1/share-import`, or nil.
  static func importEndpoint() -> URL? {
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier),
          let raw = defaults.string(forKey: endpointKey),
          let url = URL(string: raw),
          url.scheme?.lowercased() == "https" else {
      return nil
    }
    return url
  }

  /**
   The share-import token, read out of the shared Keychain.

   The query below has to match the one `expo-secure-store` writes with, exactly,
   or `SecItemCopyMatching` returns `errSecItemNotFound` and the extension falls
   back forever with nothing to show for it. As of expo-secure-store 15:

     kSecClass        kSecClassGenericPassword
     kSecAttrService  "app:no-auth"   — "app" is the default service, and the
                                        suffix comes from `requireAuthentication`
                                        being false. See SecureStoreModule.query.
     kSecAttrAccount  the key, as UTF-8 Data (NOT a String)
     kSecAttrGeneric  the same Data

   The legacy service name without the suffix is tried second, mirroring
   expo-secure-store's own read fallback, so an item written by an older version
   is still found.
   */
  static func importToken() -> String? {
    guard let accessGroup = keychainAccessGroup() else { return nil }
    for service in ["app:no-auth", "app"] {
      if let token = readKeychain(service: service, accessGroup: accessGroup) {
        return token
      }
    }
    return nil
  }

  private static func keychainAccessGroup() -> String? {
    UserDefaults(suiteName: appGroupIdentifier)?.string(forKey: accessGroupKey)
  }

  private static func readKeychain(service: String, accessGroup: String) -> String? {
    let encodedKey = Data(tokenKey.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrGeneric as String: encodedKey,
      kSecAttrAccount as String: encodedKey,
      kSecAttrAccessGroup as String: accessGroup,
      kSecMatchLimit as String: kSecMatchLimitOne,
      kSecReturnData as String: true,
    ]

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess,
          let data = item as? Data,
          let token = String(data: data, encoding: .utf8),
          !token.isEmpty else {
      return nil
    }
    return token
  }
}
