import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGetBook, useUpdateBook } from '@/entities/book/api/book.api';
import type { Book } from '@/entities/book/model/types';
import { color, gutter } from '@/shared/config';
import { ActionButton, ScreenHeader } from '@/shared/ui';
import { BookAdd, type BookDraft } from '@/widgets/book-add/ui/book-add';

/**
 * 책 고치기 — 책 화면의 ⋮에서 온다. 등록과 같은 폼을 쓴다.
 *
 * 한동안 등록한 책은 고칠 길이 없었다. 검색이 준 쪽수가 책과 다르거나, 장르가
 * 생기기 전에 등록한 책은 장르를 채울 수 없었다.
 *
 * '지금 몇 쪽'을 앞으로 옮기면 그 차이는 오늘 읽은 양으로 남는다(진도 기록과
 * 같다). 뒤로 옮기면 읽은 양에서 빼지는 않는다 — 어제 읽은 게 지워지면 안 된다.
 */
export default function BookEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: book } = useGetBook(id);

  /** 책을 받아온 다음에야 폼의 첫 값이 정해진다 — 그 전엔 폼을 세우지 않는다 */
  return book ? (
    <EditForm book={book} />
  ) : (
    <View style={styles.screen}>
      <ActivityIndicator style={styles.spinner} color={color.text.assistive} />
    </View>
  );
}

function EditForm({ book }: { book: Book }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const update = useUpdateBook(book.id);
  const [draft, setDraft] = useState<BookDraft>({
    title: book.title,
    author: book.author,
    pages: book.pages ? String(book.pages) : '',
    currentPage: book.currentPage ? String(book.currentPage) : '',
    cover: book.cover,
    genre: book.genre,
  });

  const tooFar =
    Number(draft.pages) > 0 && Number(draft.currentPage) > Number(draft.pages);
  const ready =
    !tooFar &&
    draft.title.trim().length > 0 &&
    draft.author.trim().length > 0 &&
    Boolean(draft.genre);

  const save = async () => {
    if (!ready || update.isPending) return;
    try {
      await update.mutateAsync({
        title: draft.title.trim(),
        author: draft.author.trim(),
        pages: Number(draft.pages) || undefined,
        currentPage: Number(draft.currentPage) || 0,
        genre: draft.genre,
      });
      router.back();
    } catch (error) {
      Alert.alert(
        '고치지 못했어요',
        error instanceof Error ? error.message : '',
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        leading="back"
        onLeadingPress={() => router.back()}
        title="책 수정"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <BookAdd
          draft={draft}
          onChange={setDraft}
          tooFar={tooFar}
          heading="책 정보를 고쳐요"
          sub="쪽수나 장르가 책과 다르면 여기서 맞춰요"
          focusTitle={false}
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        <ActionButton
          label="저장하기"
          disabled={!ready}
          loading={update.isPending}
          onPress={save}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface.base },
  spinner: { paddingTop: 80 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 24 },
  footer: { paddingHorizontal: gutter, paddingTop: 12 },
});
