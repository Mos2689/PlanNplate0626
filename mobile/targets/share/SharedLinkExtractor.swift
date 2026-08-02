import Foundation

/**
 A small, deliberately conservative mirror of `src/lib/share/url-ingest.ts`.

 This is NOT the source of truth — the TypeScript layer re-runs every one of
 these checks when the app picks the payload up, and it is the one that decides
 what gets imported. What this buys is a fast, honest rejection *inside the
 share sheet*: telling someone "this link isn't supported yet" while they are
 still looking at the post is far better than accepting it, sending them away,
 and failing silently the next time they open the app.

 It also means a `javascript:` or `http://127.0.0.1/` URL never reaches the
 shared container at all.

 Keep in step with url-ingest.ts. Where they differ, the TypeScript wins.
 */
enum SharedLinkExtractor {
  enum Outcome {
    case ok(url: URL)
    case noURL
    case unsupported
  }

  /// Query parameters stripped before the link is stored, mirroring
  /// TRACKING_PARAMS in url-ingest.ts. The TypeScript pass strips the full set;
  /// this covers the ones that would otherwise show up in the preview line.
  private static let trackingParams: Set<String> = [
    "fbclid", "gclid", "igshid", "igsh", "si", "ttclid", "epik",
    "mibextid", "ref_src", "ref_url", "is_from_webapp", "sender_device",
  ]

  static func extract(from text: String) -> Outcome {
    let candidates = urlCandidates(in: text)
    if candidates.isEmpty {
      return containsForeignScheme(text) ? .unsupported : .noURL
    }

    var sawUnsupported = false
    var accepted: [URL] = []

    for candidate in candidates {
      guard let scheme = candidate.scheme?.lowercased(),
            scheme == "http" || scheme == "https" else {
        sawUnsupported = true
        continue
      }
      guard let host = candidate.host, !isBlockedHost(host) else {
        sawUnsupported = true
        continue
      }
      accepted.append(candidate)
    }

    guard let chosen = select(from: accepted) else {
      return sawUnsupported ? .unsupported : .noURL
    }
    return .ok(url: stripTracking(from: chosen))
  }

  // MARK: - Candidate discovery

