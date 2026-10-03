import { PostHog } from 'posthog-react-native';

type Carrier = 'digicel' | 'natcom';
type Flow = 'phone_credit' | 'data_bundle' | 'request_data';

type AnalyticsEvents = {
  home_phone_credit_clicked: undefined;
  home_data_bundle_clicked: undefined;
  home_request_data_clicked: undefined;
  recipient_phone_valid: { flow: Flow; carrier: Carrier };
  topup_product_selected: {
    flow: Exclude<Flow, 'request_data'>;
    carrier: Carrier;
    product_type: 'airtime' | 'data';
    product_id: string;
    price_usd: number;
  };
  request_product_selected: { carrier: Carrier; product_id: string; price_usd: number };
  checkout_started: {
    target_type: 'topup_order' | 'data_request';
    carrier: Carrier;
    price_usd: number;
  };
  request_created: { carrier: Carrier; price_usd: number };
  request_shared: { method: 'whatsapp' | 'native_share' | 'copy_link' };
  request_payment_viewed: { carrier: Carrier; price_usd: number };
  request_payment_started: { carrier: Carrier; price_usd: number };
};

const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim() ?? '';
const posthogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() ?? '';

export const analyticsClient = new PostHog(posthogKey || 'posthog_not_configured', {
  host: posthogHost || 'https://us.i.posthog.com',
  disabled: !posthogKey || !posthogHost,
  persistence: 'memory',
  captureAppLifecycleEvents: false,
  enableSessionReplay: false,
});

export function trackAnalyticsEvent<EventName extends keyof AnalyticsEvents>(
  event: EventName,
  ...args: AnalyticsEvents[EventName] extends undefined ? [] : [properties: AnalyticsEvents[EventName]]
) {
  try {
    analyticsClient.capture(event, args[0]);
  } catch {
    // Analytics must never interrupt the product flow.
  }
}

export function analyticsCarrier(carrier: 'Digicel' | 'Natcom'): Carrier {
  return carrier.toLowerCase() as Carrier;
}
