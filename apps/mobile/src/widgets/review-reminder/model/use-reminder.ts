import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';

import { useGetItems } from '@/entities/lexical-item/api/item.api';
import {
  DEFAULT_REMINDER,
  cancelReminders,
  hasReminderPermission,
  readReminder,
  requestReminderPermission,
  saveReminder,
  scheduleReminders,
  type ReminderSetting,
  type ReminderTime,
} from '@/shared/notifications/reminder';
import { planReminders } from '../lib/plan';

/**
 * 앱을 열 때마다(그리고 서랍이 바뀔 때마다) 이레치 예약을 새로 짠다.
 * 알림을 꺼 뒀거나 허락이 사라졌으면 아무것도 하지 않는다 — 허락을 *묻는* 일은
 * 켜는 순간(`useReminderSetting`)뿐이다.
 */
export function useReminderSync() {
  const { data: items } = useGetItems();

  useEffect(() => {
    if (!items) return;
    let live = true;

    (async () => {
      const setting = await readReminder();
      if (!live || !setting.enabled) return;
      if (!(await hasReminderPermission())) return;
      await scheduleReminders(planReminders(items, setting));
    })().catch(() => {
      /* 알림이 안 잡혀도 앱이 멈출 일은 아니다 */
    });

    return () => {
      live = false;
    };
  }, [items]);
}

/** 마이 탭의 켜기·끄기와 시각 고르기 */
export function useReminderSetting() {
  const { data: items = [] } = useGetItems();
  const [setting, setSetting] = useState<ReminderSetting>(DEFAULT_REMINDER);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    readReminder().then((value) => {
      if (!live) return;
      setSetting(value);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  const apply = useCallback(
    async (next: ReminderSetting) => {
      await saveReminder(next);
      setSetting(next);
      if (next.enabled) {
        await scheduleReminders(planReminders(items, next));
      } else {
        await cancelReminders();
      }
    },
    [items],
  );

  const toggle = useCallback(
    async (on: boolean) => {
      if (!on) return apply({ ...setting, enabled: false });

      const result = await requestReminderPermission();
      if (result === 'blocked') {
        /** 한 번 거절하면 시스템이 다시 묻지 않는다 — 설정 앱으로 안내한다 */
        Alert.alert(
          '알림이 꺼져 있어요',
          '설정에서 Reread의 알림을 허용하면 다시 볼 표현을 알려드릴 수 있어요.',
          [
            { text: '나중에', style: 'cancel' },
            { text: '설정 열기', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      await apply({ ...setting, enabled: true });
    },
    [apply, setting],
  );

  const setTime = useCallback(
    (time: ReminderTime) => apply({ ...setting, ...time }),
    [apply, setting],
  );

  return { setting, ready, toggle, setTime, hasItems: items.length > 0 };
}
