import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseLinkedInUrl,
  decodeActivityTimestamp,
  extractJsonLd,
  extractOgMeta,
  extractEnrichedData,
  buildPostData,
} from "./index.js";

// ---------------------------------------------------------------------------
// parseLinkedInUrl
// ---------------------------------------------------------------------------

describe("parseLinkedInUrl", () => {
  it("parses /posts/ activity URL", () => {
    const result = parseLinkedInUrl(
      "https://www.linkedin.com/posts/ben-mceachen_ai-operations-activity-7306425726123456789-AbCd"
    );
    assert.deepStrictEqual(result, {
      activityId: "7306425726123456789",
      authorSlug: "ben-mceachen",
    });
  });

  it("parses /posts/ share URL", () => {
    const result = parseLinkedInUrl(
      "https://www.linkedin.com/posts/ben-mceachen_some-title-share-7306425726123456789-XyZw"
    );
    assert.deepStrictEqual(result, {
      activityId: "7306425726123456789",
      authorSlug: "ben-mceachen",
    });
  });

  it("parses /feed/update/ URL", () => {
    const result = parseLinkedInUrl(
      "https://www.linkedin.com/feed/update/urn:li:activity:7306425726123456789"
    );
    assert.deepStrictEqual(result, {
      activityId: "7306425726123456789",
    });
  });

  it("parses bare activity ID", () => {
    const result = parseLinkedInUrl("7306425726123456789");
    assert.deepStrictEqual(result, { activityId: "7306425726123456789" });
  });

  it("handles URL with tracking params", () => {
    const result = parseLinkedInUrl(
      "https://www.linkedin.com/posts/ben-mceachen_ai-activity-7306425726123456789-AbCd?utm_source=share&utm_medium=member_desktop"
    );
    assert.ok(result);
    assert.equal(result.activityId, "7306425726123456789");
  });

  it("returns null for non-LinkedIn URLs", () => {
    assert.equal(parseLinkedInUrl("https://twitter.com/foo"), null);
  });

  it("returns null for empty input", () => {
    assert.equal(parseLinkedInUrl(""), null);
  });

  it("returns null for pulse/newsletter URLs (no activity ID)", () => {
    assert.equal(
      parseLinkedInUrl(
        "https://www.linkedin.com/pulse/some-article-title-author-abc123"
      ),
      null
    );
  });
});

// ---------------------------------------------------------------------------
// decodeActivityTimestamp
// ---------------------------------------------------------------------------

describe("decodeActivityTimestamp", () => {
  it("decodes a known activity ID to a reasonable date", () => {
    // Activity ID 7306425726123456789 should decode to a date in 2025-2026 range
    const date = decodeActivityTimestamp("7306425726123456789");
    assert.ok(date instanceof Date);
    assert.ok(!isNaN(date.getTime()), "should be a valid date");
    const year = date.getUTCFullYear();
    assert.ok(year >= 2024 && year <= 2027, `year ${year} should be recent`);
  });

  it("produces different timestamps for different IDs", () => {
    const d1 = decodeActivityTimestamp("7306425726123456789");
    const d2 = decodeActivityTimestamp("7200000000000000000");
    assert.notEqual(d1.getTime(), d2.getTime());
  });
});

// ---------------------------------------------------------------------------
// extractJsonLd
// ---------------------------------------------------------------------------

