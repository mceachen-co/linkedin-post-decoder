/**
 * linkedin-post-analyzer
 *
 * Extract timestamps, engagement metrics, and metadata from LinkedIn post URLs.
 * Zero dependencies. Works in browsers and Node.js.
 *
 * Tier 1 (client-side): Timestamp decoded from the activity ID via bit-shift.
 *   Always works, no network request needed.
 * Tier 2 (server-side): JSON-LD and Open Graph meta parsed from fetched HTML.
 *   Requires fetching the LinkedIn post page.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinkedInPostData {
  url: string;
  activityId: string;
  /** ISO 8601 UTC timestamp */
  timestamp: string;
  /** Formatted local timestamp in the requested timezone */
  timestampLocal: string;
  dayOfWeek: string;
  /** Hour of day (0-23) in the requested timezone */
  hourOfDay: number;
  authorSlug?: string;
  enriched?: EnrichedData;
  enrichmentError?: string;
}

export interface EnrichedData {
  headline?: string;
  text?: string;
  imageUrl?: string;
  likeCount?: number;
  commentCount?: number;
  authorName?: string;
  authorUrl?: string;
  authorFollowerCount?: number;
  datePublished?: string;
}

export interface BuildOptions {
  /** IANA timezone for local formatting (default: "America/Los_Angeles") */
  timezone?: string;
}

// ---------------------------------------------------------------------------
// URL Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a LinkedIn post URL to extract the activity ID and author slug.
 *
 * Supported formats:
 * - linkedin.com/posts/{author}_{slug}-activity-{id}-{hash}
 * - linkedin.com/posts/{author}_{slug}-share-{id}-{hash}
 * - linkedin.com/feed/update/urn:li:activity:{id}
 * - Bare 19-20 digit activity ID
 *
 * Returns null if the input is not a recognized format.
 */
