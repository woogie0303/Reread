import { ScrollView, StyleSheet, View } from 'react-native';

import type { ItemSummary } from '@/entities/lexical-item/api/item.api';
import { ItemCard } from '@/entities/lexical-item/ui/item-card';
import { SectionHeader } from '@/shared/ui';

/**
 * 한 책에서 담은 표현들. 훑어보는 것이지 하나씩 읽어 내려가는 것이 아니다 —
 * 하나씩 보는 곳은 서랍이다.
 *
 * 두 가지로 놓는다.
 * - `rail`: 가로로 흘린다. 다른 것과 함께 서는 화면에서 자리를 적게 쓴다.
 * - `grid`: 두 줄 격자. 책 화면처럼 이 표현들이 화면의 몸통일 때 쓴다. 한동안 책
 *   화면도 가로로 흘렸는데, 카드 두 장 반만 보이고 화면 아래 절반이 비어 있었다 —
 *   나머지는 옆으로 밀어야 있는 줄 알았다. 다 펴 두면 몇 개를 담았는지가 그대로 보인다.
 */
export function ItemShelf({
  items,
  title = '이 책에서 담은 표현',
  onPressItem,
  layout = 'rail',
  /** 부모의 좌우 여백 — 카드가 화면 오른쪽으로 흘러나가게 상쇄한다 */
  bleed = 20,
}: {
  items: ItemSummary[];
  /** null이면 제목을 그리지 않는다 — 탭 라벨이 이미 이름을 대고 있을 때 */
  title?: string | null;
  onPressItem?: (id: string) => void;
  layout?: 'rail' | 'grid';
  bleed?: number;
}) {
  return (
    <View style={styles.wrap}>
      {title !== null ? (
        <SectionHeader title={title} aside={`${items.length}개`} />
      ) : null}
      {layout === 'grid' ? (
        <View style={styles.grid}>
          {pairs(items).map(([left, right]) => (
            <View key={left.id} style={styles.gridRow}>
              <ItemCard
                item={left}
                style={styles.cell}
                onPress={() => onPressItem?.(left.id)}
              />
              {right ? (
                <ItemCard
                  item={right}
                  style={styles.cell}
                  onPress={() => onPressItem?.(right.id)}
                />
              ) : (
                /* 홀수면 빈 칸이 자리를 지켜 마지막 카드가 두 칸으로 늘어나지 않는다 */
                <View style={styles.cellEmpty} />
              )}
            </View>
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginRight: -bleed }}
          contentContainerStyle={[styles.rail, { paddingRight: bleed }]}
        >
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onPress={() => onPressItem?.(item.id)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function pairs<T>(list: T[]): [T, T | undefined][] {
  const rows: [T, T | undefined][] = [];
  for (let i = 0; i < list.length; i += 2) rows.push([list[i], list[i + 1]]);
  return rows;
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  rail: { gap: 10 },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  cell: { flex: 1, width: undefined },
  cellEmpty: { flex: 1 },
});