describe("extractJsonLd", () => {
  it("extracts SocialMediaPosting from JSON-LD", () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
        {"@type":"SocialMediaPosting","headline":"Test Post","text":"Body text"}
        </script>
      </head></html>
    `;
    const result = extractJsonLd(html);
    assert.ok(result);
    assert.equal(result["@type"], "SocialMediaPosting");
    assert.equal(result.headline, "Test Post");
  });

  it("finds SocialMediaPosting in array", () => {
    const html = `
      <script type="application/ld+json">
      [{"@type":"WebPage"},{"@type":"SocialMediaPosting","headline":"Found"}]
      </script>
    `;
    const result = extractJsonLd(html);
    assert.ok(result);
    assert.equal(result.headline, "Found");
  });

  it("returns null when no JSON-LD present", () => {
    assert.equal(extractJsonLd("<html><body>No JSON-LD here</body></html>"), null);
  });

  it("returns null for non-SocialMediaPosting", () => {
    const html = `
      <script type="application/ld+json">{"@type":"WebPage"}</script>
    `;
    assert.equal(extractJsonLd(html), null);
  });
});

// ---------------------------------------------------------------------------
// extractOgMeta
// ---------------------------------------------------------------------------

describe("extractOgMeta", () => {
  it("extracts OG meta tags", () => {
    const html = `
      <meta property="og:title" content="My Post Title" />
      <meta property="og:image" content="https://example.com/img.jpg" />
    `;
    const result = extractOgMeta(html);
    assert.equal(result["og:title"], "My Post Title");
    assert.equal(result["og:image"], "https://example.com/img.jpg");
  });

  it("returns empty object when no OG tags", () => {
    const result = extractOgMeta("<html><head></head></html>");
    assert.deepStrictEqual(result, {});
  });
});

// ---------------------------------------------------------------------------
// extractEnrichedData
// ---------------------------------------------------------------------------

describe("extractEnrichedData", () => {
  it("extracts engagement metrics from JSON-LD", () => {
    const html = `
      <script type="application/ld+json">
      {
        "@type": "SocialMediaPosting",
        "headline": "Test",
        "author": {"name": "Ben McEachen", "url": "https://linkedin.com/in/ben"},
        "interactionStatistic": [
          {"interactionType": "http://schema.org/LikeAction", "userInteractionCount": 42},
          {"interactionType": "http://schema.org/CommentAction", "userInteractionCount": 7}
        ]
      }
      </script>
    `;
    const result = extractEnrichedData(html);
    assert.ok(result);
    assert.equal(result.headline, "Test");
    assert.equal(result.likeCount, 42);
    assert.equal(result.commentCount, 7);
    assert.equal(result.authorName, "Ben McEachen");
  });

  it("falls back to OG tags when JSON-LD is missing", () => {
    const html = `
      <meta property="og:title" content="OG Title" />
      <meta property="og:image" content="https://example.com/og.jpg" />
    `;
    const result = extractEnrichedData(html);
    assert.ok(result);
    assert.equal(result.headline, "OG Title");
    assert.equal(result.imageUrl, "https://example.com/og.jpg");
  });

  it("returns undefined when no data available", () => {
    assert.equal(extractEnrichedData("<html></html>"), undefined);
  });
});

// ---------------------------------------------------------------------------
// buildPostData
// ---------------------------------------------------------------------------

describe("buildPostData", () => {
  it("builds Tier 1 data from URL alone", () => {
    const result = buildPostData(
      "https://www.linkedin.com/posts/ben-mceachen_test-activity-7306425726123456789-AbCd"
    );
    assert.ok(result);
    assert.equal(result.activityId, "7306425726123456789");
    assert.ok(result.timestamp); // ISO string
    assert.ok(result.timestampLocal); // formatted
    assert.ok(result.dayOfWeek);
    assert.ok(typeof result.hourOfDay === "number");
    assert.equal(result.authorSlug, "ben-mceachen");
    assert.equal(result.enriched, undefined);
  });

  it("includes Tier 2 data when HTML is provided", () => {
    const html = `
      <script type="application/ld+json">
      {"@type":"SocialMediaPosting","headline":"Full Data","interactionStatistic":[
        {"interactionType":"http://schema.org/LikeAction","userInteractionCount":100}
      ]}
      </script>
    `;
    const result = buildPostData("7306425726123456789", html);
    assert.ok(result);
    assert.ok(result.enriched);
    assert.equal(result.enriched!.headline, "Full Data");
    assert.equal(result.enriched!.likeCount, 100);
  });

  it("accepts custom timezone", () => {
    const pt = buildPostData("7306425726123456789", undefined, {
      timezone: "America/Los_Angeles",
    });
    const et = buildPostData("7306425726123456789", undefined, {
      timezone: "America/New_York",
    });
    assert.ok(pt && et);
    // Same UTC timestamp, different local formatting
    assert.equal(pt.timestamp, et.timestamp);
    assert.notEqual(pt.timestampLocal, et.timestampLocal);
  });

  it("returns null for invalid URLs", () => {
    assert.equal(buildPostData("not a url"), null);
  });
});
