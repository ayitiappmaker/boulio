import { getCurrentSession } from '@/lib/auth';
import { fetchMyDataRequests as fetchStoredDataRequests, type DataRequestRecord } from '@/lib/dataRequests';
import { fetchMyTopUpOrders as fetchStoredTopUpOrders, type TopUpOrderRecord } from '@/lib/topupOrders';

export type ActivitySummary = {
  topUpOrders: TopUpOrderRecord[];
  dataRequests: DataRequestRecord[];
};

export async function fetchMyTopUpOrders(): Promise<TopUpOrderRecord[]> {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return [];
  }

  try {
    return await fetchStoredTopUpOrders();
  } catch {
    return [];
  }
}

export async function fetchMyDataRequests(): Promise<DataRequestRecord[]> {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return [];
  }

  try {
    return await fetchStoredDataRequests();
  } catch {
    return [];
  }
}

export async function fetchMyActivity(): Promise<ActivitySummary> {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return {
      topUpOrders: [],
      dataRequests: [],
    };
  }

  const [topUpOrders, dataRequests] = await Promise.all([
    fetchMyTopUpOrders(),
    fetchMyDataRequests(),
  ]);

  return {
    topUpOrders,
    dataRequests,
  };
}