  private static func urlCandidates(in text: String) -> [URL] {
    guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
      return []
    }
    let range = NSRange(text.startIndex..<text.endIndex, in: text)
    let matches = detector.matches(in: text, options: [], range: range)
    // A caption crammed with links is not a recipe; stop rather than scan on.
    return matches.prefix(20).compactMap { $0.url }
  }

  private static func containsForeignScheme(_ text: String) -> Bool {
    let lowered = text.lowercased()
    return ["javascript:", "file:", "data:", "content:", "ftp:", "intent:"]
      .contains { lowered.contains($0) }
  }

  /**
   Prefer a link on a source the importer recognises; otherwise take the last
   one. Captions end with the permalink far more often than they begin with it,
   and a creator's link-in-bio is usually the first URL in the text.
   */
  private static func select(from urls: [URL]) -> URL? {
    let recognised = ["instagram.com", "instagr.am", "tiktok.com", "youtube.com",
                      "youtu.be", "pinterest.com", "pin.it", "facebook.com", "fb.watch"]
    if let match = urls.first(where: { url in
      guard let host = url.host?.lowercased() else { return false }
      return recognised.contains { host == $0 || host.hasSuffix(".\($0)") }
    }) {
      return match
    }
    return urls.last
  }

  // MARK: - Guards

  /// Loopback, private, link-local (which covers the cloud metadata address)
  /// and single-label hostnames. A recipe never lives on any of them.
  static func isBlockedHost(_ rawHost: String) -> Bool {
    let host = rawHost.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))

    if host == "localhost" || host.hasSuffix(".localhost") { return true }
    if host.hasSuffix(".local") || host.hasSuffix(".internal") { return true }
    if host == "::" || host == "::1" || host.hasPrefix("::ffff:") { return true }
    if host.range(of: "^fe[89ab][0-9a-f]:", options: [.regularExpression]) != nil { return true }
    if host.range(of: "^f[cd][0-9a-f]{2}:", options: [.regularExpression]) != nil { return true }

    let octets = host.split(separator: ".")
    if octets.count == 4, octets.allSatisfy({ Int($0) != nil }) {
      let values = octets.compactMap { Int($0) }
      guard values.count == 4 else { return true }
      let (a, b) = (values[0], values[1])
      if a == 0 || a == 10 || a == 127 { return true }
      if a == 169 && b == 254 { return true }
      if a == 172 && (16...31).contains(b) { return true }
      if a == 192 && b == 168 { return true }
      if a == 100 && (64...127).contains(b) { return true }
      if a >= 224 { return true }
      return false
    }

    return !host.contains(".")
  }

  private static func stripTracking(from url: URL) -> URL {
    guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false),
          let items = components.queryItems else {
      return url
    }
    let kept = items.filter { item in
      let name = item.name.lowercased()
      return !trackingParams.contains(name)
        && !name.hasPrefix("utm_")
        && !name.hasPrefix("_nc_")
    }
    components.queryItems = kept.isEmpty ? nil : kept
    return components.url ?? url
  }

  /// The label shown under the title — the domain, never the full link. A path
  /// can carry a private post id, and this sheet is often shown over someone
  /// else's screen.
  static func displayHost(for url: URL) -> String {
    guard let host = url.host?.lowercased() else { return "" }
    return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
  }

  /**
   Decode the HTML entities that appear inside meta-tag attribute values.

   Mirrors `decodeHtmlEntities` in src/lib/recipeImport.ts. Without it an
   Instagram title renders as
   `Muhammad Qasim on Instagram: &quot;Comment &#x201c;AUDIENCE&#x201d;…`
   — the raw source, in a sheet that is meant to look considered.

   Numeric forms are handled generically because titles routinely carry curly
   quotes, em dashes and emoji as `&#8217;` / `&#x2019;`.
   */
  static func decodingHTMLEntities(_ input: String) -> String {
    guard input.contains("&") else { return input }

    var result = input
    let named: [String: String] = [
      "&amp;": "&", "&quot;": "\"", "&apos;": "'", "&lt;": "<", "&gt;": ">",
      "&nbsp;": " ", "&hellip;": "…", "&mdash;": "—", "&ndash;": "–",
      "&lsquo;": "\u{2018}", "&rsquo;": "\u{2019}",
      "&ldquo;": "\u{201C}", "&rdquo;": "\u{201D}",
    ]
    for (entity, replacement) in named {
      result = result.replacingOccurrences(of: entity, with: replacement, options: .caseInsensitive)
    }

    result = replacingNumericEntities(in: result, pattern: "&#([0-9]{1,7});", radix: 10)
    result = replacingNumericEntities(in: result, pattern: "&#[xX]([0-9a-fA-F]{1,6});", radix: 16)

    // `&amp;quot;` — double-encoded entities are common in scraped markup.
    if result.contains("&") && result != input {
      for (entity, replacement) in named {
        result = result.replacingOccurrences(of: entity, with: replacement, options: .caseInsensitive)
      }
    }
    return result
  }

  private static func replacingNumericEntities(
    in input: String,
    pattern: String,
    radix: Int
  ) -> String {
    guard let regex = try? NSRegularExpression(pattern: pattern) else { return input }
    let matches = regex.matches(
      in: input,
      range: NSRange(input.startIndex..<input.endIndex, in: input)
    )

    var result = input
    // Replace back to front so earlier ranges stay valid as the string shrinks.
    for match in matches.reversed() {
      guard match.numberOfRanges > 1,
            let full = Range(match.range, in: result),
            let digits = Range(match.range(at: 1), in: result),
            let code = UInt32(result[digits], radix: radix),
            let scalar = Unicode.Scalar(code) else { continue }
      result.replaceSubrange(full, with: String(Character(scalar)))
    }
    return result
  }
}
