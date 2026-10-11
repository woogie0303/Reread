import { Image } from 'expo-image';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { color } from '@/shared/config';
import { Mark } from '@/shared/ui';
import type { Book } from '../model/types';

/**
 * 표지 이미지가 있으면 그것을, 없거나 못 받아오면 책을 읽는 캐릭터를 세운다.
 *
 * 한동안은 표지가 없는 자리를 책마다 정한 책등 그라디언트로 채웠다. 색으로는 어느
 * 책인지 기억해야 알 수 있었고, 직접 적은 책이 늘수록 알록달록한 색 덩어리가 목록에
 * 섞여 표지 줄이 시끄러웠다. 표지가 없다는 사실은 숨길 일이 아니라 이 앱의 얼굴로
 * 채우면 되는 일이다 — 종이색 바탕 위의 캐릭터 하나로 통일한다.
 *
 * 캐릭터를 지우지 않고 이미지를 그 위에 덮는 이유는, 표지 주소가 있어도 못 받아오면
 * 빈 칸이 아니라 캐릭터가 보여야 해서다.
 */
export function BookCover({
  book,
  width,
  height,
  radius = 10,
  style,
}: {
  book: Book;
  width: number;
  height: number;
  radius?: number;
  style?: ViewStyle;
}) {
  /** 표지 비율(세로가 긴 직사각형) 안에서 가로를 기준으로 잡는다 */
  const markSize = Math.round(width * 0.78);

  return (
    <View
      style={[{ width, height, borderRadius: radius }, styles.cover, style]}
    >
      <Mark name="reading" size={markSize} />
      {book.cover ? (
        <Image
          source={{ uri: book.cover }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          accessibilityLabel={`${book.title} 표지`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: color.surface.alt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border.hairline,
  },
});
