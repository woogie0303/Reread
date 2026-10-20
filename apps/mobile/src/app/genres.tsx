import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import {
  useGetGenreStats,
  useGetReadingMonth,
  useGetReadingRange,
  useGetReadingWeek,
} from '@/entities/reading/api/reading.api';
import { color, gutter, type } from '@/shared/config';
import { AppText, EmptyState, ScreenHeader } from '@/shared/ui';
import { GenreCloud } from '@/widgets/genre-cloud/ui/genre-cloud';
import { ReadingCalendar } from '@/widgets/reading-calendar/ui/reading-calendar';

/**
 * 읽기 기록 — 홈의 이번 주 그래프를 누르면 온다.
 *
 * 이번 주 그래프는 '요즘 읽고 있나' 하나만 말한다. 여기서는 그걸 둘로 푼다 —
 * 무엇을 즐겨 읽는지(장르), 언제 읽는지(읽은 날 달력). 위의 숫자 둘(총 쪽수·
 * 연속 일수)은 그 둘을 보기 전에 먼저 와닿아야 하는 요약이다.
 *
 * 장르는 전 기록을 본다 — 취향은 오래 쌓여야 보인다. 달력은 한 달씩, 독자가
 * 이전·다음으로 옮겨 본다 — 가입한 달부터 이번 달까지.
 *
 * 화면 전체를 도는 표시로 덮는 건 **처음 한 번뿐**이다. 달을 옮길 때는 달력만
 * 제 칸을 먼저 세우고 짙기를 나중에 채운다(`ReadingCalendar`) — 한때 달을 넘길
 * 때마다 화면 전체가 도는 표시로 바뀌어서, 위의 숫자와 장르까지 깜박였다.
 */
export default function ReadingReportScreen() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const genres = useGetGenreStats();
  const calendar = useGetReadingMonth(year, month);
  const { data: range } = useGetReadingRange();
  const { data: week } = useGetReadingWeek();

  const shares = genres.data ?? [];
  const allPages = shares.reduce((sum, share) => sum + share.pages, 0);
  const top = shares.filter((share) => share.genre !== '장르 없음')[0];

  /** 달 비교는 year*12+month 한 수로 — 해가 바뀌는 12월→1월에도 그대로 맞는다 */
  const here = year * 12 + month;
  const canPrev = range
    ? here > range.first.year * 12 + range.first.month
    : false;
  const canNext = range
    ? here < range.last.year * 12 + range.last.month
    : false;

  const prevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const nextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        leading="back"
        onLeadingPress={() => router.back()}
        title="읽기 기록"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        style={styles.scroll}
      >
        {genres.isPending ? (
          <ActivityIndicator
            style={styles.spinner}
            color={color.text.assistive}
          />
        ) : !allPages ? (
          <EmptyState
            mark="no-history"
            title="아직 읽은 기록이 없어요"
            body="읽은 데까지 표시를 옮기면 그만큼이 여기 쌓여요."
          />
        ) : (
          <>
            <View style={styles.stats}>
              <Stat value={`${allPages}쪽`} label="총 읽은 쪽수" />
              <View style={styles.statRule} />
              <Stat value={`${week?.streak ?? 0}일`} label="연속으로 읽음" />
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <AppText style={styles.sectionTitle}>주로 읽은 장르</AppText>
              {top ? (
                <GenreCloud shares={shares} />
              ) : (
                <AppText style={styles.quiet}>
                  장르를 정한 책이 아직 없어요. 책을 등록할 때 장르를 고르면
                  여기 모여요.
                </AppText>
              )}
            </View>

            <View style={styles.divider} />

            <ReadingCalendar
              year={year}
              month={month}
              days={calendar.data}
              canPrev={canPrev}
              canNext={canNext}
              onPrevMonth={prevMonth}
              onNextMonth={nextMonth}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <AppText style={styles.statValue}>{value}</AppText>
      <AppText style={styles.statLabel}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface.base },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: gutter,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 24,
  },
  spinner: { paddingTop: 40 },

  stats: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { ...type.heading2, fontWeight: '700', color: color.text.primary },
  statLabel: { ...type.caption2, color: color.text.meta, textAlign: 'center' },
  statRule: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: color.border.default,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border.default,
  },

  section: { gap: 16 },
  sectionTitle: { ...type.heading2, color: color.text.primary },

  quiet: { ...type.label2, lineHeight: 20, color: color.text.secondary },
});