export function parseLinkedInUrl(
  url: string
): { activityId: string; authorSlug?: string } | null {
  if (!url || typeof url !== "string") return null;

  const trimmed = url.trim();

  // Pattern 1: /posts/{author}_{slug}-{activity|share}-{id}-{hash}
  // Author slug ends at the first underscore
  const postsMatch = trimmed.match(
    /linkedin\.com\/posts\/([^_/]+)_[\w-]*-(?:activity|share)-(\d{19,20})/
  );
  if (postsMatch) {
    return { activityId: postsMatch[2], authorSlug: postsMatch[1] };
  }

  // Pattern 2: /feed/update/urn:li:activity:{id}
  const feedMatch = trimmed.match(
    /linkedin\.com\/feed\/update\/urn:li:activity:(\d{19,20})/
  );
  if (feedMatch) {
    return { activityId: feedMatch[1] };
  }

  // Pattern 3: bare activity ID
  const bareMatch = trimmed.match(/^(\d{19,20})$/);
  if (bareMatch) {
    return { activityId: bareMatch[1] };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Timestamp Decoding
// ---------------------------------------------------------------------------

/**
 * Decode the timestamp from a LinkedIn activity ID.
 *
 * LinkedIn uses a Snowflake-like ID scheme where the upper bits encode
 * the creation time in Unix milliseconds: `(activityId >> 22) = ms since epoch`
 */
export function decodeActivityTimestamp(activityId: string): Date {
  const id = BigInt(activityId);
  const timestampMs = Number(id >> 22n);
  return new Date(timestampMs);
}

// ---------------------------------------------------------------------------
// HTML Enrichment (Tier 2)
// ---------------------------------------------------------------------------

/**
 * Extract JSON-LD structured data from LinkedIn post HTML.
 * Looks for a SocialMediaPosting schema with engagement metrics.
 */
export function extractJsonLd(
  html: string
): Record<string, any> | null {
  const match = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) return null;

  try {
    const data = JSON.parse(match[1]);
    if (data["@type"] === "SocialMediaPosting") return data;
    if (Array.isArray(data)) {
      return (
        data.find((d: any) => d["@type"] === "SocialMediaPosting") || null
      );
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract Open Graph meta tags from HTML.
 */
export function extractOgMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const regex =
    /<meta\s+(?:property|name)=["'](og:[^"']+)["']\s+content=["']([^"']*)["'][^>]*\/?>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    meta[match[1]] = match[2];
  }
  return meta;
}

/**
 * Extract enriched data (engagement, author, content) from LinkedIn post HTML.
 * Combines JSON-LD structured data with Open Graph meta tags.
 */
export function extractEnrichedData(html: string): EnrichedData | undefined {
  const jsonLd = extractJsonLd(html);
  const og = extractOgMeta(html);
  const enriched: EnrichedData = {};

  if (jsonLd) {
    enriched.headline = jsonLd.headline || undefined;
    enriched.text = jsonLd.text || undefined;
    enriched.datePublished = jsonLd.datePublished || undefined;

    if (jsonLd.image?.url) {
      enriched.imageUrl = jsonLd.image.url;
    }

    if (jsonLd.author) {
      enriched.authorName = jsonLd.author.name || undefined;
      enriched.authorUrl = jsonLd.author.url || undefined;
      if (jsonLd.author.interactionStatistic?.userInteractionCount != null) {
        enriched.authorFollowerCount =
          jsonLd.author.interactionStatistic.userInteractionCount;
      }
    }

    if (Array.isArray(jsonLd.interactionStatistic)) {
      for (const stat of jsonLd.interactionStatistic) {
        if (stat.interactionType?.includes("LikeAction")) {
          enriched.likeCount = stat.userInteractionCount;
        }
        if (stat.interactionType?.includes("CommentAction")) {
          enriched.commentCount = stat.userInteractionCount;
        }
      }
    }

    if (enriched.commentCount == null && jsonLd.commentCount != null) {
      enriched.commentCount = jsonLd.commentCount;
    }
  }

  // Fill gaps from OG tags
  if (!enriched.headline && og["og:title"]) {
    enriched.headline = og["og:title"];
  }
  if (!enriched.imageUrl && og["og:image"]) {
    enriched.imageUrl = og["og:image"];
  }

  return Object.keys(enriched).length > 0 ? enriched : undefined;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Get day of week and hour in a specific timezone.
 */
function getTimezoneComponents(
  date: Date,
  tz: string
): { day: string; hour: number } {
  const dayStr = date.toLocaleString("en-US", {
    timeZone: tz,
    weekday: "long",
  });
  const hourStr = date.toLocaleString("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  });
  return { day: dayStr, hour: parseInt(hourStr, 10) };
}

/**
 * Build complete post data from a URL and optional HTML content.
 *
 * Tier 1 data (timestamp, day, hour) is always available from the URL alone.
 * Tier 2 data (likes, comments, author) requires passing fetched HTML.
 *
 * @param url - LinkedIn post URL or bare activity ID
 * @param html - Optional HTML of the LinkedIn post page (enables Tier 2 enrichment)
 * @param options - Configuration (timezone, etc.)
 */
export function buildPostData(
  url: string,
  html?: string,
  options?: BuildOptions
): LinkedInPostData | null {
  const parsed = parseLinkedInUrl(url);
  if (!parsed) return null;

  const tz = options?.timezone ?? "America/Los_Angeles";
  const date = decodeActivityTimestamp(parsed.activityId);
  const components = getTimezoneComponents(date, tz);

  const result: LinkedInPostData = {
    url: url.trim(),
    activityId: parsed.activityId,
    timestamp: date.toISOString(),
    timestampLocal: date.toLocaleString("en-US", {
      timeZone: tz,
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }),
    dayOfWeek: components.day,
    hourOfDay: components.hour,
    authorSlug: parsed.authorSlug,
  };

  if (html) {
    const enriched = extractEnrichedData(html);
    if (enriched) {
      result.enriched = enriched;
    }
  }

  return result;
}

/**
 * Fetch a LinkedIn post page and build enriched post data.
 *
 * This is a convenience function that combines URL parsing, timestamp decoding,
 * HTML fetching, and enrichment into a single call. Requires a runtime with
 * `fetch()` support (Node 18+, Cloudflare Workers, browsers with CORS proxy).
 *
 * If the HTML fetch fails, Tier 1 data (timestamp) is still returned with
 * an `enrichmentError` field explaining why Tier 2 failed.
 */
export async function fetchPostData(
  url: string,
  options?: BuildOptions
): Promise<LinkedInPostData | null> {
  const tier1 = buildPostData(url, undefined, options);
  if (!tier1) return null;

  try {
    const response = await fetch(url.trim(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      tier1.enrichmentError = `HTTP ${response.status}: could not fetch post page.`;
      return tier1;
    }

    const html = await response.text();
    const enriched = extractEnrichedData(html);
    if (enriched) {
      tier1.enriched = enriched;
    }
  } catch (err) {
    tier1.enrichmentError =
      "Engagement data unavailable. LinkedIn limits automated requests.";
  }

  return tier1;
}
