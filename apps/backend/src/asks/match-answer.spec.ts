import { matchAnswer } from './match-answer';

const asked = [
  { text: 'She brushed it off, but it stayed.', picks: ['brushed it off'] },
  {
    text: 'I could not make out whether she had left.',
    picks: ['make out', 'whether'],
  },
];

describe('matchAnswer', () => {
  it('문장은 순서로, 표현은 되돌려 적은 surface로 짝짓는다', () => {
    const result = matchAnswer(asked, {
      sentences: [
        {
          translation: '그녀는 별일 아닌 듯 넘겼지만 마음에 남았다.',
          picks: [
            {
              surface: 'brushed it off',
              term: 'brush it off',
              meaning: '별일 아닌 듯 넘기다',
            },
          ],
        },
        {
          translation: '그녀가 떠났는지 알아볼 수 없었다.',
          /** 순서가 바뀌어 와도 surface로 맞춘다 */
          picks: [
            { surface: 'whether', term: 'whether', meaning: '~인지 아닌지' },
            { surface: 'Make out', term: 'make out', meaning: '알아보다' },
          ],
        },
      ],
    });

    expect(result[0]?.picks).toEqual([
      {
        surface: 'brushed it off',
        term: 'brush it off',
        meaning: '별일 아닌 듯 넘기다',
      },
    ]);
    expect(result[1]?.picks.map((pick) => pick.term)).toEqual([
      'make out',
      'whether',
    ]);
    /** 담을 때 쓰는 surface는 모델이 고친 꼴이 아니라 독자가 고른 꼴이다 */
    expect(result[1]?.picks[0].surface).toBe('make out');
  });

  it('surface를 고쳐 적어도 개수가 같으면 순서로 맞춘다', () => {
    const [first] = matchAnswer([asked[0]], {
      sentences: [
        {
          translation: '번역',
          picks: [
            { surface: 'brush off', term: 'brush it off', meaning: '뜻' },
          ],
        },
      ],
    });
    expect(first?.picks[0].term).toBe('brush it off');
  });

  it('고른 표현 하나라도 빠지면 그 문장은 답을 못 받은 것이다', () => {
    const result = matchAnswer(asked, {
      sentences: [
        {
          translation: '번역',
          picks: [
            { surface: 'brushed it off', term: 'brush it off', meaning: '뜻' },
          ],
        },
        {
          translation: '번역',
          picks: [{ surface: 'make out', term: 'make out', meaning: '뜻' }],
        },
      ],
    });
    expect(result[0]).not.toBeNull();
    expect(result[1]).toBeNull();
  });

  it('문장이 모자라게 오면 모자란 문장만 답을 못 받는다', () => {
    const result = matchAnswer(asked, {
      sentences: [
        {
          translation: '번역',
          picks: [
            { surface: 'brushed it off', term: 'brush it off', meaning: '뜻' },
          ],
        },
      ],
    });
    expect(result[0]).not.toBeNull();
    expect(result[1]).toBeNull();
  });

  it('고른 표현이 없던 예전 질문은 번역만 받는다', () => {
    const [only] = matchAnswer([{ text: 'Old question.', picks: [] }], {
      sentences: [{ translation: '예전 질문.', picks: [] }],
    });
    expect(only).toEqual({ translation: '예전 질문.', picks: [] });
  });
});

describe('matchAnswer — 이미 번역이 있는 문장', () => {
  it('모델이 번역을 비워 와도 전에 받은 번역을 그대로 쓴다', () => {
    const [first] = matchAnswer(
      [{ ...asked[0], knownTranslation: '전에 받은 번역' }],
      {
        sentences: [
          {
            translation: '',
            picks: [
              {
                surface: 'brushed it off',
                term: 'brush it off',
                meaning: '뜻',
              },
            ],
          },
        ],
      },
    );
    expect(first?.translation).toBe('전에 받은 번역');
  });

  it('번역에 실제로 있는 translationSpan만 남기고, 없는 글자는 버린다', () => {
    const result = matchAnswer(asked, {
      sentences: [
        {
          translation: '그녀는 별일 아닌 듯 넘겼지만 마음에 남았다.',
          picks: [
            {
              surface: 'brushed it off',
              term: 'brush it off',
              meaning: '별일 아닌 듯 넘기다',
              translationSpan: '별일 아닌 듯 넘겼지만',
            },
          ],
        },
        {
          translation: '그녀가 떠났는지 알아볼 수 없었다.',
          picks: [
            {
              surface: 'make out',
              term: 'make out',
              meaning: '알아보다',
              /** 번역에 없는 글자 — 어미를 바꿔 적었다 */
              translationSpan: '알아봤다',
            },
            {
              surface: 'whether',
              term: 'whether',
              meaning: '~인지 아닌지',
              translationSpan: '떠났는지',
            },
          ],
        },
      ],
    });

    expect(result[0]?.picks[0].translationSpan).toBe('별일 아닌 듯 넘겼지만');
    expect(result[1]?.picks[0].translationSpan).toBeUndefined();
    expect(result[1]?.picks[1].translationSpan).toBe('떠났는지');
  });
});
