/**
 * `app.json` 위에 얹는 동적 설정.
 *
 * 카카오·네이버·구글은 이제 네이티브 SDK가 아니라 브라우저 동의 화면 +
 * 서버 콜백으로 로그인한다(`shared/session/oauth.ts`) — 앱 번들에 넣을 키가
 * 없다. Apple만 여전히 네이티브 권한(`com.apple.developer.applesignin`)이 필요하고,
 * 이 앱은 그것을 늘 넣는다. 다른 소셜 로그인을 내면 Apple 로그인도 함께 내야 한다
 * (심사 지침 4.8). 그 권한은 **유료 개발자 계정**에서만 프로비저닝되므로, 빌드는 늘
 * 유료 계정으로 서명해야 한다.
 */
const {
  createRunOncePlugin,
  withDangerousMod,
} = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

/**
 * 출시 빌드(`eas build --profile production`)에서 빠지면 **조용히 망가지는** 값들을
 * 빌드 시작 전에 막는다. EAS 클라우드 빌드는 gitignore된 `.env`를 못 받아서 이 값들이
 * 비어 있기 쉽고, 비어 있으면 앱은 오류 없이 이렇게 된다:
 *   - API 주소 없음 → 개발 서버 주소를 추측해 서버에 못 붙는다
 * EAS가 빌드 때 `EAS_BUILD_PROFILE`을 채워 주므로 개발 빌드와 로컬에서는 돌지 않는다.
 */
if (['production', 'testflight'].includes(process.env.EAS_BUILD_PROFILE)) {
  const missing = [
    ['EXPO_PUBLIC_API_URL', '서버 주소 (eas.json의 production env)'],
    [
      'EXPO_PUBLIC_SENTRY_DSN',
      '오류 수집 주소 (EAS 환경 변수 — 없으면 충돌이 어디에도 남지 않는다)',
    ],
    [
      'EXPO_PUBLIC_ADMOB_IOS_APP_ID',
      'AdMob iOS 앱 ID (구글 시험용 ID로는 출시 못 한다)',
    ],
    ['EXPO_PUBLIC_ADMOB_REWARDED_ID', '한도 소진 뒤 보상형 광고 단위 ID'],
  ].filter(([key]) => !process.env[key]);
  if (missing.length) {
    throw new Error(
      '출시 빌드에 필요한 값이 없어요:\n' +
        missing.map(([key, why]) => `  - ${key}: ${why}`).join('\n'),
    );
  }
}

/**
 * AdMob 앱 ID. 빠지면 앱이 **켜지자마자 죽는다**(SDK가 ID 없이 시작하지 않는다) —
 * 그래서 개발 빌드는 구글이 공개한 시험용 앱 ID로 채운다. 출시 빌드는 위 검사가
 * 진짜 ID가 없으면 빌드 전에 막는다.
 */
const ADMOB_TEST_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

/**
 * 일부 Pod(Google-Mobile-Ads, RNSVG 등)의 리소스 번들은 배포 대상이 12.0·12.4로 남아 있다.
 * 새 Xcode는 15.0 미만을 받지 않아서(`supported deployment target versions is 15.0 to 27.0`)
 * 빌드가 시작도 못 하고 죽는다. `prebuild --clean`이 Podfile을 다시 만들 때마다 지워지지
 * 않도록 post_install에 올리는 줄을 플러그인으로 넣는다.
 */
const withPodDeploymentFloor = (config) =>
  withDangerousMod(config, [
    'ios',
    (c) => {
      const file = path.join(c.modRequest.platformProjectRoot, 'Podfile');
      let podfile = fs.readFileSync(file, 'utf8');
      if (podfile.includes('REREAD_POD_FLOOR')) return c;
      const patch = `    # REREAD_POD_FLOOR: 오래된 배포 대상을 Xcode가 받아주는 15.0으로 올린다
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |bc|
        current = bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current && Gem::Version.new(current) < Gem::Version.new('15.0')
          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
        end
      end
    end
`;
      podfile = podfile.replace(
        /(react_native_post_install\([\s\S]*?\n    \)\n)/,
        (m) => m + patch,
      );
      fs.writeFileSync(file, podfile);
      return c;
    },
  ]);

module.exports = ({ config }) => {
  return withPodDeploymentFloor({
    ...config,
    ios: { ...config.ios, usesAppleSignIn: true },
    plugins: [
      ...(config.plugins ?? []),
      'expo-apple-authentication',
      /**
       * 복습 알림은 **기기 안에서 예약하는 로컬 알림**이라 서버가 보내는 푸시(APNs)가
       * 필요 없다. 그런데 `expo-notifications` 플러그인은 설치돼 있기만 하면
       * `aps-environment` 권한을 무조건 넣고, 그 권한도 유료 개발자 계정이 있어야
       * 프로비저닝된다. 로컬 알림에는 그 권한이 필요 없으니, 설정에서 빼는 것만으로는
       * 막히지 않는다(Expo가 설치된 플러그인을 알아서 붙인다) — 같은 이름의 빈 플러그인을
       * 먼저 걸어 '이미 돌았음'을 남겨 자동 적용을 건너뛰게 한다.
       * 서버 푸시를 붙이는 날 이 줄을 지우고 플러그인을 켠다.
       */
      createRunOncePlugin((c) => c, 'expo-notifications'),
      [
        'react-native-google-mobile-ads',
        {
          iosAppId:
            process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID ?? ADMOB_TEST_IOS_APP_ID,
          /** 맞춤 광고를 요청하지 않으므로(requestNonPersonalizedAdsOnly) 추적 허용 창은 띄우지 않는다 */
        },
      ],
    ],
  });
};
