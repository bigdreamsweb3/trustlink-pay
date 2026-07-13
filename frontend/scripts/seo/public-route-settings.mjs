export const defaultPublicRouteSettings = {
  priority: 0.5,
  changeFrequency: "monthly",
};

export const publicRouteOverrides = {
  "/": { priority: 1.0, changeFrequency: "daily" },
  "/privacy": { priority: 0.5, changeFrequency: "monthly" },
  "/support": { priority: 0.6, changeFrequency: "monthly" },
  "/terms": { priority: 0.5, changeFrequency: "monthly" },
  "/tsn": { priority: 0.9, changeFrequency: "monthly" },
};
