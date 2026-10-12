import type { ViewStyle } from 'react-native';

import type { Book } from '../model/types';
import { BookCover } from './book-cover';

/**
 * 목록 카드 왼쪽에 서는 작은 표지. 라벨 없이 "이건 그 책에서 온 것"이라고만 말한다.
 *
 * 예전엔 이 자리에 4px 책등 색 띠(`SpineEdge`)가 섰다. 표지가 들어오기 전의
 * 대안이었고, 색 띠로는 어느 책인지 기억해야 알 수 있었다 — 표지는 보면 안다.
 * 표지가 없는 책(직접 적은 책, 표지 없는 검색 결과)은 `BookCover`가 책을 읽는
 * 캐릭터로 채운다.
 *
 * 크기는 문장 카드마다 같다. 카드마다 다르면 목록을 넘길 때 표지 줄이 흔들린다.
 */
export function CoverThumb({ book, style }: { book: Book; style?: ViewStyle }) {
  return (
    <BookCover
      book={book}
      width={36}
      height={52}
      radius={5}
      style={style}
    />
  );
}
