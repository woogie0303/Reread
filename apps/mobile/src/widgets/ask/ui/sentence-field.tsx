import { StyleSheet, TextInput, View } from 'react-native';

import { color, family } from '@/shared/config';
import { CameraIcon, PageIcon, PageInput, Tap } from '@/shared/ui';

/**
 * 물어볼 문장을 적는 곳. 책에서 온 영어라 입력창 안에서도 세리프다 —
 * 여기서 산세리프로 바뀌면 내가 쓴 말과 책의 말이 구별되지 않는다.
 *
 * 왼쪽 아래에 카메라와 쪽수가 나란히 선다. 옮겨 적으려고 책을 편 그 순간이
 * 몇 쪽인지 가장 잘 아는 때라, 따로 기록하러 가지 않고 여기서 적게 한다.
 * 쪽수는 꼭 적어야 해서 처음부터 'p.' 칸으로 펴져 있고, 미리 채워 두지 않는다.
 */
export function SentenceField({
  value,
  onChangeText,
  onCapture,
  page,
  onChangePage,
}: {
  value: string;
  onChangeText?: (next: string) => void;
  onCapture?: () => void;
  /** 이 문장이 있는 쪽 — 숫자만 */
  page?: string;
  onChangePage?: (next: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          multiline
          placeholder="막힌 문장을 그대로 옮겨 적어보세요"
          placeholderTextColor={color.text.assistive}
          style={styles.input}
        />
        <View style={styles.tools}>
          <Tap
            style={styles.camera}
            hitSlop={4}
            onPress={onCapture}
            accessibilityRole="button"
            accessibilityLabel="읽던 쪽 촬영"
          >
            <CameraIcon size={19} color={color.text.onInk} />
          </Tap>

          {onChangePage ? (
            <View style={styles.pageOpen}>
              <PageIcon size={17} color={color.primary} />
              <PageInput value={page ?? ''} onChangeValue={onChangePage} />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },

  field: {
    minHeight: 148,
    borderRadius: 20,
    backgroundColor: color.surface.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border.default,
    padding: 18,
    paddingBottom: 60,
  },
  input: {
    fontFamily: family.serif,
    fontSize: 17,
    lineHeight: 27,
    color: color.text.primary,
    textAlignVertical: 'top',
    flex: 1,
  },
  tools: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  camera: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: color.surface.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageOpen: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 10,
    paddingRight: 6,
    borderRadius: 11,
    backgroundColor: color.primaryTint,
  },
});
