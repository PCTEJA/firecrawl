const mocks = vi.hoisted(() => ({
  addScrapeJob: vi.fn(),
  addScrapeJobToBullMQ: vi.fn(),
  getCrawl: vi.fn(),
  startWebScraperPipeline: vi.fn(),
  crawler: {
    isRobotsAllowed: () => true,
    setBaseUrl: () => {},
    extractLinksFromContent: async () => [],
    filterLinks: vi.fn(),
    filterURL: async () => ({ allowed: true }),
    robots: { getSitemaps: () => [] },
  },
}));

vi.mock("../../../services/queue-jobs", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../services/queue-jobs")>()),
  addScrapeJob: mocks.addScrapeJob,
  _addScrapeJobToBullMQ: mocks.addScrapeJobToBullMQ,
}));
vi.mock("../../../lib/crawl-redis", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../lib/crawl-redis")>()),
  getCrawl: mocks.getCrawl,
  crawlToCrawler: () => mocks.crawler,
  lockURL: vi.fn().mockResolvedValue(true),
  addCrawlJob: vi.fn(),
  addCrawlJobs: vi.fn(),
  addCrawlJobDone: vi.fn(),
  saveCrawl: vi.fn(),
  recordRobotsBlocked: vi.fn(),
  finishCrawlKickoff: vi.fn(),
}));
vi.mock("../../../services/redis", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../services/redis")>()),
  redisEvictConnection: {
    scard: vi.fn().mockResolvedValue(0),
    sadd: vi.fn().mockResolvedValue(1),
    srem: vi.fn(),
    expire: vi.fn(),
    set: vi.fn(),
  },
}));
vi.mock("../../../lib/job-priority", () => ({
  addJobPriority: vi.fn(),
  deleteJobPriority: vi.fn(),
  getJobPriority: vi.fn().mockResolvedValue(10),
}));
vi.mock("../../../controllers/auth", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../controllers/auth")>()),
  getACUCTeam: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../../main/runWebScraper", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../main/runWebScraper")>()),
  startWebScraperPipeline: mocks.startWebScraperPipeline,
}));
vi.mock("../../../services/index", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../services/index")>()),
  queryIndexAtSplitLevel: vi.fn().mockResolvedValue([]),
}));

import { processJobInternal } from "../../../services/worker/scrape-worker";

const SUBMITTER_ORIGIN = "python-sdk@4.57.0";

function storedCrawl() {
  return {
    team_id: "team-1",
    originUrl: "https://shop.test/",
    crawlerOptions: {},
    scrapeOptions: {},
    internalOptions: { teamId: "team-1" },
    createdAt: Date.now(),
    origin: "js-sdk@4.56.0",
  };
}

describe("crawl enqueue origin", () => {
  beforeEach(() => {
    mocks.addScrapeJob.mockReset();
    mocks.addScrapeJobToBullMQ.mockReset();
    mocks.getCrawl.mockReset().mockResolvedValue(storedCrawl());
    mocks.crawler.filterLinks
      .mockReset()
      .mockResolvedValue({ links: [], robotsBlocked: [] });
    mocks.startWebScraperPipeline.mockReset();
  });

  it("enqueues discovered links under the crawl job's origin", async () => {
    mocks.crawler.filterLinks.mockResolvedValue({
      links: ["https://shop.test/p/2"],
      robotsBlocked: [],
    });
    mocks.startWebScraperPipeline.mockResolvedValue({
      success: true,
      document: {
        rawHtml: '<a href="/p/2">next</a>',
        metadata: {
          url: "https://shop.test/p/1",
          sourceURL: "https://shop.test/p/1",
          statusCode: 200,
        },
      },
    });

    await processJobInternal({
      id: "job-1",
      priority: 10,
      data: {
        url: "https://shop.test/p/1",
        mode: "single_urls",
        team_id: "team-1",
        crawl_id: "crawl-1",
        origin: SUBMITTER_ORIGIN,
        integration: "acme-integration",
        skipNuq: true,
        scrapeOptions: { formats: [{ type: "markdown" }] },
        crawlerOptions: { currentDiscoveryDepth: 0 },
        internalOptions: { teamId: "team-1" },
      },
    } as any).catch(() => undefined);

    expect(mocks.addScrapeJob).toHaveBeenCalledTimes(1);
    const [data] = mocks.addScrapeJob.mock.calls[0];
    expect(data.url).toBe("https://shop.test/p/2");
    expect(data.origin).toBe(SUBMITTER_ORIGIN);
    expect(data.integration).toBe("acme-integration");
  });

  it("enqueues the sitemap kickoff under the crawl job's origin", async () => {
    await processJobInternal({
      id: "kickoff-1",
      priority: 10,
      data: {
        url: "https://shop.test/sitemap.xml",
        mode: "kickoff",
        team_id: "team-1",
        crawl_id: "crawl-1",
        origin: SUBMITTER_ORIGIN,
        integration: "acme-integration",
        skipNuq: true,
        scrapeOptions: {},
        crawlerOptions: {},
      },
    } as any).catch(() => undefined);

    const sitemapJobs = mocks.addScrapeJobToBullMQ.mock.calls
      .map(([data]) => data)
      .filter(data => data.mode === "kickoff_sitemap");
    expect(sitemapJobs).toHaveLength(1);
    expect(sitemapJobs[0].sitemapUrl).toBe("https://shop.test/sitemap.xml");
    expect(sitemapJobs[0].origin).toBe(SUBMITTER_ORIGIN);
    expect(sitemapJobs[0].integration).toBe("acme-integration");
  });
});
