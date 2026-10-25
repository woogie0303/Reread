/**
 * 광고. 네이티브 모듈(AdMob)이라 개발 빌드나 출시 빌드에서만 돈다 — Expo Go는 쓰지 않는다.
 *
 * 광고는 보상형 하나뿐이고, 이번 달 질문을 다 쓴 독자가 스스로 누를 때만 뜬다(ADR-0003).
 * 보상을 줄 수 없으면 `false`를 돌려주고, 부르는 쪽이 '지금은 광고가 없어요'라고 말한다.
 */
import mobileAds, {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

/** 광고가 이 시간 안에 안 불러와지면 포기한다 */
const LOAD_TIMEOUT_MS = 6000;

let started = false;

/**
 * AdMob 콘솔 → 개인정보 보호 및 메시지 → 테스트 기기에 등록한 기기 ID.
 * 실기기에서 실제 광고 단위로 테스트할 때 계정 정지를 막는다.
 * 기기 ID는 AdMob SDK 로그("Use RequestConfiguration.Builder...") 또는
 * 콘솔 → 테스트 기기 → 기기 ID에서 확인한다.
 */
const TEST_DEVICE_IDS: string[] =
  process.env.EXPO_PUBLIC_ADMOB_TEST_DEVICE_IDS
    ? process.env.EXPO_PUBLIC_ADMOB_TEST_DEVICE_IDS.split(',').map((s) =>
        s.trim(),
      )
    : [];

/** 광고를 처음 부르기 전에 SDK를 깨운다. 한 번만. */
async function start() {
  if (started) return;
  started = true;
  try {
    if (TEST_DEVICE_IDS.length) {
      await mobileAds().setRequestConfiguration({ testDeviceIdentifiers: TEST_DEVICE_IDS });
    }
    await mobileAds().initialize();
  } catch {
    started = false;
  }
}

/**
 * 개발 중에는 구글의 시험용 광고 단위를 쓴다 — 내 광고 단위로 개발하다 내 기기를
 * 누르면 계정이 정지될 수 있다. 출시 빌드는 `eas.json`의 env에서 온다.
 */
function unitId(): string | null {
  if (__DEV__) return TestIds.REWARDED;
  return process.env.EXPO_PUBLIC_ADMOB_REWARDED_ID || null;
}

/**
 * 한도를 다 쓴 독자가 보는 보상형 광고. 불러와 띄우고, 닫힐 때까지 기다린다.
 * 끝까지 봐서 보상을 받았으면 `true`. 중간에 닫았거나 광고가 없거나 어디서든
 * 실패하면 `false` — 보상을 주면 안 된다.
 */
export function showRewarded(): Promise<boolean> {
  const id = unitId();
  if (!id) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    void start().then(() => {
      const ad = RewardedAd.createForAdRequest(id, {
        requestNonPersonalizedAdsOnly: true,
      });

      let earned = false;
      const unsubscribe: (() => void)[] = [];
      const timer = setTimeout(() => finish(false), LOAD_TIMEOUT_MS);

      /** 한 번만 끝낸다 — 닫힘과 오류와 시간 초과가 겹쳐 와도 */
      let done = false;
      function finish(result: boolean) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        unsubscribe.forEach((off) => off());
        resolve(result);
      }

      unsubscribe.push(
        /** 보상형은 불러옴 이벤트가 따로 있다 — AdEventType.LOADED를 달면 라이브러리가 던진다 */
        ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
          /** 불러온 뒤에는 시간 초과로 끊지 않는다 — 광고가 떠 있는 동안이다 */
          clearTimeout(timer);
          ad.show().catch(() => finish(false));
        }),
        ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          earned = true;
        }),
        ad.addAdEventListener(AdEventType.ERROR, () => finish(false)),
        ad.addAdEventListener(AdEventType.CLOSED, () => finish(earned)),
      );
      ad.load();
    });
  });
}
