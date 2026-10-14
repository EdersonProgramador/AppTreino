import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { initAnalytics, trackPageView } from "../../lib/analytics";
import { captureMarketingAttributionFromLocation } from "../../lib/marketing-attribution-storage";

export function MarketingTracker() {
  const location = useLocation();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    captureMarketingAttributionFromLocation(location.search, location.pathname);
    trackPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  return null;
}
