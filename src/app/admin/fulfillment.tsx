import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  fetchAdminFulfillmentOrders,
  runAdminFulfillmentAction,
  type AdminFulfillmentAction,
  type AdminFulfillmentActionResult,
  type AdminFulfillmentOrderRecord,
} from '@/lib/adminFulfillment';

type FilterKey = 'needs_review' | 'pending_supplier' | 'completed' | 'failed' | 'all';
type ManualAction = Exclude<AdminFulfillmentAction, 'list'>;

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'needs_review', label: 'Needs Review' },
  { key: 'pending_supplier', label: 'Pending Supplier' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
  { key: 'all', label: 'All' },
];

export default function AdminFulfillmentScreen() {
  const [orders, setOrders] = useState<AdminFulfillmentOrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('needs_review');
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const [lastResultLabel, setLastResultLabel] = useState<string>('Latest response');
  const [lastResult, setLastResult] = useState<AdminFulfillmentActionResult | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: ManualAction; order: AdminFulfillmentOrderRecord } | null>(null);
  const [confirmationValue, setConfirmationValue] = useState('');

  useEffect(() => {
    void loadOrders();
  }, []);

  const visibleOrders = useMemo(() => orders.filter((order) => matchesFilter(order, activeFilter)), [orders, activeFilter]);

  async function loadOrders(nextMode: 'initial' | 'refresh' = 'initial') {
    if (nextMode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    const result = await fetchAdminFulfillmentOrders();
    if (result.ok) {
      setOrders(result.orders);
      setPageError(null);
      setPageMessage(result.message);
    } else {
      setOrders([]);
      setPageMessage(null);
      setPageError(result.message);
    }

    setLoading(false);
    setRefreshing(false);
  }

  async function handleAction(action: ManualAction, order: AdminFulfillmentOrderRecord) {
    if (!isActionAllowed(action, order)) {
      setPageError(getActionBlockReason(action, order));
      return;
    }

    if (action === 'live_manual') {
      setPendingAction({ action, order });
      setConfirmationValue('');
      return;
    }

    await runAction(action, order);
  }

  async function runAction(action: ManualAction, order: AdminFulfillmentOrderRecord) {
    setActionLoading(true);
    setPageError(null);
    setLastResultLabel(`${actionLabel(action)} - ${shortOrderId(order.id)}`);

    try {
      const response = await runAdminFulfillmentAction(action, order.id);
      setLastResult(response);
      if (isSuccessResponse(response)) {
        setPageMessage(getResponseMessage(response) ?? `${actionLabel(action)} finished.`);
      } else {
        setPageError(getResponseMessage(response) ?? 'Action failed.');
      }
      await loadOrders('refresh');
    } catch {
      setPageError('Action failed.');
    } finally {
      setActionLoading(false);
      setPendingAction(null);
      setConfirmationValue('');
    }
  }

  const pendingOrder = pendingAction?.order ?? null;
  const confirmationMatches = !!pendingOrder && matchesConfirmation(confirmationValue, pendingOrder.id);
  const liveManualAllowed = pendingOrder ? isActionAllowed('live_manual', pendingOrder) : false;

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Internal tool</Text>
          <Text style={styles.title}>Admin Fulfillment</Text>
          <Text style={styles.subtitle}>
            Manual-only DT One fulfillment for paid top-up orders. The browser never talks to DT One directly.
          </Text>
          <View style={styles.badgeRow}>
            <Badge label="Server-side wrapper" tone="neutral" />
            <Badge label="No webhook automation" tone="warning" />
            <Badge label={`${orders.length} recent orders`} tone="success" />
          </View>
        </View>

        <View style={styles.toolbar}>
          <View style={styles.filterRow}>
            {FILTERS.map((filter) => (
              <FilterChip
                key={filter.key}
                label={filter.label}
                selected={activeFilter === filter.key}
                onPress={() => setActiveFilter(filter.key)}
              />
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={loading || refreshing || actionLoading}
            onPress={() => void loadOrders('refresh')}
            style={({ pressed }) => [
              styles.refreshButton,
              pressed && !loading && !refreshing && !actionLoading && styles.refreshButtonPressed,
            ]}>
            {refreshing ? <ActivityIndicator color={Colors.light.primary} /> : <Text style={styles.refreshText}>Refresh</Text>}
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.noticeCard}>
            <ActivityIndicator color={Colors.light.primary} />
            <Text style={styles.noticeText}>Loading recent top-up orders...</Text>
          </View>
        ) : null}

        {pageError ? (
          <View style={[styles.noticeCard, styles.errorCard]}>
            <Text style={styles.noticeTitle}>Admin Error</Text>
            <Text style={styles.noticeText}>{pageError}</Text>
          </View>
        ) : null}

        {!loading && !pageError ? (
          <>
            {visibleOrders.length === 0 ? (
              <View style={styles.noticeCard}>
                <Text style={styles.noticeTitle}>No matching orders</Text>
                <Text style={styles.noticeText}>Try another filter or refresh to load newer activity.</Text>
              </View>
            ) : null}

            <View style={styles.orderList}>
              {visibleOrders.map((order) => (
                <View key={order.id} style={styles.orderCard}>
                  <View style={styles.orderHeader}>
                    <View style={styles.orderHeaderText}>
                      <Text style={styles.orderCreatedAt}>{formatCreatedAt(order.createdAt)}</Text>
                      <Text style={styles.orderId}>{shortOrderId(order.id)}</Text>
                    </View>
                    <StatusBadge label={order.status} tone={statusTone(order.status)} />
                  </View>

                  <View style={styles.detailGrid}>
                    <Detail label="Carrier" value={order.carrier} />
                    <Detail label="Product" value={order.productName} />
                    <Detail label="Phone" value={order.recipientPhone} />
                    <Detail label="Total USD" value={formatMoney(order.totalUsd)} />
                    <Detail label="Payment" value={order.paymentStatus} />
                    <Detail label="Supplier" value={order.supplierStatus ?? 'null'} />
                    <Detail label="Supplier ref" value={order.supplierReference ?? '-'} mono />
                  </View>

                  <View style={styles.actionRow}>
                    <ActionButton
                      label="Dry Run"
                      disabled={!isActionAllowed('dry_run', order) || actionLoading}
                      onPress={() => void handleAction('dry_run', order)}
                      tone="neutral"
                    />
                    <ActionButton
                      label="Live Manual Fulfill"
                      disabled={!isActionAllowed('live_manual', order) || actionLoading}
                      onPress={() => void handleAction('live_manual', order)}
                      tone="primary"
                    />
                    <ActionButton
                      label="Check Status"
                      disabled={!isActionAllowed('check_status', order) || actionLoading}
                      onPress={() => void handleAction('check_status', order)}
                      tone="neutral"
                    />
                  </View>

                  {!isActionAllowed('live_manual', order) ? (
                    <Text style={styles.hintText}>{getActionBlockReason('live_manual', order)}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <View>
              <Text style={styles.sectionTitle}>Result panel</Text>
              <Text style={styles.resultSubtitle}>{lastResultLabel}</Text>
            </View>
            {actionLoading ? <ActivityIndicator color={Colors.light.primary} /> : null}
          </View>
          {pageMessage ? <Text style={styles.successText}>{pageMessage}</Text> : null}
          {lastResult ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text selectable style={styles.jsonText}>
                {JSON.stringify(lastResult, null, 2)}
              </Text>
            </ScrollView>
          ) : (
            <Text style={styles.noticeText}>Run an action to inspect the returned JSON here.</Text>
          )}
        </View>
      </ScrollView>

      <Modal visible={pendingAction != null} transparent animationType="fade" onRequestClose={() => setPendingAction(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !actionLoading && setPendingAction(null)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create DT One Transaction</Text>
            <Text style={styles.modalSubtitle}>Confirm the order before creating the DT One transaction.</Text>

            {pendingOrder ? (
              <View style={styles.confirmSummary}>
                <Detail label="Carrier" value={pendingOrder.carrier} />
                <Detail label="Product" value={pendingOrder.productName} />
                <Detail label="Phone" value={pendingOrder.recipientPhone} />
                <Detail label="Amount" value={formatMoney(pendingOrder.totalUsd)} />
                <Detail label="Order id" value={pendingOrder.id} mono />
              </View>
            ) : null}

            <Text style={styles.confirmLabel}>
              Type {pendingOrder ? shortOrderId(pendingOrder.id) : 'the order id'} or the full order id to continue.
            </Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!actionLoading}
              placeholder={pendingOrder ? shortOrderId(pendingOrder.id) : 'Order id'}
              placeholderTextColor={Colors.light.textTertiary}
              selectionColor={Colors.light.primary}
              style={styles.confirmInput}
              value={confirmationValue}
              onChangeText={setConfirmationValue}
            />

            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                disabled={actionLoading}
                onPress={() => setPendingAction(null)}
                style={({ pressed }) => [styles.secondaryButton, pressed && !actionLoading && styles.secondaryButtonPressed]}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={actionLoading || !confirmationMatches || !liveManualAllowed}
                onPress={() => {
                  if (pendingOrder && confirmationMatches && liveManualAllowed) {
                    void runAction('live_manual', pendingOrder);
                  }
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (actionLoading || !confirmationMatches || !liveManualAllowed) && styles.primaryButtonDisabled,
                  pressed && !actionLoading && confirmationMatches && liveManualAllowed && styles.primaryButtonPressed,
                ]}>
                {actionLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Create DT One Transaction</Text>
                )}
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function matchesFilter(order: AdminFulfillmentOrderRecord, filter: FilterKey) {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'needs_review') {
    return (
      order.paymentStatus === 'paid' &&
      (order.status === 'paid' || order.status === 'processing') &&
      (order.supplierStatus == null || order.supplierStatus === 'pending' || order.supplierStatus === 'not_sent')
    );
  }

  if (filter === 'pending_supplier') {
    return order.supplierStatus === 'pending' || order.supplierStatus === 'not_sent' || order.status === 'processing';
  }

  if (filter === 'completed') {
    return order.status === 'completed' || order.supplierStatus === 'successful';
  }

  return order.status === 'failed' || order.supplierStatus === 'failed';
}

function isActionAllowed(action: ManualAction, order: AdminFulfillmentOrderRecord) {
  if (action === 'dry_run') {
    return order.paymentStatus === 'paid' && (order.status === 'paid' || order.status === 'processing');
  }

  if (action === 'live_manual') {
    return (
      order.paymentStatus === 'paid' &&
      (order.status === 'paid' || order.status === 'processing') &&
      (order.supplierStatus == null || order.supplierStatus !== 'successful') &&
      !normalizeText(order.supplierReference)
    );
  }

  return Boolean(normalizeText(order.supplierReference)) && (order.supplierStatus === 'pending' || order.status === 'processing');
}

function getActionBlockReason(action: ManualAction, order: AdminFulfillmentOrderRecord) {
  if (action === 'dry_run') {
    return 'Dry Run is only available for paid orders in paid or processing status.';
  }

  if (action === 'live_manual') {
    if (order.paymentStatus !== 'paid' || (order.status !== 'paid' && order.status !== 'processing')) {
      return 'Live Manual Fulfill requires a paid order in paid or processing status.';
    }

    if (normalizeText(order.supplierReference)) {
      return 'Live Manual Fulfill is blocked because this order already has a supplier reference.';
    }

    return 'Live Manual Fulfill is only available before a DT One transaction has been created.';
  }

  if (!normalizeText(order.supplierReference)) {
    return 'Check Status requires an existing supplier reference.';
  }

  return 'Check Status is only available while the supplier status is pending or the order is processing.';
}

function isSuccessResponse(response: AdminFulfillmentActionResult) {
  return typeof response === 'object' && response !== null && 'ok' in response && (response as { ok?: unknown }).ok === true;
}

function getResponseMessage(response: AdminFulfillmentActionResult) {
  if (typeof response !== 'object' || response === null || !('message' in response)) {
    return null;
  }

  const message = (response as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() ? message : null;
}

function actionLabel(action: ManualAction) {
  if (action === 'dry_run') return 'Dry Run';
  if (action === 'live_manual') return 'Live Manual Fulfill';
  return 'Check Status';
}

function shortOrderId(orderId: string) {
  return orderId.slice(0, 8);
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? '';
}

function matchesConfirmation(input: string, orderId: string) {
  const value = normalizeText(input).toLowerCase();
  return value === shortOrderId(orderId).toLowerCase() || value === orderId.toLowerCase();
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

function statusTone(value: string) {
  const status = value.toLowerCase();
  if (status === 'completed' || status === 'successful') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'processing' || status === 'pending') return 'warning';
  return 'neutral';
}

function Badge({ label, tone }: { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }) {
  return <StatusBadge label={label} tone={tone} />;
}

function StatusBadge({ label, tone }: { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'neutral' && styles.badgeNeutral,
        tone === 'success' && styles.badgeSuccess,
        tone === 'warning' && styles.badgeWarning,
        tone === 'danger' && styles.badgeDanger,
      ]}>
      <Text
        style={[
          styles.badgeText,
          tone === 'success' && styles.badgeTextSuccess,
          tone === 'warning' && styles.badgeTextWarning,
          tone === 'danger' && styles.badgeTextDanger,
        ]}>
        {label}
      </Text>
    </View>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.filterChip, selected && styles.filterChipSelected, pressed && styles.filterChipPressed]}>
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  tone,
  disabled,
  onPress,
}: {
  label: string;
  tone: 'neutral' | 'primary';
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        tone === 'primary' ? styles.actionButtonPrimary : styles.actionButtonNeutral,
        pressed && !disabled && styles.actionButtonPressed,
        disabled && styles.actionButtonDisabled,
      ]}>
      <Text style={[styles.actionButtonText, tone === 'primary' && styles.actionButtonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, mono && styles.detailValueMono]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  hero: {
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: '#FFFFFF',
  },
  kicker: {
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.light.textTertiary,
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: Colors.light.text,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.light.textSecondary,
    maxWidth: 780,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    flex: 1,
  },
  filterChip: {
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipSelected: {
    backgroundColor: Colors.light.primarySoft,
    borderColor: Colors.light.primary,
  },
  filterChipPressed: {
    opacity: 0.7,
  },
  filterChipText: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  filterChipTextSelected: {
    color: Colors.light.primary,
  },
  refreshButton: {
    minHeight: 40,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonPressed: {
    opacity: 0.72,
  },
  refreshText: {
    fontSize: 14,
    lineHeight: 18,
    color: Colors.light.text,
    fontWeight: '600',
  },
  noticeCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: '#FFFFFF',
    padding: Spacing.lg,
    gap: Spacing.xs,
    alignItems: 'flex-start',
  },
  errorCard: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF1F2',
  },
  noticeTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: Colors.light.text,
  },
  noticeText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
  orderList: {
    gap: Spacing.md,
  },
  orderCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: '#FFFFFF',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  orderHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  orderHeaderText: {
    flex: 1,
    gap: 2,
  },
  orderCreatedAt: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  orderId: {
    fontSize: 18,
    lineHeight: 24,
    color: Colors.light.text,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  badge: {
    minHeight: 30,
    paddingHorizontal: Spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeNeutral: {
    borderColor: Colors.light.border,
    backgroundColor: '#F8FAFC',
  },
  badgeSuccess: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  badgeWarning: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  badgeDanger: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: Colors.light.textSecondary,
    textTransform: 'capitalize',
  },
  badgeTextSuccess: {
    color: '#15803D',
  },
  badgeTextWarning: {
    color: '#B45309',
  },
  badgeTextDanger: {
    color: '#B91C1C',
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  detailItem: {
    minWidth: 140,
    flexGrow: 1,
    gap: 4,
  },
  detailLabel: {
    fontSize: 11,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.light.textTertiary,
    fontWeight: '700',
  },
  detailValue: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.text,
    fontWeight: '600',
  },
  detailValueMono: {
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  actionButton: {
    minHeight: 42,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonNeutral: {
    borderColor: Colors.light.border,
    backgroundColor: '#FFFFFF',
  },
  actionButtonPrimary: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primary,
  },
  actionButtonDisabled: {
    opacity: 0.42,
  },
  actionButtonPressed: {
    opacity: 0.8,
  },
  actionButtonText: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.text,
    fontWeight: '700',
  },
  actionButtonTextPrimary: {
    color: '#FFFFFF',
  },
  hintText: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.light.textTertiary,
  },
  resultCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: '#FFFFFF',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: Colors.light.text,
  },
  resultSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
  },
  successText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.success,
    fontWeight: '600',
  },
  jsonText: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
    color: Colors.light.text,
    minWidth: 500,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.36)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  modalCard: {
    borderRadius: Radius.xl,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: Colors.light.text,
  },
  modalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
  confirmSummary: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: '#F8FAFC',
  },
  confirmLabel: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.textSecondary,
    fontWeight: '600',
  },
  confirmInput: {
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.md,
    fontSize: 15,
    lineHeight: 20,
    color: Colors.light.text,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonPressed: {
    opacity: 0.8,
  },
  secondaryButtonText: {
    fontSize: 14,
    lineHeight: 18,
    color: Colors.light.text,
    fontWeight: '700',
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: Colors.light.primary,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    backgroundColor: Colors.light.primaryPressed,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    fontSize: 14,
    lineHeight: 18,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
