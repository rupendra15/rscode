const BASE = "https://mybusiness.googleapis.com/v4";
const PERF = "https://businessprofileperformance.googleapis.com/v1";

export type GoogleBusinessData = {
  accountName: string;
  locationName: string;
  businessName: string;
  address: string;
  phone: string;
  website: string;
  rating: number | null;
  reviewCount: number | null;
  reviews: Array<{ rating: string; comment: string; time: string }>;
  performance: { websiteClicks: number; phoneCalls: number; directionRequests: number };
  signals: string[];
};

async function getJson(url: string, token: string) {
  const response = await fetch(url, {
    headers: { Authorization: "Bearer " + token },
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Google API request failed: " + response.status);
  return response.json();
}

export async function listGoogleLocations(token: string) {
  const accounts = await getJson(BASE + "/accounts?pageSize=20", token);
  const locations: any[] = [];

  for (const account of accounts.accounts || []) {
    const data = await getJson(
      BASE +
        "/" +
        account.name +
        "/locations?pageSize=100&readMask=name,title,storefrontAddress,phoneNumbers,websiteUri",
      token
    );

    for (const location of data.locations || []) {
      locations.push({
        ...location,
        accountName: account.name,
        accountDisplayName: account.accountName
      });
    }
  }

  return locations;
}

export async function fetchGoogleBusinessData(
  token: string,
  location: any
): Promise<GoogleBusinessData> {
  const name = location.name as string;

  let reviews: any = {};
  try {
    reviews = await getJson(
      BASE + "/" + name + "/reviews?pageSize=50&orderBy=updateTime desc",
      token
    );
  } catch {}

  let performance = {
    websiteClicks: 0,
    phoneCalls: 0,
    directionRequests: 0
  };

  try {
    const end = new Date();
    const start = new Date(Date.now() - 30 * 86400000);

    const dateParts = (value: Date) => ({
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate()
    });

    const query = new URLSearchParams();
    const startParts = dateParts(start);
    const endParts = dateParts(end);

    query.set("daily_range.start_date.year", String(startParts.year));
    query.set("daily_range.start_date.month", String(startParts.month));
    query.set("daily_range.start_date.day", String(startParts.day));
    query.set("daily_range.end_date.year", String(endParts.year));
    query.set("daily_range.end_date.month", String(endParts.month));
    query.set("daily_range.end_date.day", String(endParts.day));

    for (const metric of [
      "WEBSITE_CLICKS",
      "CALL_CLICKS",
      "BUSINESS_DIRECTION_REQUESTS"
    ]) {
      const data = await getJson(
        PERF +
          "/locations/" +
          name.split("/").pop() +
          ":getDailyMetricsTimeSeries?dailyMetric=" +
          metric +
          "&" +
          query.toString(),
        token
      );

      const total = (data.timeSeries?.datedValues || []).reduce(
        (sum: number, value: any) => sum + Number(value.value || 0),
        0
      );

      if (metric === "WEBSITE_CLICKS") performance.websiteClicks = total;
      if (metric === "CALL_CLICKS") performance.phoneCalls = total;
      if (metric === "BUSINESS_DIRECTION_REQUESTS") performance.directionRequests = total;
    }
  } catch {}

  const reviewRows: Array<{ rating: string; comment: string; time: string }> = (reviews.reviews || []).map((review: any) => ({
    rating: String(review.starRating || ""),
    comment: String(review.comment || ""),
    time: String(review.createTime || "")
  }));

  const ratingValues = reviewRows
    .map((review: { rating: string }) => {
      const values: Record<string, number> = {
        ONE: 1,
        TWO: 2,
        THREE: 3,
        FOUR: 4,
        FIVE: 5
      };
      return values[review.rating] || 0;
    })
    .filter((value: number) => value > 0);

  const rating = ratingValues.length
    ? Math.round(
        (ratingValues.reduce((sum: number, value: number) => sum + value, 0) /
          ratingValues.length) *
          10
      ) / 10
    : null;

  return {
    accountName: location.accountName || "",
    locationName: name,
    businessName: location.title?.displayName || location.title || "",
    address: location.storefrontAddress?.addressLines?.join(", ") || "",
    phone: location.phoneNumbers?.primaryPhone || "",
    website: location.websiteUri || "",
    rating,
    reviewCount: reviews.totalReviewCount ?? (reviews.reviews || []).length,
    reviews: reviewRows.slice(0, 10),
    performance,
    signals: [
      location.websiteUri ? "Website linked" : "Website not linked",
      rating !== null
        ? "Recent accessible reviews average " + rating + "/5"
        : "Review rating unavailable",
      "Last-30-day profile actions: " +
        performance.websiteClicks +
        " website clicks, " +
        performance.phoneCalls +
        " calls, " +
        performance.directionRequests +
        " direction requests"
    ]
  };
}
