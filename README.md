# linkedin-post-decoder

Extract timestamps, engagement metrics, and metadata from LinkedIn post URLs. Zero dependencies.

Every LinkedIn post URL contains an activity ID that encodes the exact publish time. This library decodes it with a single bit-shift operation, giving you millisecond-precision timestamps without LinkedIn API access or authentication.

**[Live demo](https://mceachen.co/tools/linkedin-post-analyzer)** | **[Open the demo locally](demo/index.html)**

## Install

```bash
npm install linkedin-post-decoder
```

Or use it directly in a `<script>` tag (see [demo/index.html](demo/index.html)).

## Quick Start

```typescript
import { buildPostData, parseLinkedInUrl, decodeActivityTimestamp } from 'linkedin-post-decoder';

// Full extraction from a URL
const post = buildPostData(
  'https://www.linkedin.com/posts/ben-mceachen_ai-operations-activity-7306425726123456789-AbCd'
);
console.log(post.timestamp);      // "2026-03-17T16:30:45.000Z"
console.log(post.timestampLocal);  // "Mon, Mar 17, 2026, 09:30:45 AM"
console.log(post.dayOfWeek);       // "Monday"
console.log(post.hourOfDay);       // 9
console.log(post.authorSlug);      // "ben-mceachen"

// Just the timestamp
const parsed = parseLinkedInUrl('https://www.linkedin.com/posts/...-activity-7306425726123456789-AbCd');
const date = decodeActivityTimestamp(parsed.activityId);
console.log(date); // Date object
```

## How It Works

LinkedIn uses a Snowflake-like ID scheme. The upper bits of the 19-digit activity ID encode Unix milliseconds:

```
timestamp_ms = activityId >> 22
```

This gives exact publish times without scraping, API keys, or rate limits. The library uses `BigInt` for precision with 19-20 digit IDs.

## API Reference

### `parseLinkedInUrl(url: string)`

Extracts the activity ID and author slug from a LinkedIn post URL.

**Supported formats:**
- `linkedin.com/posts/{author}_{slug}-activity-{id}-{hash}`
- `linkedin.com/posts/{author}_{slug}-share-{id}-{hash}`
- `linkedin.com/feed/update/urn:li:activity:{id}`
- Bare 19-20 digit activity ID

Returns `{ activityId: string, authorSlug?: string }` or `null`.

### `decodeActivityTimestamp(activityId: string)`

Decodes a LinkedIn activity ID to a `Date` object.

### `buildPostData(url: string, html?: string, options?: BuildOptions)`

Builds complete post data from a URL. Returns `LinkedInPostData` or `null`.

- **Tier 1** (always available): timestamp, day of week, hour, author slug.
- **Tier 2** (requires HTML): likes, comments, author name, headline.

```typescript
// Tier 1 only (no network request)
const tier1 = buildPostData(url);

// Tier 1 + Tier 2 (pass pre-fetched HTML)
const tier2 = buildPostData(url, html);

// Custom timezone (default: America/Los_Angeles)
const eastern = buildPostData(url, undefined, { timezone: 'America/New_York' });
```

### `fetchPostData(url: string, options?: BuildOptions)`

Convenience async function that fetches the LinkedIn page and returns enriched data. Requires a runtime with `fetch()` (Node 18+, Cloudflare Workers, Deno).

```typescript
const post = await fetchPostData(url);
console.log(post.enriched?.likeCount);    // 42
console.log(post.enriched?.commentCount); // 7
console.log(post.enriched?.authorName);   // "Ben McEachen"
```

If the fetch fails, Tier 1 data is still returned with an `enrichmentError` field.

### `extractEnrichedData(html: string)`

Extracts engagement and metadata from LinkedIn post HTML (JSON-LD + Open Graph).

### `extractJsonLd(html: string)`

Extracts the `SocialMediaPosting` JSON-LD object from HTML.

### `extractOgMeta(html: string)`

Extracts Open Graph meta tags from HTML.

## Types

```typescript
interface LinkedInPostData {
  url: string;
  activityId: string;
  timestamp: string;        // ISO 8601 UTC
  timestampLocal: string;   // Formatted in requested timezone
  dayOfWeek: string;        // "Monday", "Tuesday", etc.
  hourOfDay: number;        // 0-23 in requested timezone
  authorSlug?: string;
  enriched?: EnrichedData;
  enrichmentError?: string;
}

interface EnrichedData {
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

interface BuildOptions {
  timezone?: string;  // IANA timezone (default: "America/Los_Angeles")
}
```

## Browser Usage

The core decode functions work entirely client-side. See [demo/index.html](demo/index.html) for a complete example that runs in any browser with no build step.

`fetchPostData()` will not work directly from a browser due to CORS restrictions. Use it server-side, or route requests through your own API endpoint.

## License

MIT. Built by [McEachen & Co.](https://mceachen.co)
