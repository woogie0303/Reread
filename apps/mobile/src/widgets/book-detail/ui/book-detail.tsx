import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { Book } from '@/entities/book/model/types';
import type { ReadingProgress } from '@/entities/reading/model/types';
import { useGetBookSentenceFeed } from '@/entities/sentence/api/feed.api';
import { useGetLikedSentences } from '@/entities/sentence/api/sentence.api';
import { SentenceCard } from '@/entities/sentence/ui/sentence-card';
import { color } from '@/shared/config';
import { EmptyState } from '@/shared/ui';
import { BookHero } from '@/widgets/book-hero/ui/book-hero';
import { BookPrimer } from '@/widgets/book-primer/ui/book-primer';
import { SentenceShelf } from '@/widgets/sentence-shelf/ui/sentence-shelf';
import { BookTabs, type BookTab } from './book-tabs';

/**
 * 책 한 권. 읽은 데까지의 기록에 더해, **그냥 마음에 들어서 담아둔 문장**이
 * 여기에 산다 — 어휘 항목이 없는 문장은 서랍에 걸릴 데가 없기 때문이다. (Q25)
 *
 * 담은 표현과 마음에 든 문장은 탭으로 갈라 놓는다. '담은 표현'은 서랍의 같은 갈래와
 * 같은 줄(`SentenceCard`)이다 — 표현이 아니라 표현을 담은 **문장**이 서고 표현은 그
 * 안의 밑줄이다(ADR-0004). 이미 그 책 안이라 표지와 책 이름은 뺀다. 리텔링(챕터를 옮겨 적기)은
 * 걷어냈다 — 내 생각은 이제 문장마다 스레드처럼 달아 둔다(문장 화면).
 *
 * 머리는 홈의 '읽고 있는 책'과 같은 판(`widgets/book-hero`)을 쓴다. 홈에서
 * 누르고 들어온 그 책이 여기서 다른 모양으로 서 있으면, 같은 책에 도착했다는
 * 느낌이 끊긴다. 다만 찍기·적기 버튼은 머리에 두지 않는다 — 책 화면은 아래로
 * 길어져서, 화면이 화면 아래 고정 바(`BookActions`)로 세운다.
 */
export function BookDetail({
  book,
  initialTab,
  progress,
  onOpenSentence,
  onPressProgress,
}: {
  book: Book;
  /** 처음 펼 갈래 — 안 주면 담은 표현 */
  initialTab?: BookTab;
  progress?: ReadingProgress;
  /** liked — '마음에 들었던 문장' 갈래에서 눌렀는지. 문장 화면이 그걸 보고 모양을 고른다. */
  onOpenSentence?: (id: string, liked: boolean) => void;
  onPressProgress?: () => void;
}) {
  const [tab, setTab] = useState<BookTab>(initialTab ?? 'items');
  const { rows: claimed, isPending: claimedPending } = useGetBookSentenceFeed(
    book.id,
  );
  const { data: sentences = [] } = useGetLikedSentences(book.id);
  const liked = sentences.map((sentence) => ({
    id: sentence._id,
    text: sentence.text,
    page: sentence.page,
  }));

  return (
    <View style={styles.wrap}>
      <BookHero
        book={book}
        progress={progress}
        inset={0}
        onPressProgress={onPressProgress}
      />

      {/*
        머리 바로 아래는 '읽기 전에'의 자리다. 한동안 '담은 표현'이 여기 있었는데,
        비어 있을 때 빈 상태 문구가 화면에서 제일 좋은 자리를 차지했다 — 그리고
        담은 표현은 마음에 든 문장과 성격이 같아서 둘이 나란히 서는 게 맞다.
      */}
      {book.primer ? (
        <BookPrimer
          primer={book.primer}
          started={(progress?.currentPage ?? book.currentPage ?? 0) > 0}
        />
      ) : null}

      <View style={styles.tabs}>
        <BookTabs
          value={tab}
          onChange={setTab}
          counts={{ items: claimed.length, liked: liked.length }}
        />

        {tab === 'items' ? (
          claimedPending ? (
            <ActivityIndicator color={color.text.assistive} />
          ) : claimed.length ? (
            <View style={styles.list}>
              {claimed.map((row) => (
                <SentenceCard
                  key={row.id}
                  data={row}
                  inBook
                  showMet
                  onOpen={(id) => onOpenSentence?.(id, false)}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              mark="empty"
              compact
              title="아직 이 책에서 담은 표현이 없어요"
              body="막힌 문장을 물어보고 고른 표현이 여기 모여요."
            />
          )
        ) : liked.length ? (
          <SentenceShelf
            sentences={liked}
            title={null}
            onPressSentence={(id) => onOpenSentence?.(id, true)}
          />
        ) : (
          <EmptyState
            mark="empty"
            compact
            title="아직 마음에 든 문장이 없어요"
            body="뜻을 몰라서가 아니라 그냥 좋아서 담아둔 문장이 여기 모여요."
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 24 },
  tabs: { gap: 16 },
  /** 서랍 목록과 같은 간격 */
  list: { gap: 10 },
});
