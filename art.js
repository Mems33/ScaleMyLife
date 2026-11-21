/* ScaleMyLife pixel art (art.js).

   What this file is: every picture in the app, drawn in code as small rounded
   pixel tiles. Icons on a 7 by 7 grid, heroes and big sprites on 16 by 16, the
   pixel title, and the swap that turns emoji in the page into these drawings.
   Nothing is downloaded: the CSP blocks outside images and the app has to work
   offline, so every drawing is a few lines of text below.

   What it is NOT: game logic. Nothing here reads or writes the save.

   How a drawing is written. Each row of a grid is a string, rows are joined
   with "/", and every character is one pixel: "." is empty, any other letter
   is a colour picked from the drawing's palette. So
       "..#../.###./#####"
   is a small triangle. To change a drawing, edit its letters and reload. Keep
   every row of one drawing the same length, or the drawing slides sideways.

   How emoji become drawings (PX.watch). After the app writes HTML, a
   MutationObserver finds emoji in text and puts a drawing in their place. The
   original emoji stays in the page as screen-reader text (class .pxt), so
   textContent, copy-paste and screen readers keep working exactly as before.
   This is why app.js and core.js can keep writing "🔥 12": the swap draws it.
   An emoji with no entry in EMOJI below is left alone, so whatever a user
   types in their own quest titles stays theirs. To give a new emoji a drawing,
   add it to EMOJI with the name of a drawing in ICONS.

   Pixel font glyph shapes and the idea of tiles that assemble on load are
   adapted from "mosaic-prompt-template" by Kedhareswer Naidu
   (https://kedhar.pages.dev), MIT License.

   ES5 on purpose, like the rest of the app: no build step, no modules. */
