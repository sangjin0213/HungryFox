const isBlank = value => value.trim() === '';

export const KINDS = {
  line:     { isEmpty: isBlank },
  text:     { isEmpty: isBlank },
  list:     { isEmpty: items => items.every(isBlank) },
  pairList: { isEmpty: pairs => pairs.every(pair => pair.every(isBlank)) }, // pair = [좌, 우]
  rating:   { max: 5, isEmpty: score => score === 0 },
  tags:     { isEmpty: tags => tags.length === 0 },
  url:      { isEmpty: isBlank }
};

export const BLOCK_TYPES = {
  book: {
    label: '책 정보',
    once: true,
    fields: [
      { key: 'title', kind: 'line', placeholder: '책 제목' },
      { key: 'author', kind: 'line', placeholder: '지은이' },
      { key: 'storeUrl', kind: 'url', placeholder: '서점 링크' }
    ],
    create: () => ({ title: '', author: '', storeUrl: '' })
  },
  heading: {
    label: '소제목',
    once: false,
    fields: [{ key: 'text', kind: 'line', placeholder: '소제목' }],
    create: () => ({ text: '' })
  },
  summary: {
    label: '요점 정리',
    once: false,
    fields: [{ key: 'items', kind: 'list', placeholder: '핵심 항목' }],
    create: () => ({ items: ['', '', ''] })
  },
  impression: {
    label: '느낀 점',
    once: false,
    fields: [{ key: 'body', kind: 'text', placeholder: '느낀 점' }],
    create: () => ({ body: '' })
  },
  quote: {
    label: '인용',
    once: false,
    fields: [
      { key: 'body', kind: 'text', placeholder: '인용 문장' },
      { key: 'page', kind: 'line', placeholder: '쪽수' }
    ],
    create: () => ({ body: '', page: '' })
  },
  concept: {
    label: '개념 정리',
    once: false,
    fields: [{ key: 'pairs', kind: 'pairList', placeholder: ['개념', '설명'] }],
    create: () => ({ pairs: [['', '']] })
  },
  question: {
    label: '질문과 생각',
    once: false,
    fields: [
      { key: 'question', kind: 'line', placeholder: '질문' },
      { key: 'answer', kind: 'text', placeholder: '생각' }
    ],
    create: () => ({ question: '', answer: '' })
  },
  rating: {
    label: '별점과 한 줄 평',
    once: true,
    fields: [
      { key: 'score', kind: 'rating', placeholder: '별점' },
      { key: 'comment', kind: 'line', placeholder: '한 줄 평' }
    ],
    create: () => ({ score: 0, comment: '' })
  },
  keywords: {
    label: '키워드',
    once: false,
    fields: [{ key: 'tags', kind: 'tags', placeholder: '키워드' }],
    create: () => ({ tags: [] })
  },
  divider: {
    label: '구분선',
    once: false,
    fields: [],
    create: () => ({})
  }
};

// 진행률: 채워진 필드 수 / 전체 필드 수
export function countFields(blocks) {
  const fields = blocks.flatMap(block =>
    BLOCK_TYPES[block.type].fields.map(field => KINDS[field.kind].isEmpty(block.data[field.key]))
  );
  return { filled: fields.filter(empty => !empty).length, total: fields.length };
}

// 필드가 없는 블록(divider)은 빈 블록으로 보지 않는다
export function isBlockEmpty(block) {
  const { fields } = BLOCK_TYPES[block.type];
  return fields.length > 0 && fields.every(field => KINDS[field.kind].isEmpty(block.data[field.key]));
}
