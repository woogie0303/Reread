import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGetBook, useCurrentBook } from '@/entities/book/api/book.api';
import { usePatchProgress } from '@/entities/reading/api/reading.api';
import { color, gutter, type } from '@/shared/config';
import {
  ActionButton,
  AppText,
  ProgressBar,
  Quote,
  ScreenHeader,
} from '@/shared/ui';

/**
 * 읽은 데까지 표시 옮기기.
 *
 * 이 화면이 이번 주 막대를 채운다. 읽은 양을 따로 적게 하지 않고 진도만
 * 옮기게 하는 이유는, 읽고 나서 한 번 더 적게 만들면 아무도 적지 않기 때문이다.
 */
export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bookId } = useLocalSearchParams<{ bookId?: string }>();
  const { data: book } = useGetBook(bookId);
  const { data: reading } = useCurrentBook();
  const update = usePatchProgress(bookId ?? '');
  /**
   * 지난번에 적은 쪽이 먼저 들어가 있다 — 대개 거기서 조금 더 읽었으니 끝자리만
   * 고치면 된다. 손대기 전까지는 책이 불러와지는 대로 그 값을 따른다.
   */
  const last =
    (reading?.book.id === bookId ? reading?.progress.currentPage : undefined) ??
    book?.currentPage ??
    0;
  const [edited, setPage] = useState<string>();
  const page = edited ?? (last > 0 ? String(last) : '');

  const typed = Number(page);
  const total = book?.pages ?? 0;
  const valid =
    Number.isFinite(typed) && typed > 0 && (total === 0 || typed <= total);
  /** 적긴 적었는데 이 책에 없는 쪽수 — 빈칸과 달리 이건 이유를 말해줘야 한다 */
  const tooFar = total > 0 && Number.isFinite(typed) && typed > total;

  const save = async () => {
    if (!valid || !bookId) return;
    await update.mutateAsync(typed);
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        leading="close"
        onLeadingPress={() => router.back()}
        title="읽은 데까지"
      />

      <View style={styles.body}>
        {book ? (
          <View style={styles.head}>
            <Quote numberOfLines={1} style={styles.title}>
              {book.title}
            </Quote>
            <ProgressBar
              value={total ? Math.min(1, (typed || 0) / total) : 0}
            />
          </View>
        ) : null}

        <View style={styles.field}>
          <TextInput
            value={page}
            onChangeText={setPage}
            keyboardType="number-pad"
            autoFocus
            selectTextOnFocus
            placeholder="0"
            placeholderTextColor={color.text.assistive}
            style={styles.input}
          />
          <AppText style={styles.unit}>
            {total ? `/ ${total} 쪽` : '쪽'}
          </AppText>
        </View>

        {/* 버튼이 흐려진 이유는 버튼이 아니라 여기가 말한다 */}
        <AppText style={[styles.hint, tooFar ? styles.hintWarn : null]}>
          {tooFar && `이 책은 ${total}쪽까지예요. 그 안의 쪽수를 적어주세요.`}
        </AppText>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <ActionButton
          label="여기까지 읽었어요"
          disabled={!valid}
          loading={update.isPending}
          onPress={save}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface.base },
  body: { flex: 1, paddingHorizontal: gutter, paddingTop: 12, gap: 24 },
  head: { gap: 10 },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    color: color.text.primary,
  },
  field: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  input: {
    ...type.title2,
    fontSize: 44,
    lineHeight: 52,
    color: color.text.primary,
    minWidth: 100,
  },
  unit: { ...type.body1, color: color.text.meta },
  hint: { ...type.label2, color: color.text.secondary, lineHeight: 21 },
  hintWarn: { color: color.status.cautionary },
  footer: { paddingHorizontal: gutter, paddingTop: 12 },
});
