import Foundation

/**
 Fetch the shared page, then ask the backend to turn it into a recipe.

 THE FETCH HAPPENS HERE, ON THE PHONE. That is the design, not an accident of
 where the code ended up. Instagram and TikTok block datacenter addresses far
 more aggressively than a residential connection, so a server that fetched the
 page itself would import strictly fewer recipes than the app manages today.
 The extension reads the page with the same iPhone Safari user-agent the app
 uses, and posts the HTML to a function that does the parts needing a secret or
 a database.

 Everything here is capped, because a share extension is memory-constrained and
 killed without ceremony:

   • 6s to fetch, 1.5 MB of HTML considered (matching MAX_HTML_BYTES on the
     server — a bigger page is not a recipe page)
   • 25s for the import call, which covers a model round trip with room to spare
   • no retries, on either leg

 Failure is never an error the user has to act on. Every failure resolves to
 `.fallback`, and the caller leaves the link queued — which is exactly what
 shipped before this existed.
 */
enum RecipeImportOutcome {
  /// Saved. The summary is what the sheet shows.
  case imported(SavedRecipe)
  /// Already in the library.
  case duplicate(SavedRecipe)
  /// Free-tier import allowance is spent.
  case gated
  /// The page yielded no recipe, and retrying won't change that.
  case unsupported
  /// Anything else. The link stays queued and the app finishes the job.
  case fallback
}

/**
 An instance rather than a namespace of statics, deliberately.

 The in-flight task has to be cancellable when the sheet goes away, and holding
 it in a `static var` would be shared mutable state across the process — the
 thing Swift's concurrency checking exists to reject, and a real hazard here
 because the completion handlers run off the main queue. One client, owned by
 one view controller, with one task: cancellation is then obviously correct and
 scoped to the sheet that started it.
 */
final class RecipeImportClient {
  private let userAgent =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

  /// Mirrors MAX_HTML_BYTES in supabase/functions/_shared/recipe-parser.ts.
  private let maxHtmlBytes = 1_500_000
  private let fetchTimeout: TimeInterval = 6
  private let importTimeout: TimeInterval = 25
  /**
   Tighter than the main fetch, because this one is on the critical path.

   The embed lookup only runs when the page gave up no image at all, and it
   delays the import by at most this much. An embed page is a few KB and usually
   answers in well under a second; capping at 4s means the worst case is a slower
   save rather than a failed one, and a timeout simply means no photo.
   */
  private static let embedTimeout: TimeInterval = 4

  /// Held so the sheet can cancel whichever leg is in flight. Only ever touched
  /// on the main queue — both legs are started from there and `cancel()` is
  /// called from view lifecycle methods.
  private var activeTask: URLSessionDataTask?
  /// Makes `completion` fire exactly once no matter how the work ends.
  private var hasFinished = false

  func cancel() {
    activeTask?.cancel()
    activeTask = nil
  }

  /**
   Run the whole thing.

   `onPreviewImage` fires as soon as the page has been read and it turned out to
   carry an `og:image` — typically a second or two before the import finishes. It
   costs nothing (the HTML is already in hand) and it is what lets the sheet show
   the actual dish while it works instead of a spinner. It may never fire: plenty
   of pages, Instagram's included, hand a plain client no image at all, and the
   sheet falls back to the cooking-icon carousel.

   `completion` is always called, exactly once. Both callbacks land on the main
   queue.
   */
  func run(
    url: URL,
    onPreviewImage: @escaping (URL) -> Void = { _ in },
    completion: @escaping (RecipeImportOutcome) -> Void
  ) {
    let finish: (RecipeImportOutcome) -> Void = { [weak self] outcome in
      DispatchQueue.main.async {
        guard let self, !self.hasFinished else { return }
        self.hasFinished = true
        self.activeTask = nil
        completion(outcome)
      }
    }

    // No endpoint or no credential means the app hasn't run since this feature
    // shipped, or the user is signed out. Either way the app is the one that
    // should handle it.
    guard let endpoint = ShareImportConfig.importEndpoint(),
          let token = ShareImportConfig.importToken() else {
      finish(.fallback)
      return
    }

    fetchPage(url: url) { [weak self] html in
      // Back to the main queue before leg 2: URLSession delivers completions on
      // its own queue, and `activeTask` is only safe because every write to it
      // happens here.
      DispatchQueue.main.async {
        guard let self else { return }
        guard let html else {
          finish(.fallback)
          return
        }

        let send: (URL?) -> Void = { preview in
          if let preview { onPreviewImage(preview) }
          self.requestImport(
            endpoint: endpoint,
            token: token,
            url: url,
            html: html,
            previewImage: preview,
            completion: finish
          )
        }

        if let image = Self.ogImageURL(in: html) {
          send(image)
          return
        }

        // No image on the page itself. For Instagram that is the NORMAL case,
        // not a failure — the post URL is login-walled and hands a plain client
        // nothing, which is why the app's paste flow has always fallen back to
        // the public embed page. Without this the share path saves a placeholder
        // photo where pasting the same link saves the dish.
        guard let embed = Self.instagramEmbedURL(for: url) else {
          send(nil)
          return
        }

        self.fetchPage(url: embed, timeout: Self.embedTimeout) { embedHTML in
          DispatchQueue.main.async {
            send(embedHTML.flatMap(Self.ogImageURL(in:)))
          }
        }
      }
    }
  }