(function (root) {
  'use strict';
  var doc = root.document;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var PX = {};

  /* ---------- palette shared by the drawings ----------
     Fixed colours, not theme colours: a coin is gold in every theme. Daylight
     gets a thin outline from styles.css so the pale ones still read. */
  var C = {
    gold: '#f2c14e', goldD: '#b8862a', goldL: '#fff0b0',
    ember: '#f49d70', flame: '#ff7a45', yellow: '#ffd36b',
    red: '#ff5d73', redD: '#c23a4e', pink: '#ff9ec0', pinkD: '#e0719a',
    green: '#7fe0a8', greenD: '#3fae74', blue: '#8fb8ff', cyan: '#7fd8f2', cyanD: '#4aa8c8',
    purple: '#c58cff', silver: '#dfe6ee', silverD: '#9aa7b6', bronze: '#d08a5a',
    brown: '#b07a46', brownD: '#7a5534', cream: '#f3e6c8', white: '#f6f5fa', ink: '#3a2a10'
  };

  /* ---------- icons, 7 by 7 ----------
     [grid, palette]. A null palette means "draw in the text colour": those are
     the interface icons (tabs, buttons). In mono mode every icon uses the text
     colour, with any letter other than # drawn at half strength. */
  var ICONS = {
    /* interface */
    home: ['...#.../..###../.#####./#######/.#####./.##.##./.##.##.', null],
    scroll: ['######./#....##/.#....#/.#.##.#/.#....#/##....#/.######', null],
    chart: ['......#/....#.#/....#.#/..#.#.#/..#.#.#/#.#.#.#/#######', null],
    timer: ['..###../...#.../.#####./#..#..#/#..#..#/#.....#/.#####.', null],
    book: ['......./.##.##./#..#..#/#..#..#/#..#..#/#######/.......', null],
    gear: ['..#.#../.#####./###.###/##...##/###.###/.#####./..#.#..', null],
    check: ['......./......#/.....##/#...##./##.##../.###.../..#....', { '#': C.green }],
    plus: ['...#.../...#.../...#.../#######/...#.../...#.../...#...', null],
    chevR: ['.##..../..##.../...##../....##./...##../..##.../.##....', null],
    chevL: ['....##./...##../..##.../.##..../..##.../...##../....##.', null],
    chevD: ['......./#.....#/##...##/.##.##./..###../...#.../.......', null],
    pencil: ['.....##/....###/...###./..###../.###.../#o#..../##.....', null],
    trash: ['..###../#######/.#####./.#.#.#./.#.#.#./.#.#.#./.#####.', null],
    x: ['#.....#/##...##/.##.##./..###../.##.##./##...##/#.....#', null],
    more: ['##.##.##/##.##.##', null],
    upRight: ['..#####/.....##/....#.#/...#..#/..#..../.#...../#......', null],
    mic: ['..###../..###../..###../#.###.#/#.....#/.#####./...#...', null],
    lock: ['..###../.#...#./.#...#./#######/###.###/###.###/#######', null],
    unlock: ['..###../.#...#./.#...../#######/###.###/###.###/#######', null],
    undo: ['..#..../.##..../######./.##...#/..#...#/......#/..####.', null],
    up: ['...#.../..###../.#####./#######/..###../..###../..###..', null],
    down: ['..###../..###../..###../#######/.#####./..###../...#...', null],
    play: ['.#...../.##..../.###.../.####../.###.../.##..../.#.....', null],
    back: ['.....#./....##./...###./..####./...###./....##./.....#.', null],
    pause: ['......./.##.##./.##.##./.##.##./.##.##./.##.##./.......', null],
    stop: ['......./.#####./.#####./.#####./.#####./.#####./.......', null],
    bell: ['...#.../..###../.#####./.#####./.#####./#######/...#...', null],
    bellOff: ['#..o.../.#ooo../.o#ooo./.oo#oo./.ooo#o./ooooo#o/...o..#', null],
    sound: ['...#.#./..##..#/####.#./####.#./####.#./..##..#/...#.#.', null],
    mute: ['...#.../..##.../#####.#/####.#./#####.#/..##.../...#...', null],
    key: ['..###../.#...#./..###../...#.../...##../...#.../...##..', { '#': C.gold }],
    cloud: ['......./...##../.######/#######/#######/.#####./.......', null],
    calendar: ['.#...#./#######/#######/#.#.#.#/#######/#.#.#.#/#######', null],
    repeat: ['.###.#./#...###/#....#./#.....#/.#....#/###...#/.#.###.', null],
    clock: ['.#####./#..#..#/#..#..#/#..##.#/#.....#/#.....#/.#####.', null],
    question: ['..###../.#...#./.....#./....#../...#.../......./...#...', null],
    info: ['...#.../......./..##.../...#.../...#.../...#.../..###..', null],
    link: ['.##..../#..#.../#..###./.###..#/...#..#/....##./.......', null],
    clip: ['..###../#######/#.....#/#.###.#/#.....#/#.###.#/#######', null],
    chat: ['#######/#.....#/#.#.#.#/#.....#/#######/.##..../.#.....', null],
    mail: ['......./#######/##...##/#.#.#.#/#..#..#/#.....#/#######', null],
    phone: ['.#####./.#...#./.#...#./.#...#./.#...#./.##.##./.#####.', null],
    camera: ['......./..###../#######/##...##/#..#..#/##...##/#######', null],
    image: ['......./#######/#....o#/#..#..#/#.###.#/#######/.......', null],
    dice: ['.#####./##.####/#######/###.###/#######/####.##/.#####.', null],
    compass: ['.#####./#....##/#..##.#/#.#o#.#/#.##..#/##....#/.#####.', null],
    minus: ['......./......./......./#######/......./......./.......', null],
    dot: ['......./......./..###../..#.#../..###../......./.......', null],
    people: ['.#...#./###.###/.#...#./......./##...##/###.###/###.###', null],
    person: ['..###../..###../..###../......./.#####./#######/#######', null],
    shades: ['......./#.....#/#######/###.###/###.###/......./.......', null],
    dumbbell: ['......./#.....#/##...##/#######/##...##/#.....#/.......', null],
    music: ['..#####/..#...#/..#...#/.##..##/###.###/###.###/.#...#.', null],
    headphones: ['.#####./#.....#/#.....#/##...##/##...##/##...##/.......', null],
    laptop: ['......./.#####./.#...#./.#...#./.#####./#######/.......', null],
    scale: ['...#.../#######/#..#..#/#..#..#/##.#.##/...#.../.#####.', null],
    cup: ['.#.#.../......./######./#####.#/######./#####../.###...', null],
    tv: ['.#...#./..#.#../#######/#.....#/#.....#/#.....#/#######', null],
    gamepad: ['......./.#####./##.####/#...#.#/##.####/#######/.#...#.', null],
    run: ['....##./....##./..###../.#.#.../...##../..#..#./.#.....', null],
    bath: ['.#...../#....../#######/#######/#######/.#####./.#...#.', null],
    ball: ['..###../.#.#.#./###.###/#..#..#/###.###/.#.#.#./..###..', null],
    plane: ['...#.../...#.../.#####./#######/...#.../..###../.......', null],
    car: ['......./..###../.#.#.#./#######/#######/.#...#./.......', null],
    paw: ['..#.#../#.....#/......./..###../.#####./.#####./..###..', null],
    pawn: ['...#.../..###../...#.../..###../..###../.#####./#######', null],
    grad: ['...#.../.#####./#######/.##.##./..###.o/..###.o/.......', null],
    magnify: ['.###.../#...#../#...#../#...#../.####../....##./.....##', null],
    bird: ['......./##...../.##..##/..#####/...###./....#../.......', null],
    skull: ['.#####./#######/#..#..#/#..#..#/###.###/.#####./.#.#.#.', null],
    zzz: ['....###/.....#./....###/###..../..#..../.#...../###....', { '#': C.blue }],
    /* game items */
    coin: ['.ooooo./o#w###o/o##o##o/o##o##o/o##o##o/o#####o/.ooooo.', { '#': C.gold, o: C.goldD, w: C.goldL }],
    trophy: ['o#####o/o#w###o/.#####./..###../...#.../..ooo../.#####.', { '#': C.gold, o: C.goldD, w: C.goldL }],
    medal: ['x.....x/.x...x./..x.x../..###../.##w##./.#####./..###..', { x: C.blue, '#': C.gold, w: C.goldL }],
    medal2: ['x.....x/.x...x./..x.x../..###../.##w##./.#####./..###..', { x: C.blue, '#': C.silver, w: C.white }],
    medal3: ['x.....x/.x...x./..x.x../..###../.##w##./.#####./..###..', { x: C.blue, '#': C.bronze, w: '#f2c4a0' }],
    flame: ['..#..../..##.../.###.#./.##o##./##ooo##/#ooooo#/.#ooo#.', { '#': C.flame, o: C.yellow }],
    star: ['...#.../...#.../#######/.#####./..###../.##.##./.#...#.', { '#': C.gold }],
    sparkle: ['...#.../...#.../..###../#######/..###../...#.../...#...', { '#': '#ffe08a' }],
    gift: ['.o...o./..ooo../###o###/###o###/.##o##./.##o##./.##o##.', { '#': '#ff7a6b', o: C.gold }],
    bag: ['..###../.#...#./#######/#######/#######/#######/.#####.', { '#': C.ember }],
    heart: ['.##.##./##w####/#######/#######/.#####./..###../...#...', { '#': C.red, w: '#ffc2cb' }],
    dropRed: ['...#.../...#.../..###../.##w##./.#####./.#####./..###..', { '#': '#e5484d', w: '#ffb3b8' }],
    dropBlue: ['...#.../...#.../..###../.##w##./.#####./.#####./..###..', { '#': '#5fb4ff', w: '#cfe8ff' }],
    shield: ['#######/###o###/#ooooo#/###o###/.##o##./..###../...#...', { '#': C.blue, o: C.gold }],
    sword: ['.....##/....###/.o.###./..o##../..oo.../.o..o../o......', { '#': C.silver, o: '#c8913e' }],
    bolt: ['....##./...##../..##.../.######/...##../..##.../.##....', { '#': C.yellow }],
    moon: ['..####./.###.../###..../###..../###..../.###.../..####.', { '#': '#f2d27a' }],
    sun: ['#..#..#/.#...#./..###../#.###.#/..###../.#...#./#..#..#', { '#': C.yellow }],
    sprout: ['......./##...##/###.###/.##o##./...o.../...o.../..ooo..', { '#': C.green, o: C.greenD }],
    clover: ['.##.##./###.###/.##.##./...o.../.##.##./###.###/.##.##.', { '#': C.green, o: C.greenD }],
    leaf: ['....###/...####/..####./.####../.###.../.o...../o......', { '#': C.green, o: C.greenD }],
    flower: ['...#.../.#.#.#./..###../###o###/..###../.#.#.#./...#...', { '#': C.pink, o: C.yellow }],
    lotus: ['...#.../..###../.#.#.#./##.#.##/.#####./..###../.......', { '#': C.pink }],
    monster: ['.#...#./..#.#../.#####./##.#.##/#######/#.###.#/.#...#.', { '#': C.purple }],
    dragon: ['o.....o/.o###o./.#####./#w###w#/#######/##.#.##/.#.#.#.', { '#': '#e0564f', o: '#e8dcc0', w: C.yellow }],
    owl: ['o.....o/oo###oo/#ww#ww#/#wx#xw#/###b###/.#####./.b...b.', { '#': '#a87b4f', o: C.brownD, w: C.cream, x: '#2a1f14', b: '#f2a33a' }],
    potion: ['..###../...#.../..#.#../.#ooo#./#ooooo#/#owooo#/.#####.', { '#': C.silver, o: C.purple, w: C.white }],
    hourglass: ['#######/.#ooo#./..#o#../...#.../..#.#../.#ooo#./#######', { '#': '#c8913e', o: '#f2d27a' }],
    candle: ['...o.../..ooo../...o.../..###../..###../..###../.#####.', { '#': C.cream, o: '#ff9a4a' }],
    lamp: ['......./.....o./..###.o/#######/.#####./..###../.#####.', { '#': C.gold, o: C.purple }],
    lantern: ['..###../.#####./#######/#o#o#o#/#######/.#####./..#.#..', { '#': C.red, o: C.yellow }],
    bed: ['......./#....../#.oo.../#######/#######/#.....#/.......', { '#': C.blue, o: C.white }],
    tent: ['...#.../..###../..###../.##.##./.#...#./##...##/#######', { '#': '#c8913e' }],
    party: ['......o/.x..o../...x..x/o.#..../..##.o./.###.../####...', { '#': C.gold, o: C.pink, x: C.blue }],
    crown: ['......./#..#..#/##.#.##/#######/#r#r#r#/#######/.......', { '#': C.gold, r: C.red }],
    rocket: ['...#.../..###../..#o#../..###../.#####./#.###.#/..x.x..', { '#': '#e8ecf3', o: C.blue, x: C.flame }],
    hammer: ['.#####./#######/.#####./...o.../...o.../...o.../...o...', { '#': C.silverD, o: C.brown }],
    gem: ['......./.#####./##w#o##/.#####./..###../...#.../.......', { '#': C.cyan, w: C.white, o: C.cyanD }],
    brain: ['.##.##./#######/##o#o##/#######/#o###o#/.#####./...#...', { '#': C.pink, o: C.pinkD }],
    briefcase: ['..###../..#.#../#######/#######/###o###/#######/#######', { '#': C.brown, o: C.gold }],
    palette: ['.#####./#o#x###/#######/#w##.../######./.#####./.......', { '#': '#d9b38c', o: C.red, x: C.blue, w: C.green }],
    target: ['.#####./#.....#/#.ooo.#/#.o#o.#/#.ooo.#/#.....#/.#####.', { '#': C.red, o: C.white }],
    pin: ['..###../..###../.#####./#######/...#.../...#.../...#...', { '#': C.red }],
    bang: ['...#.../...#.../...#.../...#.../...#.../......./...#...', { '#': C.red }],
    warn: ['...#.../..#.#../..#.#../.#.#.#./.#...#./#..#..#/#######', { '#': C.yellow }],
    globe: ['.#####./#..#..#/#######/#..#..#/#######/#..#..#/.#####.', { '#': C.cyan }],
    flag: ['o#####./o######/o#####./o....../o....../o....../o......', { '#': C.red, o: C.silverD }],
    broom: ['.....#./....#../...#.../..#..../.ooo.../ooooo../o.o.o..', { '#': C.brown, o: C.yellow }],
    cake: ['...o.../...#.../.#####./#ppppp#/#######/#ppppp#/#######', { '#': C.cream, p: C.pink, o: '#ff9a4a' }],
    burger: ['.#####./#######/ggggggg/ooooooo/#######/.#####./.......', { '#': '#e0a55a', g: C.green, o: '#7a4a2a' }],
    bowl: ['......./.g.g.g./ggggggg/#######/.#####./..###../.......', { '#': '#e8dcc0', g: C.green }],
    mountain: ['......./...w.../..www../..###../.#####./#######/.......', { '#': '#8fa0b8', w: C.white }],
    city: ['......./.#...../.#..##./##..##./###.###/#######/#.#.#.#', { '#': C.purple }],
    health: ['..###../..###../#######/#######/#######/..###../..###..', { '#': C.red }],
    trident: ['#..#..#/#..#..#/#######/...#.../...#.../...#.../...#...', { '#': C.cyan }],
    hat: ['...#.../..##.../..###../.####../.#o###./#######/.......', { '#': C.purple, o: C.gold }],
    wand: ['.....o./....o.o/.....o./...#.../..#..../.#...../#......', { '#': C.brown, o: C.gold }],
    robot: ['...#.../.#####./.#o#o#./.#####./.#ooo#./.#####./.......', { '#': C.silver, o: C.cyan }],
    bow: ['.##..../#..#.../#...#../#..ooo#/#...#../#..#.../.##....', { '#': C.brown, o: C.silver }],
    /* moods: the five journal faces */
    mood5: ['.#####./#######/##x#x##/#######/#xxxxx#/##xxx##/.#####.', { '#': C.yellow, x: C.ink }],
    mood4: ['.#####./#######/##x#x##/#######/#x###x#/##xxx##/.#####.', { '#': C.yellow, x: C.ink }],
    mood3: ['.#####./#######/##x#x##/#######/##xxx##/#######/.#####.', { '#': C.yellow, x: C.ink }],
    mood2: ['.#####./#######/##x#x##/#######/##xxx##/#x###x#/.#####.', { '#': C.yellow, x: C.ink }],
    mood1: ['.#####./#x###x#/##x#x##/#######/#######/#xxxxx#/.#####.', { '#': C.yellow, x: C.ink }],
    /* language flags for life areas (7 wide, shorter than tall) */
    flagFR: ['bbwwwrr/bbwwwrr/bbwwwrr/bbwwwrr/bbwwwrr', { b: '#3b6fd6', w: C.white, r: '#e5484d' }],
    flagIT: ['ggwwwrr/ggwwwrr/ggwwwrr/ggwwwrr/ggwwwrr', { g: C.greenD, w: C.white, r: '#e5484d' }],
    flagES: ['rrrrrrr/yyyyyyy/yyyyyyy/yyyyyyy/rrrrrrr', { r: '#e5484d', y: C.yellow }],
    flagDE: ['kkkkkkk/kkkkkkk/rrrrrrr/rrrrrrr/yyyyyyy/yyyyyyy', { k: '#2a2a33', r: '#e5484d', y: C.yellow }],
    flagJP: ['wwwwwww/wwwrwww/wwrrrww/wwwrwww/wwwwwww', { w: C.white, r: '#e5484d' }],
    flagKR: ['wwwwwww/wwwrwww/wwrrrww/wwbbbww/wwwbwww/wwwwwww', { w: C.white, r: '#e5484d', b: '#3b6fd6' }]
  };

  /* ---------- which drawing each emoji becomes ----------
     Keys are written without the invisible U+FE0F that some emoji carry; the
     matcher accepts either form. A symbol like ✓ counts too. */
  var EMOJI = {
    '💰': 'coin', '🪙': 'coin', '🏆': 'trophy', '✨': 'sparkle', '✦': 'sparkle', '💫': 'sparkle', '🌟': 'star',
    '⭐': 'star', '☆': 'star', '✓': 'check', '✅': 'check', '☁✓': 'cloud', '🔥': 'flame', '🎁': 'gift',
    '🐲': 'dragon', '🐉': 'dragon', '🦉': 'owl', '❤': 'heart', '💀': 'skull', '☠': 'skull', '🏴‍☠': 'skull',
    '✕': 'x', '🌱': 'sprout', '🌿': 'leaf', '🍀': 'clover', '🌙': 'moon', '🌌': 'moon', '👾': 'monster',
    '☁': 'cloud', '▶': 'play', '◀': 'back', '⏸': 'pause', '⏹': 'stop', '⏭': 'play', '⧉': 'upRight', '🧙': 'hat', '🧪': 'potion', '🔬': 'potion',
    '🧑‍🔬': 'potion', '🔔': 'bell', '🔕': 'bellOff', '🔊': 'sound', '🔇': 'mute', '🤝': 'people',
    '⚔': 'sword', '🗡': 'sword', '🤺': 'sword', '🛏': 'bed', '🛌': 'bed', '😴': 'zzz', '💤': 'zzz',
    '✎': 'pencil', '✍': 'pencil', '⏳': 'hourglass', '🕕': 'clock', '📔': 'book', '📚': 'book', '📖': 'book',
    '🎯': 'target', '🛡': 'shield', '⚙': 'gear', '🕯': 'candle', '🔁': 'repeat', '♻': 'repeat', '📌': 'pin',
    '📅': 'calendar', '🗓': 'calendar', '🎮': 'gamepad', '↩': 'undo', '🗑': 'trash', '💪': 'dumbbell',
    '🏋': 'dumbbell', '🎨': 'palette', '🩸': 'dropRed', '💧': 'dropBlue', '🕶': 'shades', '🧠': 'brain',
    '💼': 'briefcase', '💎': 'gem', '🎧': 'headphones', '🎵': 'music', '🎸': 'music', '🎹': 'music',
    '🛍': 'bag', '🛒': 'bag', '🧞': 'lamp', '⚠': 'warn', '🏕': 'tent', '⛺': 'tent', '🎉': 'party',
    '💻': 'laptop', '🧑‍💻': 'laptop', '👑': 'crown', '🚀': 'rocket', '🧑‍🚀': 'rocket', '📋': 'clip',
    '📝': 'clip', '🧭': 'compass', '💬': 'chat', '🗣': 'chat', '📣': 'chat', '🪓': 'hammer', '⛏': 'hammer',
    '⚒': 'hammer', '🔨': 'hammer', '🛠': 'hammer', '🏗': 'hammer', '🔒': 'lock', '🔓': 'unlock', '🔑': 'key',
    '🖼': 'image', '📷': 'camera', '📸': 'camera', '⬆': 'up', '▲': 'up', '⬇': 'down', '▼': 'down',
    '📈': 'chart', '📊': 'chart', '📨': 'mail', '🌅': 'sun', '☀': 'sun', '⚽': 'ball', '🏀': 'ball',
    '🧘': 'lotus', '🥗': 'bowl', '🍳': 'bowl', '🧑‍🍳': 'bowl', '🏠': 'home', '🎖': 'medal', '🏅': 'medal',
    '🥇': 'medal', '🥈': 'medal2', '🥉': 'medal3', '🩺': 'health', '🧑‍⚕': 'health', '🧹': 'broom',
    '🎓': 'grad', '🧑‍🎓': 'grad', '🏳': 'flag', '🏁': 'flag', '🌆': 'city', '🏮': 'lantern', '🔗': 'link',
    '💢': 'bang', '❗': 'bang', '⚖': 'scale', '▫': 'dot', '📺': 'tv', '🎬': 'tv', '☕': 'cup', '🍰': 'cake',
    '🍔': 'burger', '🚶': 'run', '🏃': 'run', '🚴': 'run', '🏊': 'run', '🧗': 'run', '🛁': 'bath',
    '📱': 'phone', '📲': 'phone', '➖': 'minus', '⛰': 'mountain', '🌋': 'mountain', '🌍': 'globe',
    '🌐': 'globe', '✈': 'plane', '🚗': 'car', '🐶': 'paw', '🐺': 'paw', '🦁': 'paw', '🐯': 'paw',
    '🐼': 'paw', '🐢': 'paw', '🦊': 'paw', '♟': 'pawn', '🕵': 'magnify', '🔱': 'trident', '⚡': 'bolt',
    '🌸': 'flower', '🎲': 'dice', '❓': 'question', '❔': 'question', 'ⓘ': 'info', '🪄': 'wand',
    '🏹': 'bow', '🤖': 'robot', '🦅': 'bird', '🕊': 'bird', '🦋': 'bird', '🦄': 'sparkle', '🧚': 'sparkle',
    '🦸': 'person', '🦹': 'person', '🧛': 'person', '🧜': 'person', '🧝': 'person', '🥷': 'person',
    '🥋': 'person', '🧑': 'person', '😄': 'mood5', '😀': 'mood5', '🙂': 'mood4', '😐': 'mood3',
    '😕': 'mood2', '😖': 'mood1', '🇫🇷': 'flagFR', '🇮🇹': 'flagIT', '🇪🇸': 'flagES', '🇩🇪': 'flagDE',
    '🇯🇵': 'flagJP', '🇰🇷': 'flagKR'
  };
  /* Where the emoji sits inside one of these, it is shown big (a medallion, the
     Sage button, an empty-state picture), so the 16 by 16 sprite is drawn
     instead of the 7 by 7 icon when one exists. */
  var BIG_PARENT = ['mface', 'sowl', 'cer-ico', 'eicon', 'lmood', 'ic'];
  var BIG = { owl: 'owl16', dragon: 'dragon16' };

  /* ---------- heroes and big sprites, 16 by 16 ----------
     bg is the tile behind a hero portrait. The ids match the avatar tokens the
     save already stores ('@knight' draws heroes.knight), so changing a drawing
     here changes it on every device that shows that hero, friends included. */
  var SPRITES = {
    knight: { bg: '#1d2a3d', p: { k: '#141a26', h: '#d5dee8', m: '#9fb1c4', d: '#62778f', v: '#0d1119', r: '#ef5b4f', R: '#a83a32', g: '#f2c14e', a: '#8399b3', A: '#53677f' },
      g: '.......rr......./......rrRR....../.....kkggkk...../....khhhhmmk..../...khhhhhmmdk.../...khhhhhmmdk.../...kvvvvvvvvk.../...khhhhhmmdk.../...khhhhhmmdk.../....kmmmmmdk..../.....kkkkkk...../..kkaaaaaaaakk../.kaaaaggggaaaak./kaaaAaggggaAaaak/kaaaAaaggaaAaaak/kAAAAAAAAAAAAAAk' },
    mage: { bg: '#2a2046', p: { k: '#1a1330', p: '#8a70c8', P: '#5a4496', g: '#f2c14e', s: '#f2c9a2', S: '#d6a57b', e: '#2a1f3d', w: '#efeaf6', W: '#c3bad6', r: '#7258b4', R: '#4c397e' },
      g: '........k......./.......kpk....../......kppPk...../.....kpgpPk...../.....kppppPk..../...kkkkkkkkkkk../....kssssssk..../....ksesseSk..../....kssssSSk..../....kwwwwwWk..../...krwwwwwWRk.../..krrrwwwWWRRk../.krrrrrwWrrRRRk./krrrrrrrrrrRRRRk/krrrgrrrrrgRRRRk/kRRRRRRRRRRRRRRk' },
    rogue: { bg: '#18211f', p: { k: '#0e1116', h: '#55607a', H: '#394155', m: '#1a1f2a', e: '#6ff0c0', c: '#414b5e', C: '#2c3342', b: '#a07c44' },
      g: '......kkkk....../....kkhhhhkk..../...khhhhhhHHk.../..khhhhhhhhHHk../..khhmmmmmmHHk../..khmmmmmmmmHk../..khmeemmeemHk../..khmmmmmmmmHk../..khhmmmmmmhHk../...khhmmmmhHk.../...kkhhhhhhHk.../..kcckhhhhkCCk../.kccccckkkcCCCk./kcccccccccccCCCk/kbbbbbbbbbbbbbbk/kcccccccccccCCCk' },
    ranger: { bg: '#1f3326', p: { k: '#12201a', h: '#5c8a4e', H: '#3e6638', s: '#e9bd93', S: '#cf9d72', e: '#2c3a26', c: '#4e7a54', C: '#355a3b', b: '#8a5a2b', g: '#d8c46a' },
      g: '......kkkk....../....kkhhhhkk..../...khhhhhhHHkg../..khhhhhhhhHHk../..khhkkkkkkHHk../..khksssssskHk../..khksesseskHk../..khkssssSSkHk../..khksssssSkHk../..khhksssskhHk../..kchhkkkkhhCk../.kcccchhhhcCCCk./kccbcccccccCCCCk/kcccbccccccCCCCk/kccccbcccccCCCCk/kcccccbccccCCCCk' },
    monk: { bg: '#3a2412', p: { k: '#2a1708', s: '#eab88b', S: '#cf9a6c', e: '#4a3018', m: '#a8664a', r: '#d98c3f', R: '#b56f28', b: '#6b3a1a' },
      g: '................/.....kkkkkk...../....kssssssk..../...ksssssssSk.../...ksssssssSk.../...kssessesSk.../...ksssssssSk.../...kssmmmmsSk.../....ksssssSk..../.....kkkkkk...../...krrrrrrrRk.../..krrbrrrrbrRk../.krrrrbrrbrrRRk./krrrrrrbbrrrRRRk/krrrrrrrrrrrRRRk/kRRRRRRRRRRRRRRk' },
    bard: { bg: '#163a38', p: { k: '#10201f', h: '#c8486b', H: '#9a3352', f: '#f0d264', s: '#edbf98', S: '#d3a37b', e: '#3c2a1c', m: '#b5654a', t: '#3f8a80', T: '#2c6860', l: '#b9884f', L: '#8a6236' },
      g: '.............f../...........ff.../.....kkkkkkf..../....khhhhhhHk.../..kkhhhhhhhHHkk./....kssssssk..../....ksesseSk..../....kssssSSk..../....kssmmsSk..../.....kssssk...../...kttkkkkttk.../..kttttttttTTk../.kttttttttlTTTk./kttttttttlLtTTTk/ktttttttlLLLtTTk/kTTTTTTTLLLLTTTk' },
    witch: { bg: '#1b1230', tier: 'rare', p: { k: '#120a1c', h: '#3d2a5c', H: '#5b3f87', g: '#7dffb0', G: '#d7fff0', r: '#6a2c8f', R: '#47205f', s: '#e8d0c8', S: '#c9a9a0', e: '#7dffb0', m: '#8a3a5a', c: '#2a1d40', C: '#1d1430', o: '#7dffb0', O: '#eafff5', x: '#3fbf80' },
      g: '..........kk..../.........kHk..../........khHk..../.......khhhk..../......khhhhHk.../.....kgggGggk.../.kkkkkkkkkkkkkk./..RrksssssSkrR../..RrksesseSkrR../..RrkssssSSkrR../..RrkssmmsSkrR../..RRrksssskrRR../.RRccckkkkcccRR./kcccccccccxoxCCk/kccccccccxoOoxCk/kCCCCCCCCCxoxCCk' },
    druid: { bg: '#14261a', tier: 'rare', p: { k: '#0c1a10', a: '#e8dcc0', A: '#b8a888', l: '#7bd88f', h: '#2c5032', H: '#3e6b45', m: '#e8e0cc', M: '#b9ae94', e: '#9dffb5', c: '#24412a', C: '#172b1b', v: '#4fae6a', g: '#7dffb0' },
      g: '.a.a........a.a./.aAa.l....l.aAa./..aA.al..la.Aa../...aAkkkkkkAa.../...khhhhhhHHk.../..khhhhllhhhHk../..khkmmmmmmkHk../..khkmeMMemkHk../..khkmmMMmmkHk../..khkMmmmmMkHk../..khhkMMMMkhHk../.kchhhkkkkhhhCk./kcccvcchhccvcCCk/kccvcccgcccvcCCk/kcvccccccccccvCk/kCCCCCCCCCCCCCCk' },
    pirate: { bg: '#14202e', tier: 'rare', p: { k: '#0e1116', h: '#1f232b', H: '#343a46', w: '#f2efe6', g: '#f0c24a', G: '#b88a24', s: '#d9a377', S: '#b98458', p: '#0b0d11', e: '#2a1c12', r: '#2b1d17', n: '#9c5a44', b: '#3a2a20', c: '#b3302b', C: '#7d1f1c' },
      g: '................/.kk..........kk./.khkkkkkkkkkkhk./.khhhhhwwwwhhhk./kkhhhhhwwhhhhhkk/..kggggggggggk../..rrkssssSSkrr../..rrkppsseSkrr../..rrkpssnsSkrr../..rrkbssssbkrr../..rgkbbbbbbkrr../...rkkbbbbkkr.../.kcckkwwwwkkcCk./kcgcckwwwwkccgCk/kcgcccwwwwcccgCk/kCgCCCCCCCCCCgCk' },
    viking: { bg: '#1a222c', tier: 'rare', p: { k: '#121820', m: '#a9b6c2', M: '#6d7a86', n: '#efe6d0', N: '#c4b99f', s: '#e2b089', S: '#c4936c', e: '#e8f4ff', p: '#3a7bd5', b: '#d0782a', B: '#9a5418', f: '#6b5a43', F: '#4a3d2d', a: '#c9d3dc' },
      g: 'n..............n/nn....kkkk....nn/.nN..kmmmmk..Nn./..nNkmmmmmmkNn../...kmmmmmmmMk.../...kMMMmmMMMk.../...kpepmmpepk.../...ksssmmsssk.../..kbbsssssSbbk../..kbbbbkkbbbBk../..kbbbbbbbbbBk../.kffkbbbbbbBkFFk/kfffkbbabbBkFFFk/kffffkbbbBkFFFFk/kfffffkbbkFFFFFk/kFFFFFFkkFFFFFFk' },
    alchem: { bg: '#10201e', tier: 'rare', p: { k: '#0a1214', h: '#1d2b2b', H: '#2f4545', m: '#c7b08a', M: '#8f7a58', l: '#66ffcc', L: '#b88a3a', c: '#22332f', C: '#16221f', v: '#9ad1c0', p: '#66ffcc', q: '#c58cff', b: '#6b4a2a' },
      g: '................/.....kkkkkk...../....khhhhhHk..../....khhhhhHk..../.kkkkkkkkkkkkkk./....kmmmmmmk..../...kmLlmmLlMk.../...kmLLmmLLMk.../....kmmmmMMk..../.....kmmMMk...../......kmMk....../...kcckmMkcck.../.kccccckkcccCCk./kccbbbbbbbbbbCCk/kcvpcvqvcccccCCk/kCvpCvqvCCCCCCCk' },
    paladin: { bg: '#2a2410', tier: 'epic', p: { k: '#1e1806', y: '#fff1a8', g: '#f2c14e', G: '#b88a24', h: '#dfe5ee', H: '#9aa6b8', w: '#f6f8ff', W: '#c7d1e6', V: '#fff6b0', t: '#f4efe2', T: '#cfc6b0', b: '#3b6fd6', B: '#27498f', r: '#e5484d' },
      g: '...yyyyyyyyyy.../..y..........y../...yykkkkkkyy.../w...khhgghhk...w/Ww.khhhgghhHk.wW/WWwkhhhgghhHHkwW/.WWkkVkkkkVkkWW./...khhhgghhhHk../...khhhkkhhHHk../....kHHHHHHHk.../.....kkkkkkk..../..kkttttttttkk../.kbttttggttttBk./kbbtttgrrgtttBBk/kbbttttggttttBBk/kBBTTTTTTTTTTBBk' },
    valkyr: { bg: '#1a1d36', tier: 'epic', p: { k: '#121528', m: '#d4dce8', M: '#94a2b8', w: '#f6f8ff', W: '#c7d1e6', s: '#f0cfae', S: '#d3ad88', e: '#7fd8ff', y: '#f3e3a2', Y: '#c9b26a', a: '#8fa6d6', A: '#5b6fa8', P: '#7fd8ff', c: '#2f4a8f' },
      g: 'w..............w/ww....kkkk....ww/Www..kmmmmk..wwW/.WwwkmmmmmmkwwW./..WWkmmmmmMkWW../....kMMMMMMk..../...yksssssSky.../...yksesseSky.../...ykssssSSky.../..yyYkssSSkYyy../..yYYkkkkkkYYy../.kyaaaaaaaaaayk./kayaaaPPaaaayAAk/kaaYaaaPaaaaYAAk/kcaaaaaaaaaaaAck/kccAAAAAAAAAAcck' },
    robot: { bg: '#0f141c', tier: 'epic', p: { k: '#07090d', d: '#232b36', D: '#171c24', m: '#3a4656', l: '#5d6f86', c: '#4ff0ff', C: '#b8fbff', o: '#ff8a3d' },
      g: '................/......kllk....../....kkdlldkk..../...kddddddddk.../.kkdddmmmmdddkk./.kldkkkkkkkkdlk./.kldcCCccCCcdlk./.kldkkkkkkkkdlk./..kddddddddddk../..kddmkkkkmddk../...kdddddddddk../..kkkDDDDDDkkk../kloomdddddddmook/kldmmdkcCkdmmdlk/kldmddkCCkddmdlk/kDDDDDDkkDDDDDDk' },
    samurai: { bg: '#3a171b', tier: 'legendary', p: { k: '#1c0b0d', r: '#d9535e', R: '#a63a44', g: '#e5b04c', v: '#2b1216', e: '#f2e6d0', a: '#8c3a42', A: '#6b2b32' },
      g: '..g..........g../...g...gg...g.../....g.kggk.g..../....krrrrrRk..../...krrrrrrRRk.../..kkrrrrrrrRkk../.kRRkvvvvvvkRRk./.kRRkvevvevkRRk./.kRRkvvvvvvkRRk./..kRkvvggvvkRk../...kkvvvvvvkk.../..kaaakkkkaAAk../.kaaaaaaaaaAAAk./kagagagagagaAAAk/kaaaaaaaaaaaAAAk/kAAAAAAAAAAAAAAk' },
    kitsune: { bg: '#3d2216', tier: 'legendary', p: { k: '#2b1810', o: '#e08a4a', O: '#b8652e', w: '#f5e0d0', p: '#f5b8a0', e: '#2b1810', n: '#2b1810', c: '#c8486b', C: '#9a3352' },
      g: '..k..........k../..kk........kk../..kok......kok../..kopk....kpok../..koookkkkoook../..kooooooooOOk../.koooooooooOOOk./.kooeeooeeoOOOk./.kooooooooooOOk./.kwwwoooooowwwk./..kwwwwnnwwwwk../...kwwwwwwwwk.../..kcckwwwwkcck../.kccccwwwwccCCk./kcccccwwwwcccCCk/kCCCCCCCCCCCCCCk' },
    /* Sage the owl and the weekly boss, drawn big */
    owl16: { p: { k: '#2a1d10', b: '#a87b4f', B: '#7a5534', w: '#f3e6c8', y: '#ffd36b', p: '#1a120a', n: '#f2a33a', c: '#e8d3a8' },
      g: '..kk........kk../..kbk......kbk../..kbbkkkkkkbbk../.kbbbbbbbbbbBBk./.kbwwwwbbwwwwBk./kbwwyyywwyyywwBk/kbwwypywwypywwBk/kbwwyyywwyyywwBk/.kbwwwwnnwwwwBk./.kbbbbbnbbbbbBk./.kbbccccccccbBk./.kbcccccccccbBk./.kbcBcccBcccbBk./..kbcccccccbBk../...kkbbbbbbkk.../....nn....nn....' },
    dragon16: { p: { k: '#1a0d10', r: '#e0564f', R: '#a8332e', h: '#e8dcc0', H: '#bfae8a', y: '#ffd36b', p: '#1a0d10', t: '#f3efe6', n: '#5a1a18', b: '#f2a35e' },
      g: '.h............h./.hh..........hh./..hH........Hh../...hHkkkkkkHh.../...krrrrrrrrk.../..krrrrrrrrrRk../.krryyrrrryyrRk./.krrpyrrrrypRRk./.krrrrrrrrrrRRk./krrrrrrrrrrrrRRk/krnrrrrrrrrrnRRk/kRRRRRRRRRRRRRRk/.kRtRtRRRRtRtRk./..kbbbbbbbbbbk../...kbbbbbbbbk.../....kkkkkkkk....' }
  };

  /* ---------- design-your-own hero ----------
     A custom hero is saved as "#" plus five base-36 digits (skin, hair style,
     hair colour, outfit, accessory), so it fits the 8-character avatar column
     and looks the same on a friend's phone. The lists below are what each
     digit picks. Adding an option at the END of a list is safe; reordering or
     removing one changes every saved hero that used it. */
  var BUILDER = {
    skin: ['#f6d7b8', '#eebe98', '#d9a066', '#b07b4f', '#8a5a3b', '#6b4630'],
    hairC: ['#2d2622', '#5b3a24', '#a5652a', '#d9a441', '#c9483c', '#8a8f98', '#7b5aa6', '#3f8a80'],
    outfit: ['#5c748f', '#7b5aa6', '#3f8a80', '#c8486b', '#c2a63e', '#5c8a4e', '#4b5568', '#b56f28'],
    hairNames: ['Short', 'Long', 'Spiky', 'Bun', 'Hood', 'Bald'],
    accNames: ['None', 'Glasses', 'Headband', 'Crown', 'Earring', 'Warpaint']
  };
  /* The base body. s skin, S skin shade, o outfit, O outfit shade, e eyes,
     m mouth, k outline. Hair and accessories are layered on top. */
  var B_BASE = '................/................/................/.....kkkkkk...../....kssssssk..../....kssssssk..../....ksesseSk..../....kssssSSk..../....kssmmsSk..../.....kssssk...../......kssk....../..kkoooooooookk./.koooooooooOOOk./kooooooooooOOOOk/kooooooooooOOOOk/kOOOOOOOOOOOOOOk';
  var B_HAIR = [
    /* Short */ '................/................/.....kkkkkk...../....khhhhhHk..../...khhhhhhhHk.../...kh......Hk...',
    /* Long */ '................/................/.....kkkkkk...../....khhhhhHk..../...khhhhhhhHk.../...kh......Hk.../...kh......Hk.../...kh......Hk.../...kh......Hk.../...khh....HHk.../....khk..kHk....',
    /* Spiky */ '................/....h..hh..h..../...hhh.hh.hhh.../...hhhhhhhhhh.../...hhhhhhhhhH.../...hh......Hh...',
    /* Bun */ '.......hh......./......hhhH....../.....kkhhkk...../....khhhhhHk..../...khhhhhhhHk.../...kh......Hk...',
    /* Hood (outfit colour) */ '................/......kkkk....../....kkooooOk..../...kooooooOOk.../..ko........Ok../..ko........Ok../..ko........Ok../..ko........Ok../..ko........Ok../..ko........Ok../..koo......OOk..',
    /* Bald */ ''
  ];
  var B_ACC = [
    '',
    /* Glasses */ '................/................/................/................/................/................/....xxxxxxxx..../.....xx..xx.....',
    /* Headband */ '................/................/................/................/...koooooooook..',
    /* Crown */ '.....g.gg.g...../.....gggggg...../.....ggrrgg.....',
    /* Earring */ '................/................/................/................/................/................/................/................/...g............/...g............',
    /* Warpaint */ '................/................/................/................/................/................/................/.....r....r...../.....r....r.....'
  ];

  /* ---------- pixel font for titles (capitals, digits, a little punctuation) ---------- */
  var GLYPHS = {
    A: '.###./#...#/#...#/#####/#...#/#...#/#...#', B: '####./#...#/#...#/####./#...#/#...#/####.',
    C: '.###./#...#/#..../#..../#..../#...#/.###.', D: '####./#...#/#...#/#...#/#...#/#...#/####.',
    E: '#####/#..../#..../####./#..../#..../#####', F: '#####/#..../#..../####./#..../#..../#....',
    G: '.###./#...#/#..../#.###/#...#/#...#/.####', H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
    I: '###/.#./.#./.#./.#./.#./###', J: '..###/...#./...#./...#./...#./#..#./.##..',
    K: '#...#/#..#./#.#../##.../#.#../#..#./#...#', L: '#..../#..../#..../#..../#..../#..../#####',
    M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#', N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#',
    O: '.###./#...#/#...#/#...#/#...#/#...#/.###.', P: '####./#...#/#...#/####./#..../#..../#....',
    Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#', R: '####./#...#/#...#/####./#.#../#..#./#...#',
    S: '.####/#..../#..../.###./....#/....#/####.', T: '#####/..#../..#../..#../..#../..#../..#..',
    U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.', V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
    W: '#...#/#...#/#...#/#.#.#/#.#.#/#.#.#/.#.#.', X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
    Y: '#...#/#...#/.#.#./..#../..#../..#../..#..', Z: '#####/....#/...#./..#../.#.../#..../#####',
    '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.', '1': '..#../.##../..#../..#../..#../..#../.###.',
    '2': '.###./#...#/....#/...#./..#../.#.../#####', '3': '####./....#/....#/.###./....#/....#/####.',
    '4': '...#./..##./.#.#./#..#./#####/...#./...#.', '5': '#####/#..../####./....#/....#/#...#/.###.',
    '6': '.###./#..../#..../####./#...#/#...#/.###.', '7': '#####/....#/...#./..#../.#.../.#.../.#...',
    '8': '.###./#...#/#...#/.###./#...#/#...#/.###.', '9': '.###./#...#/#...#/.####/....#/....#/.###.',
    '.': './././././.#', '!': '#/#/#/#/#/./#', '?': '.###./#...#/....#/...#./..#../...../..#..',
    '-': '.../.../.../###/.../.../...', "'": '#/#/./././././', ',': '././././././#/#', ':': './#/./././#/.',
    '+': '...../..#../..#../#####/..#../..#../.....'
  };

  /* ---------- drawing ---------- */
  function rowsOf(g) { return typeof g === 'string' ? g.split('/') : g; }
  /* Rects grouped by colour, so one drawing is a handful of <g> tags instead
     of a fill attribute on every pixel. gap is the space between tiles and rx
     their corner radius, both in pixels of the grid. */
  function tiles(rows, colorOf, gap, rx, dx, dy) {
    var groups = {}, order = [];
    for (var y = 0; y < rows.length; y++) {
      var r = rows[y];
      for (var x = 0; x < r.length; x++) {
        var ch = r.charAt(x);
        if (ch === '.' || ch === ' ') continue;
        var col = colorOf(ch);
        if (!col) continue;
        if (!groups[col]) { groups[col] = ''; order.push(col); }
        groups[col] += '<rect x="' + (+(x + gap + (dx || 0)).toFixed(3)) + '" y="' + (+(y + gap + (dy || 0)).toFixed(3)) + '" width="' + (+(1 - 2 * gap).toFixed(3)) + '" height="' + (+(1 - 2 * gap).toFixed(3)) + '" rx="' + rx + '"/>';
      }
    }
    return order.map(function (col) {
      var op = '';
      var c = col;
      /* mono drawings pass "currentColor@.5" for the half-strength letters */
      var at = col.indexOf('@');
      if (at > 0) { c = col.slice(0, at); op = ' fill-opacity="' + col.slice(at + 1) + '"'; }
      return '<g fill="' + c + '"' + op + '>' + groups[col] + '</g>';
    }).join('');
  }
  function box(rows) {
    var w = 0; rows.forEach(function (r) { if (r.length > w) w = r.length; });
    var h = rows.length, s = Math.max(w, h);
    return { w: w, h: h, s: s, x: -(s - w) / 2, y: -(s - h) / 2 };
  }

  /* One shared, hidden <svg> holds every drawing once as a <symbol>; each use
     on the page is a tiny <svg><use href="#px-..."></svg>. A list of 40 quests
     then costs 40 small tags, not 40 copies of 40 tiles. */
  var made = {};
  function sprite() {
    var s = doc.getElementById('pxSprite');
    if (!s) {
      s = doc.createElementNS(SVGNS, 'svg');
      s.setAttribute('id', 'pxSprite');
      s.setAttribute('aria-hidden', 'true');
      s.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
      (doc.body || doc.documentElement).appendChild(s);
    }
    return s;
  }
  function define(id, viewBox, inner) {
    /* re-check the page, not only the cache: a test harness or a full page
       rewrite can drop the sprite, and a missing symbol draws nothing */
    if (made[id] && doc.getElementById(id)) return id;
    var host = sprite();
    var holder = doc.createElementNS(SVGNS, 'svg');
    holder.innerHTML = '<symbol id="' + id + '" viewBox="' + viewBox + '">' + inner + '</symbol>';
    host.appendChild(holder.firstChild);
    made[id] = 1;
    return id;
  }

  function iconSymbol(name, mono) {
    var def = ICONS[name] || ICONS.sparkle;
    if (!ICONS[name]) name = 'sparkle';
    var rows = rowsOf(def[0]), pal = def[1], b = box(rows);
    var id = 'px-' + name + (mono || !pal ? '-m' : '');
    if (made[id] && doc.getElementById(id)) return id;
    var colorOf = (mono || !pal)
      ? function (ch) { return ch === '#' ? 'currentColor' : 'currentColor@.5'; }
      : function (ch) { return pal[ch] || null; };
    return define(id, b.x + ' ' + b.y + ' ' + b.s + ' ' + b.s, tiles(rows, colorOf, 0.07, 0.18));
  }
  /* Rarity. A hero's tier draws a glow of mosaic tiles behind the portrait,
     brightest behind the head, in the tier's colour: rare blue, epic purple,
     legendary gold with a frame and a few sparkles. Commons have none. The
     tier is set per hero in SPRITES (tier: '...'); app.js shows the same word
     in the picker. */
  var TIERS = { rare: '#5aa2ff', epic: '#b07bff', legendary: '#f5c542' };
  function tierGlow(tier) {
    var col = TIERS[tier];
    if (!col) return '';
    var out = '';
    for (var y = -2; y < 18; y++) {
      for (var x = -2; x < 18; x++) {
        var dx = x + 0.5 - 8, dy = y + 0.5 - 6.5, d = Math.sqrt(dx * dx + dy * dy);
        var op = Math.round(Math.max(0, (tier === 'legendary' ? 0.55 : 0.46) - d * 0.05) / 0.07) * 0.07;
        if (op < 0.05) continue;
        out += '<rect x="' + (x + 0.06) + '" y="' + (y + 0.06) + '" width="0.88" height="0.88" rx="0.2" fill="' + col + '" fill-opacity="' + (+op.toFixed(2)) + '"/>';
      }
    }
    if (tier !== 'rare') out += '<rect x="-1.8" y="-1.8" width="19.6" height="19.6" rx="4.3" fill="none" stroke="' + col + '" stroke-width="0.4" stroke-opacity="0.85"/>';
    if (tier === 'legendary') {
      [[-1, 2], [16, 0], [-1, 9], [16, 11], [0, -1], [15, 16]].forEach(function (p) {
        out += '<rect x="' + (p[0] + 0.15) + '" y="' + (p[1] + 0.15) + '" width="0.7" height="0.7" rx="0.15" fill="#fff6cc"/>';
      });
    }
    return out;
  }
  function spriteSymbol(name) {
    var sp = SPRITES[name];
    if (!sp) return null;
    var id = 'px-s-' + name;
    if (made[id] && doc.getElementById(id)) return id;
    var rows = rowsOf(sp.g);
    var bg = sp.bg ? '<rect x="-2" y="-2" width="20" height="20" rx="4.5" fill="' + sp.bg + '"/>' + tierGlow(sp.tier) : '';
    var vb = sp.bg ? '-2 -2 20 20' : '0 0 16 16';
    return define(id, vb, bg + tiles(rows, function (ch) { return sp.p[ch] || null; }, 0.04, 0.2));
  }
  /* 'common', 'rare', 'epic' or 'legendary' */
  PX.tier = function (name) { var sp = SPRITES[name]; return (sp && sp.tier) || 'common'; };

  /* An interface icon in the text colour: tabs, buttons, row controls. */
  PX.icon = function (name, cls) {
    var id = iconSymbol(name, true);
    return '<svg class="px' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false"><use href="#' + id + '"/></svg>';
  };
  /* The same icon in its own colours (a gold coin, a red heart). */
  PX.color = function (name, cls) {
    var id = iconSymbol(name, false);
    return '<svg class="px' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false"><use href="#' + id + '"/></svg>';
  };
  PX.has = function (name) { return !!ICONS[name]; };
  PX.iconNames = function () { return Object.keys(ICONS); };

  /* A hero portrait or a big sprite (owl16, dragon16). */
  PX.hero = function (name, cls) {
    var id = spriteSymbol(name) || spriteSymbol('knight');
    return '<svg class="pxhero' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false"><use href="#' + id + '"/></svg>';
  };
  PX.isHero = function (name) { return !!SPRITES[name] && !!SPRITES[name].bg; };
  PX.heroIds = function () { return Object.keys(SPRITES).filter(function (k) { return !!SPRITES[k].bg; }); };

  function shade(hex, f) {
    var n = parseInt(String(hex).slice(1), 16);
    if (isNaN(n)) return hex;
    var r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  /* Overlay grid b onto grid a ("." in b keeps a's pixel). */
  function layer(a, b) {
    if (!b) return a;
    b = rowsOf(b);
    return a.map(function (row, y) {
      var top = b[y] || '';
      var out = '';
      for (var x = 0; x < row.length; x++) {
        var t = top.charAt(x);
        out += (t && t !== '.') ? t : row.charAt(x);
      }
      return out;
    });
  }
  /* The rows and colours of a design-your-own hero, from its five digits.
     Shared by the page drawing (customHero) and the share card (paint). */
  function customData(digits) {
    var v = (digits || [0, 0, 0, 0, 0]).map(function (n) { return Math.max(0, n | 0); });
    var skin = BUILDER.skin[v[0] % BUILDER.skin.length], hs = v[1] % 6, hc = BUILDER.hairC[v[2] % BUILDER.hairC.length],
        oc = BUILDER.outfit[v[3] % BUILDER.outfit.length], ac = v[4] % 6;
    return {
      id: 'px-c-' + v[0] % BUILDER.skin.length + hs + (v[2] % BUILDER.hairC.length) + (v[3] % BUILDER.outfit.length) + ac,
      rows: layer(layer(rowsOf(B_BASE), B_HAIR[hs]), B_ACC[ac]),
      pal: { k: '#15131c', s: skin, S: shade(skin, 0.84), e: '#2a1f18', m: shade(skin, 0.62),
        o: oc, O: shade(oc, 0.72), h: hc, H: shade(hc, 0.74), x: '#16141c', g: '#f2c14e', r: '#d94a4a' },
      bg: shade(oc, 0.42)
    };
  }
  /* A design-your-own hero from its five digits. */
  PX.customHero = function (digits, cls) {
    var c = customData(digits);
    if (!(made[c.id] && doc.getElementById(c.id))) {
      define(c.id, '-2 -2 20 20', '<rect x="-2" y="-2" width="20" height="20" rx="4.5" fill="' + c.bg + '"/>' +
        tiles(c.rows, function (ch) { return c.pal[ch] || null; }, 0.04, 0.2));
    }
    return '<svg class="pxhero' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false"><use href="#' + c.id + '"/></svg>';
  };
  /* Paint a drawing straight onto a 2D canvas, tile by tile (the weekly share
     card is a canvas image, where <use> cannot reach). kind is 'hero' (key is
     a hero id), 'custom' (key is the five digits) or 'icon' (key is an icon
     name). x, y, size are canvas pixels for the square the drawing fills. */
  PX.paint = function (ctx, kind, key, x, y, size) {
    var rows, pal, bg = null, n;
    if (kind === 'hero') { var sp = SPRITES[key] || SPRITES.knight; rows = rowsOf(sp.g); pal = sp.p; bg = sp.bg || null; }
    else if (kind === 'custom') { var c = customData(key); rows = c.rows; pal = c.pal; bg = c.bg; }
    else { var def = ICONS[key] || ICONS.sparkle; rows = rowsOf(def[0]); pal = def[1] || { '#': '#ecebf2', o: '#8d8b99' }; }
    var b = box(rows);
    n = bg ? b.s + 4 : b.s;                       /* heroes keep their two-tile frame */
    var cell = size / n, off = bg ? 2 : 0;
    if (bg) { ctx.fillStyle = bg; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, size, size, cell * 4.5); else ctx.rect(x, y, size, size); ctx.fill(); }
    for (var yy = 0; yy < rows.length; yy++) {
      for (var xx = 0; xx < rows[yy].length; xx++) {
        var col = pal[rows[yy].charAt(xx)];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x + (xx + off - b.x) * cell + cell * 0.04, y + (yy + off - b.y) * cell + cell * 0.04, cell * 0.92, cell * 0.92);
      }
    }
  };
  PX.BUILDER = BUILDER;

  /* Pixel title text: one <rect class="pp"> per lit pixel, grouped per letter
     (<g class="pg">) so the intro can fly each pixel in. Not a symbol: the
     intro animates the pixels one by one, which needs real elements. */
  PX.text = function (str, cls) {
    var x = 0, out = '', s = String(str || '').toUpperCase();
    for (var i = 0; i < s.length; i++) {
      var g = GLYPHS[s.charAt(i)];
      if (!g) { x += 3; continue; }
      var rows = g.split('/'), w = 0, cells = '';
      rows.forEach(function (r) { if (r.length > w) w = r.length; });
      for (var y = 0; y < rows.length; y++) {
        for (var c = 0; c < rows[y].length; c++) {
          if (rows[y].charAt(c) === '#') cells += '<rect class="pp" x="' + (x + c + 0.06) + '" y="' + (y + 0.06) + '" width="0.88" height="0.88" rx="0.16"/>';
        }
      }
      out += '<g class="pg">' + cells + '</g>';
      x += w + 1;
    }
    var vw = Math.max(1, x - 1) + 1;
    return '<svg class="pxtext' + (cls ? ' ' + cls : '') + '" viewBox="-0.5 -0.5 ' + vw + ' 8" aria-hidden="true" focusable="false">' + out + '</svg>';
  };

  /* ---------- the emoji swap ---------- */
  var VS = /️/g;
  var keys = Object.keys(EMOJI).sort(function (a, b) { return b.length - a.length; });
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* every key, optionally followed by the U+FE0F variation selector, and for
     ZWJ sequences the selector may sit inside the sequence too */
  var RE = new RegExp(keys.map(function (k) {
    return k.split('‍').map(reEsc).join('️?‍') + '️?';
  }).join('|'), 'g');
  function nameFor(raw) { return EMOJI[raw.replace(VS, '')] || null; }
  PX.forEmoji = nameFor;
  /* A match is only a whole emoji when it is not one piece of a longer one.
     Without this, a user's "💪🏽" (with a skin tone), "❤️‍🔥" or a flag we have
     no drawing for would be half drawn and half left as stray characters.
     So a match is left alone when a zero-width joiner or a skin tone touches
     it, or when it is the second half of a run of flag letters. */
  var RI = /^\uD83C[\uDDE6-\uDDFF]/;
  function whole(s, start, end) {
    if (s.charAt(start - 1) === '\u200D' || s.charAt(end) === '\u200D') return false;
    if (/^\uD83C[\uDFFB-\uDFFF]/.test(s.slice(end, end + 2))) return false;
    if (RI.test(s.slice(start, start + 2))) {
      var n = 0, i = start;
      while (i >= 2 && RI.test(s.slice(i - 2, i))) { n++; i -= 2; }
      if (n % 2) return false;
    }
    return true;
  }
  /* The text without its emoji, for places a drawing cannot go: <option>,
     native confirm() dialogs, notifications. */
  PX.plain = function (s) {
    s = String(s == null ? '' : s);
    return s.replace(RE, function (m, at) { return whole(s, at, at + m.length) ? '' : m; }).replace(/\s{2,}/g, ' ').replace(/^\s+/, '');
  };

  /* SKIP: text the user is editing (a <textarea>'s text IS its value, so
     touching it would delete emoji from their journal note) and code. STRIP:
     places that can only hold plain text, where the emoji is dropped. */
  var SKIP = { TEXTAREA: 1, SCRIPT: 1, STYLE: 1, NOSCRIPT: 1 };
  var STRIP = { OPTION: 1, TITLE: 1 };
  function hasClass(el, c) { return !!(el && el.classList && el.classList.contains(c)); }
  function isBig(el) {
    for (var i = 0; i < BIG_PARENT.length; i++) if (hasClass(el, BIG_PARENT[i])) return true;
    return false;
  }
  function iconFor(raw, parent) {
    var name = nameFor(raw);
    var span = doc.createElement('span');
    span.className = 'pxi';
    var big = BIG[name] && isBig(parent);
    span.innerHTML = (big ? PX.hero(BIG[name]) : PX.color(name)) + '<span class="pxt">' + raw + '</span>';
    if (big) span.className += ' big';
    return span;
  }
  function swapText(node) {
    var s = node.nodeValue;
    if (!s) return;
    RE.lastIndex = 0;
    if (!RE.test(s)) return;
    var p = node.parentNode;
    if (!p || hasClass(p, 'pxt') || SKIP[p.nodeName]) return;
    if (STRIP[p.nodeName] || p.namespaceURI === SVGNS) {
      RE.lastIndex = 0;
      var plain = PX.plain(s);
      if (plain !== s) node.nodeValue = plain;
      return;
    }
    var hits = [], m;
    RE.lastIndex = 0;
    while ((m = RE.exec(s))) if (whole(s, m.index, m.index + m[0].length)) hits.push([m.index, m[0]]);
    if (!hits.length) return;
    var frag = doc.createDocumentFragment(), last = 0;
    for (var h = 0; h < hits.length; h++) {
      if (hits[h][0] > last) frag.appendChild(doc.createTextNode(s.slice(last, hits[h][0])));
      frag.appendChild(iconFor(hits[h][1], p));
      last = hits[h][0] + hits[h][1].length;
    }
    if (last < s.length) frag.appendChild(doc.createTextNode(s.slice(last)));
    p.replaceChild(frag, node);
  }
  var ATTRS = ['title', 'placeholder', 'aria-label', 'label'];
  function swapAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var v = el.getAttribute && el.getAttribute(ATTRS[i]);
      if (v) { RE.lastIndex = 0; if (RE.test(v)) { var pv = PX.plain(v); if (pv !== v) el.setAttribute(ATTRS[i], pv); } }
    }
  }
  /* Swap every emoji inside one element. Safe to call twice: a drawn icon
     holds no emoji outside its .pxt, which is skipped. */
  PX.swap = function (el) {
    if (!el) return;
    if (el.nodeType === 3) { swapText(el); return; }
    if (el.nodeType !== 1 || hasClass(el, 'pxt') || el.id === 'pxSprite') return;
    var list = [], w = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */, null, false), n;
    while ((n = w.nextNode())) list.push(n);
    for (var i = 0; i < list.length; i++) swapText(list[i]);
    swapAttrs(el);
    if (el.querySelectorAll) {
      var at = el.querySelectorAll('[title],[placeholder],[aria-label],optgroup[label]');
      for (var j = 0; j < at.length; j++) swapAttrs(at[j]);
    }
  };
  var watching = null;
  /* Keep swapping as the app re-renders. Observer callbacks run before the
     next paint, so the emoji is never seen on screen. */
  PX.watch = function (el) {
    el = el || doc.body;
    if (watching || !el || typeof root.MutationObserver !== 'function') return;
    PX.swap(el);
    watching = new root.MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') swapText(m.target);
        else if (m.type === 'attributes') swapAttrs(m.target);
        else for (var j = 0; j < m.addedNodes.length; j++) PX.swap(m.addedNodes[j]);
      }
    });
    watching.observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  PX.unwatch = function () { if (watching) { watching.disconnect(); watching = null; } };

  root.PX = PX;
})(window);
