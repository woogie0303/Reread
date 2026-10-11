import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCreateBook } from '@/entities/book/api/book.api';
import type { Genre } from '@/shared/api/types';
import { color, gutter } from '@/shared/config';
import { ActionButton, ScreenHeader } from '@/shared/ui';
import { BookAdd, type BookDraft } from '@/widgets/book-add/ui/book-add';

type Params = {
  title?: string;
  author?: string;
  pages?: string;
  cover?: string;
  genre?: Genre;
};

/**
 * 02 책 등록 — 읽고 있는 책을 서가에 들인다.
 *
 * 검색에서 골라 넘어왔으면 값이 이미 채워져 있다. 그래도 손을 대지 못하게
 * 막지 않는다 — 검색 결과의 저자 표기나 쪽수가 책과 다를 때가 있고, 그건
 * 여기서 눈으로 보고 고칠 수 있어야 한다.
 *
 * **장르도 꼭 고른다.** 검색(카카오·Open Library)은 장르를 주지 않으니 여기서
 * 고른다 — '장르별로 얼마나 읽었는지' 그래프가 이 값에 기댄다.
 *
 * **전체 쪽수는 꼭 적는다.** 문장을 담을 때 쪽수가 그 책 안에 있는지 여기서
 * 정한 값으로 가리고, 진도도 이 값을 기준으로 퍼센트를 보여준다. 검색 결과에
 * 쪽수가 없는 책(주로 절판되었거나 정보가 부족한 책)은 여기서 손으로 채워야
 * 등록할 수 있다 — 나중에 다시 채우게 미루면 그사이 쪽수 없는 문장이 쌓인다.
 */
export default function BookAddScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const [draft, setDraft] = useState<BookDraft>({
    title: params.title ?? '',
    author: params.author ?? '',
    pages: params.pages ?? '',
    currentPage: '',
    cover: params.cover,
    genre: params.genre,
  });
  const create = useCreateBook();

  /** 제목·지은이·전체 쪽수가 있어야 시작할 수 있다 — 지금 몇 쪽인지는 없어도 된다 */
  /** 전체 쪽수보다 더 읽을 수는 없다 — 서버도 한 번 더 막는다 */
  const tooFar =
    Number(draft.pages) > 0 && Number(draft.currentPage) > Number(draft.pages);
  const ready =
    !tooFar &&
    draft.title.trim().length > 0 &&
    draft.author.trim().length > 0 &&
    Number(draft.pages) > 0 &&
    Boolean(draft.genre);

  const save = async () => {
    if (!ready) return;
    try {
      const book = await create.mutateAsync({
        title: draft.title.trim(),
        author: draft.author.trim(),
        pages: Number(draft.pages),
        currentPage: Number(draft.currentPage) || undefined,
        cover: draft.cover,
        genre: draft.genre,
      });
      /** 등록하고 나면 그 책으로 들어간다 — 담기 시작하는 자리가 거기다 */
      router.replace({ pathname: '/book/[id]', params: { id: book._id } });
    } catch (error) {
      Alert.alert(
        '책을 들이지 못했어요',
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
        title="책 추가"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <BookAdd draft={draft} onChange={setDraft} tooFar={tooFar} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        <ActionButton
          label="이 책 읽고 있어요"
          disabled={!ready}
          loading={create.isPending}
          onPress={save}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface.base },
  scroll: { flex: 1 },
  content: { paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 24 },
  footer: { paddingHorizontal: gutter, paddingTop: 12 },
});