  /**
   `instagram.com/(p|reel|tv)/{shortcode}/…` → the public embed page.

   Unlike the post URL, the embed is not login-walled and exposes the image.
   Mirrors `toInstagramEmbedUrl` in src/lib/recipeImport.ts, deliberately — the
   two paths should resolve the same photo for the same post.

   This runs HERE rather than on the server for the same reason the whole design
   fetches on-device: Instagram is far more permissive to a phone on a
   residential connection than to a datacenter address.
   */
  private static func instagramEmbedURL(for url: URL) -> URL? {
    let absolute = url.absoluteString
    guard let regex = try? NSRegularExpression(
      pattern: "instagram\\.com/(?:p|reel|tv)/([A-Za-z0-9_-]+)",
      options: [.caseInsensitive]
    ),
      let match = regex.firstMatch(
        in: absolute,
        range: NSRange(absolute.startIndex..<absolute.endIndex, in: absolute)
      ),
      match.numberOfRanges > 1,
      let range = Range(match.range(at: 1), in: absolute) else {
      return nil
    }
    return URL(string: "https://www.instagram.com/p/\(String(absolute[range]))/embed/captioned/")
  }

  /**
   The page's own hero image, for the sheet to show while the server works.

   Deliberately a SUBSET of what the server does. This is decoration on a surface
   that will be gone in four seconds, so it reads the two `og:image` spellings and
   Instagram's JSON `display_url` and stops — it does not chase the embed page or
   the Meta oEmbed proxy the way `resolveSourceImageUrl` does in the app. Missing
   the image costs a nicer four seconds; the saved recipe's photo is resolved
   server-side regardless, and the success card uses that.

   Entities are decoded because signed CDN URLs write their query strings with
   `&amp;`, and leaving those encoded yields params like `amp;_nc_map=…` that
   break the signature.
   */
  private static func ogImageURL(in html: String) -> URL? {
    let patterns = [
      "<meta[^>]+property=[\"']og:image(?::secure_url)?[\"'][^>]+content=[\"']([^\"']+)[\"']",
      "<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+property=[\"']og:image(?::secure_url)?[\"']",
      "<meta[^>]+name=[\"']twitter:image[\"'][^>]+content=[\"']([^\"']+)[\"']",
    ]

    for pattern in patterns {
      guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
            let match = regex.firstMatch(
              in: html,
              range: NSRange(html.startIndex..<html.endIndex, in: html)
            ),
            match.numberOfRanges > 1,
            let range = Range(match.range(at: 1), in: html) else { continue }

      let decoded = SharedLinkExtractor.decodingHTMLEntities(String(html[range]))
      if let url = URL(string: decoded), url.scheme?.lowercased() == "https" {
        return url
      }
    }

    // Instagram embeds carry the image in a JSON field rather than a meta tag.
    if let regex = try? NSRegularExpression(pattern: "\"display_url\":\"([^\"]+)\""),
       let match = regex.firstMatch(
         in: html,
         range: NSRange(html.startIndex..<html.endIndex, in: html)
       ),
       match.numberOfRanges > 1,
       let range = Range(match.range(at: 1), in: html) {
      let unescaped = String(html[range])
        .replacingOccurrences(of: "\\u0026", with: "&")
        .replacingOccurrences(of: "\\/", with: "/")
      if let url = URL(string: unescaped), url.scheme?.lowercased() == "https" {
        return url
      }
    }

    return nil
  }

