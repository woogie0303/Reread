import { useRef, useState, type ReactElement } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, gutter, type } from '@/shared/config';
import { ActionButton, AppText, Tap } from '@/shared/ui';
import { PickDemo } from './pick-demo';
import { AskPreview } from './ask-demo';
import { ReunionPreview } from './previews';

type Slide = {
  title: string;
  body: string;
  preview: ReactElement;
};

/**
 * 이 앱이 하는 일을 세 걸음으로 — 찍어서 담고, 문장째로 묻고, 다시 만나면 이어준다.
 * 마지막이 이 앱이 있는 이유라서, 앞의 둘은 거기까지 가는 길이다.
 *
 * 말은 로그인 화면의 한 줄("원서를 읽다 막힌 문장을 담아두면, 나중에 다시 만날 때
 * 이어드려요")이 약속한 것을 하나씩 풀어서 보여주는 것이다. 사진이 기기 밖으로 나가지
 * 않는다는 말은 사실이다(글자 인식은 기기 안에서 한다).
 */
const SLIDES: Slide[] = [
  {
    title: '읽던 쪽을 찍고\n막힌 문장을 짚어요',
    body: '사진 위에서 모르는 단어를 누르고, 여러 단어로 된 표현은 손가락으로 끌어서 골라요. 사진은 기기 밖으로 나가지 않아요.',
    preview: <PickDemo />,
  },
  {
    title: '단어가 아니라\n문장으로 물어요',
    body: '그 문장 안에서의 뜻만 알려드려요. 뜻은 눌러야 열리니, 먼저 스스로 읽어 볼 수 있어요.',
    preview: <AskPreview />,
  },
  {
    title: '다시 만나면\n이어드려요',
    body: '예전에 헷갈린 표현을 다른 책에서 또 만나면, 처음 만난 문장과 나란히 보여드려요. 단어장이 아니라, 내가 어디서 헷갈렸는지 기억하는 앱이에요.',
    preview: <ReunionPreview />,
  },
];

/**
 * 처음 온 독자에게 한 번 보여주는 안내. 건너뛸 수 있고(마지막 쪽만 빼고 — 거기엔 이미 끝이
 * 있다), 마이 탭에서 언제든 다시 열 수 있다.
 *
 * 쪽 넘김은 가로 스크롤 하나다. 라이브러리를 붙일 만큼 복잡하지 않고, 손가락으로 밀든
 * 버튼으로 넘기든 같은 길을 가야 해서 `index`는 스크롤이 끝난 자리에서 읽는다.
 */
export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const next = () => {
    if (last) return onFinish();
    const to = index + 1;
    setIndex(to);
    scroll.current?.scrollTo({ x: to * width, animated: true });
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <AppText style={styles.wordmark}>Reread</AppText>
        {/* 마지막 쪽에서는 숨기되 자리는 남긴다 — 글자가 나타났다 사라지며 머리가 흔들리지 않게 */}
        <Tap
          onPress={onFinish}
          disabled={last}
          accessibilityRole="button"
          accessibilityLabel="안내 건너뛰기"
          style={[styles.skip, last ? styles.hidden : null]}
        >
          <AppText style={styles.skipLabel}>건너뛰기</AppText>
        </Tap>
      </View>

      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={settle}
        style={styles.pager}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={[styles.page, { width }]}>
            <View
              style={styles.preview}
              importantForAccessibility="no-hide-descendants"
            >
              {slide.preview}
            </View>
            <View style={styles.copy}>
              <AppText style={styles.title}>{slide.title}</AppText>
              {/* 한글은 단어 단위로 줄을 바꾼다 — 기본값은 '담겨/요'처럼 단어 가운데서 끊는다 */}
              <AppText style={styles.body} lineBreakStrategyIOS="hangul-word">
                {slide.body}
              </AppText>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <View
          style={styles.dots}
          accessible
          accessibilityLabel={`${SLIDES.length}쪽 중 ${index + 1}쪽`}
        >
          {SLIDES.map((slide, i) => (
            <View
              key={slide.title}
              style={[styles.dot, i === index ? styles.dotOn : null]}
            />
          ))}
        </View>
        <ActionButton label={last ? '시작하기' : '다음'} onPress={next} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface.base },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingBottom: 8,
  },
  wordmark: {
    ...type.title2,
    fontSize: 22,
    letterSpacing: -0.66,
    color: color.text.primary,
  },
  skip: { paddingVertical: 8, paddingLeft: 16 },
  skipLabel: { ...type.label1, color: color.text.secondary },
  hidden: { opacity: 0 },

  pager: { flex: 1 },
  page: {
    flex: 1,
    paddingHorizontal: gutter,
    justifyContent: 'center',
    gap: 28,
  },
  preview: { justifyContent: 'center' },
  copy: { gap: 12 },
  title: { ...type.title2, color: color.text.primary },
  body: { ...type.body1Reading, color: color.text.secondary },

  footer: { paddingHorizontal: gutter, gap: 20 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.border.strong,
  },
  dotOn: { width: 18, backgroundColor: color.primary },
});
