import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { ChipSelector } from '@/components/ChipSelector';
import { TopUpAmountCard } from '@/components/TopUpAmountCard';
import type { TopUpCarrier, TopUpProduct } from '@/lib/types';
import { t } from '@/lib/i18n';

type CarrierFilter = 'All' | TopUpCarrier;

type InternetBundleSelectorProps = {
  products: TopUpProduct[];
  selectedProductId: string | null;
  onSelect: (product: TopUpProduct) => void;
  initialCarrierFilter?: CarrierFilter;
  emptyMessage?: string;
};

const carrierFilters: readonly CarrierFilter[] = ['All', 'Digicel', 'Natcom'];

export function InternetBundleSelector({
  products,
  selectedProductId,
  onSelect,
  initialCarrierFilter = 'All',
  emptyMessage,
}: InternetBundleSelectorProps) {
  const [search, setSearch] = useState('');
  const [carrierFilter, setCarrierFilter] = useState<CarrierFilter>(initialCarrierFilter);

  useEffect(() => {
    setCarrierFilter(initialCarrierFilter);
    setSearch('');
  }, [initialCarrierFilter]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return products.filter((product) => {
      const carrierMatches = carrierFilter === 'All' || product.carrier === carrierFilter;
      if (!carrierMatches) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const fields = [
        product.carrier,
        product.name,
        product.bundleLabel ?? '',
        String(product.amountUsd),
        formatAmount(product.amountUsd),
      ]
        .join(' ')
        .toLowerCase();

      return fields.includes(normalizedSearch);
    });
  }, [carrierFilter, products, search]);

  return (
    <View style={styles.stack}>
      <View style={styles.searchBlock}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('searchPlans')}
          placeholderTextColor={Colors.light.muted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <ChipSelector
        value={carrierFilter}
        options={carrierFilters}
        onChange={setCarrierFilter}
        renderLabel={renderCarrierFilterLabel}
      />

      <View style={styles.productList}>
        {filteredProducts.length ? (
          filteredProducts.map((product) => (
            <TopUpAmountCard
              key={product.id}
              product={product}
              selected={product.id === selectedProductId}
              onPress={() => onSelect(product)}
            />
          ))
        ) : (
          <Text style={styles.emptyText}>{emptyMessage ?? t('noProductsAvailableForThisCarrierYet')}</Text>
        )}
      </View>
    </View>
  );
}

function renderCarrierFilterLabel(value: CarrierFilter) {
  return value;
}

function formatAmount(value: number) {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.sm,
  },
  searchBlock: {
    gap: 6,
  },
  searchInput: {
    minHeight: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.light.text,
  },
  productList: {
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
});