  /**
   Decode a possibly-truncated HTML body.

   Cutting a response at a byte offset can land in the middle of a multi-byte
   UTF-8 character, and `String(data:encoding:.utf8)` answers nil for the whole
   buffer when that happens — so a naive Latin-1 fallback would mojibake an
   entire page because of its last two bytes. Dropping up to three trailing bytes
   finds the last valid boundary; Latin-1 is kept as a genuine last resort for
   pages that really are in a legacy encoding.
   */
  private func decodeHTML(_ data: Data) -> String? {
    for drop in 0...3 where data.count > drop {
      let candidate = data.prefix(data.count - drop)
      if let html = String(data: candidate, encoding: .utf8) { return html }
    }
    return String(data: data, encoding: .isoLatin1)
  }

  // MARK: - Leg 1: read the page

  private func fetchPage(
    url: URL,
    timeout: TimeInterval? = nil,
    completion: @escaping (String?) -> Void
  ) {
    let budget = timeout ?? fetchTimeout
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = budget
    configuration.timeoutIntervalForResource = budget
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData

    var request = URLRequest(url: url)
    request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
    request.setValue(
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      forHTTPHeaderField: "Accept"
    )
    request.setValue("en-US,en;q=0.9", forHTTPHeaderField: "Accept-Language")

    let limit = maxHtmlBytes
    let task = URLSession(configuration: configuration).dataTask(with: request) { [weak self] data, response, _ in
      guard let self,
            let data,
            let http = response as? HTTPURLResponse,
            (200..<300).contains(http.statusCode) else {
        completion(nil)
        return
      }

      // Truncate rather than reject: a long page is usually a recipe page with a
      // long comment section, and the first 1.5 MB carries the JSON-LD and the
      // meta tags that actually matter.
      completion(self.decodeHTML(Data(data.prefix(limit))))
    }
    activeTask = task
    task.resume()
  }

  // MARK: - Leg 2: import it

  private func requestImport(
    endpoint: URL,
    token: String,
    url: URL,
    html: String,
    previewImage: URL?,
    completion: @escaping (RecipeImportOutcome) -> Void
  ) {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = importTimeout
    configuration.timeoutIntervalForResource = importTimeout

    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

    var payload: [String: Any] = ["url": url.absoluteString, "html": html]
    if let previewImage {
      // The server prefers this over its own extraction. It has to: for
      // Instagram this came from the embed page, which the server never sees and
      // could not fetch as reliably from a datacenter address anyway.
      payload["previewImageUrl"] = previewImage.absoluteString
    }
    guard let body = try? JSONSerialization.data(withJSONObject: payload) else {
      completion(.fallback)
      return
    }
    request.httpBody = body

    let task = URLSession(configuration: configuration).dataTask(with: request) { data, _, _ in
      guard let data,
            let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let outcome = parsed["outcome"] as? String else {
        // A timeout, a 500, airplane mode — all the same answer. The server may
        // still finish the import (it registers the work with `waitUntil`), and
        // if it does, the app's duplicate check catches the queued copy.
        completion(.fallback)
        return
      }

      switch outcome {
      case "imported":
        completion(.imported(Self.summary(from: parsed)))
      case "duplicate":
        completion(.duplicate(Self.summary(from: parsed)))
      case "gated":
        completion(.gated)
      case "unsupported":
        completion(.unsupported)
      default:
        completion(.fallback)
      }
    }
    activeTask = task
    task.resume()
  }

  /**
   Build the success card from the response.

   Every field is optional on the wire. An older function deployment that only
   returns `recipeName` still produces a usable card — the counts are simply
   omitted rather than rendering as "0 ingredients · 0 min", which the sheet
   already guards against.
   */
  private static func summary(from parsed: [String: Any]) -> SavedRecipe {
    let name = (parsed["recipeName"] as? String)?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

    let imageURL = (parsed["imageUrl"] as? String).flatMap { raw -> URL? in
      guard let url = URL(string: raw), url.scheme?.lowercased() == "https" else { return nil }
      return url
    }

    return SavedRecipe(
      name: name,
      ingredientCount: parsed["ingredientCount"] as? Int ?? 0,
      totalMinutes: parsed["totalMinutes"] as? Int ?? 0,
      imageURL: imageURL
    )
  }
}
