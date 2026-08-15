/**
 * Every string in the game, spoken far more often than it is read. All of it is
 * written for a four-year-old: short sentences, no clauses, no jargon.
 *
 * The module keeps its `t`-table shape from when the game shipped two languages.
 * It is worth keeping: the neural voice is English-only, so a second language
 * would need its own engine, but the indirection costs nothing and means the
 * strings stay in one place instead of scattered through the UI.
 */

export const LANG = 'en-US';

const T = {
  title: 'Mermaid Mall',
  pick: 'Who do you want to be?',
  hello: (who) => `Hello ${who}! Let's go shopping!`,
  mermaid: 'mermaid',
  unicorn: 'unicorn',
  // Item names carry their own article so plurals and vowels stay grammatical
  // ("some headphones", "an ice cream") rather than forcing "a" into the template.
  mission: (shop, item, cost) => `Go to the ${shop}. Buy ${item}. You need ${cost} diamonds.`,
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
};

export const i18n = {
  t: T,

  shopName(shop) {
    return shop.name;
  },

  itemName(emoji) {
    return T.itemName[emoji] ?? '';
  },

  praise() {
    const p = T.praise;
    return p[Math.floor(Math.random() * p.length)];
  },
};
