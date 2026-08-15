/**
 * Two languages, spoken far more often than they are read. Every string here is
 * written for a four-year-old: short sentences, no clauses, no jargon.
 */

const STRINGS = {
  en: {
    code: 'en-US',
    flag: '🇬🇧',
    title: 'Mermaid Mall',
    pick: 'Who do you want to be?',
    hello: (who) => `Hello ${who}! Let's go shopping!`,
    mermaid: 'mermaid',
    unicorn: 'unicorn',
    // Item names carry their own article so plurals and vowels stay grammatical
    // ("some headphones", "an ice cream") rather than forcing "a" into the template.
    mission: (shop, item, cost) =>
      `Go to the ${shop}. Buy ${item}. You need ${cost} diamonds.`,
    missionShort: (shop) => `Go to the ${shop}!`,
    needMore: (n) =>
      n === 1
        ? 'You need one more diamond. Go and find one!'
        : `You need ${n} more diamonds. Go and find some!`,
    bought: (item, praise) => `${praise} You got ${item}!`,
    praise: ['Yay!', 'Super!', 'Great job!', 'Wonderful!', 'Amazing!', 'Well done!'],
    allDone: 'You did it! Your bag is full!',
    itemName: {
      '🍦': 'an ice cream', '🍨': 'a sundae', '🧸': 'a teddy bear', '🪀': 'a yo-yo',
      '🎈': 'a balloon', '🎊': 'a party popper', '👟': 'a sneaker', '🥾': 'a boot',
      '🍩': 'a donut', '🥐': 'a croissant', '🎂': 'a cake', '🧁': 'a cupcake',
      '🐠': 'a fish', '🐡': 'a puffer fish', '👗': 'a dress', '👒': 'a sun hat',
      '📚': 'a book', '📖': 'a story book', '🍕': 'a pizza', '🌭': 'a hot dog',
      '🎨': 'a paint box', '🖍️': 'a crayon', '🌸': 'a flower', '🌻': 'a sunflower',
      '⚽': 'a football', '🏀': 'a basketball', '🎧': 'some headphones', '🎸': 'a guitar',
      '🍓': 'a strawberry', '🍉': 'a watermelon', '🎩': 'a top hat', '🧢': 'a cap',
      '🚲': 'a bicycle', '🛴': 'a scooter', '🐶': 'a puppy', '🐱': 'a kitten',
      '🍬': 'a sweet', '🍭': 'a lollipop', '🪁': 'a kite', '🎏': 'a windsock',
    },
  },
  de: {
    code: 'de-DE',
    flag: '🇩🇪',
    title: 'Meerjungfrau Mall',
    pick: 'Wer möchtest du sein?',
    hello: (who) => `Hallo ${who}! Auf geht's zum Einkaufen!`,
    mermaid: 'Meerjungfrau',
    unicorn: 'Einhorn',
    mission: (shop, item, cost) =>
      `Geh zum ${shop}. Kauf ${item}. Du brauchst ${cost} Diamanten.`,
    missionShort: (shop) => `Geh zum ${shop}!`,
    needMore: (n) =>
      n === 1
        ? 'Du brauchst noch einen Diamanten. Los, such einen!'
        : `Du brauchst noch ${n} Diamanten. Los, such welche!`,
    bought: (item, praise) => `${praise} Du hast ${item} bekommen!`,
    praise: ['Juhu!', 'Super!', 'Toll gemacht!', 'Wunderbar!', 'Klasse!', 'Prima!'],
    allDone: 'Geschafft! Deine Tasche ist voll!',
    itemName: {
      '🍦': 'ein Eis', '🍨': 'einen Eisbecher', '🧸': 'einen Teddy', '🪀': 'ein Jojo',
      '🎈': 'einen Luftballon', '🎊': 'eine Knallerbse', '👟': 'einen Turnschuh', '🥾': 'einen Stiefel',
      '🍩': 'einen Donut', '🥐': 'ein Croissant', '🎂': 'einen Kuchen', '🧁': 'einen Muffin',
      '🐠': 'einen Fisch', '🐡': 'einen Kugelfisch', '👗': 'ein Kleid', '👒': 'einen Sonnenhut',
      '📚': 'ein Buch', '📖': 'ein Märchenbuch', '🍕': 'eine Pizza', '🌭': 'ein Hotdog',
      '🎨': 'einen Malkasten', '🖍️': 'einen Stift', '🌸': 'eine Blume', '🌻': 'eine Sonnenblume',
      '⚽': 'einen Fußball', '🏀': 'einen Basketball', '🎧': 'Kopfhörer', '🎸': 'eine Gitarre',
      '🍓': 'eine Erdbeere', '🍉': 'eine Melone', '🎩': 'einen Zylinder', '🧢': 'eine Mütze',
      '🚲': 'ein Fahrrad', '🛴': 'einen Roller', '🐶': 'einen Welpen', '🐱': 'ein Kätzchen',
      '🍬': 'ein Bonbon', '🍭': 'einen Lolli', '🪁': 'einen Drachen', '🎏': 'einen Windsack',
    },
  },
};

const STORE_KEY = 'mermaidmall.lang';

function detect() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved && STRINGS[saved]) return saved;
  } catch {
    /* private mode */
  }
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  return langs.some((l) => String(l).toLowerCase().startsWith('de')) ? 'de' : 'en';
}

export const i18n = {
  lang: detect(),

  get t() {
    return STRINGS[this.lang];
  },

  set(lang) {
    if (!STRINGS[lang]) return;
    this.lang = lang;
    try {
      localStorage.setItem(STORE_KEY, lang);
    } catch {
      /* ignore */
    }
  },

  toggle() {
    this.set(this.lang === 'en' ? 'de' : 'en');
    return this.lang;
  },

  shopName(shop) {
    return shop.name[this.lang] ?? shop.name.en;
  },

  itemName(emoji) {
    return this.t.itemName[emoji] ?? '';
  },

  praise() {
    const p = this.t.praise;
    return p[Math.floor(Math.random() * p.length)];
  },
};
