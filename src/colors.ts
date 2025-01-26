// TODO make separate npm module

// https://stackoverflow.com/a/4382138/6519037
const allColors = [
  "hsl(42, 100%, 50%)",
  "hsl(310, 34%, 37%)",
  "hsl(24, 100%, 50%)",
  "hsl(211, 38%, 74%)",
  "hsl(350, 100%, 37%)",
  "hsl(35, 52%, 59%)",
  "hsl(22, 11%, 45%)",
  "hsl(145, 100%, 24%)",
  "hsl(348, 87%, 71%)",
  "hsl(203, 100%, 27%)",
  "hsl(11, 100%, 68%)",
  "hsl(265, 37%, 34%)",
  "hsl(33, 100%, 50%)",
  "hsl(342, 63%, 42%)",
  "hsl(49, 100%, 47%)",
  "hsl(5, 81%, 27%)",
  "hsl(68, 100%, 33%)",
  "hsl(26, 61%, 21%)",
  "hsl(10, 88%, 51%)",
  "hsl(84, 33%, 12%)",
];

// https://digitalsynopsis.com/design/beautiful-color-ui-gradients-backgrounds/
const gradientColors = [
  ["#ff9aac", "#ffa875"],
  ["#cc2b5e", "#753a88"],
  ["#42275a", "#734b6d"],
  ["#bdc3c7", "#2c3e50"],
  ["#de6262", "#ffb88c"],
  ["#eb3349", "#f45c43"],
  ["#dd5e89", "#f7bb97"],
  ["#56ab2f", "#a8e063"],
  ["#614385", "#516395"],
  ["#eecda3", "#ef629f"],
  ["#eacda3", "#d6ae7b"],
  ["#02aab0", "#00cdac"],
  ["#d66d75", "#e29587"],
  ["#000428", "#004e92"],
  ["#ddd6f3", "#faaca8"],
  ["#7b4397", "#dc2430"],
  ["#43cea2", "#185a9d"],
  ["#ba5370", "#f4e2d8"],
  ["#ff512f", "#dd2476"],
  ["#4568dc", "#b06ab3"],
  ["#ec6f66", "#f3a183"],
  ["#ffd89b", "#19547b"],
  ["#3a1c71", "#d76d77"],
  ["#4ca1af", "#c4e0e5"],
  ["#ff5f6d", "#ffc371"],
  ["#36d1dc", "#5b86e5"],
  ["#c33764", "#1d2671"],
  ["#141e30", "#243b55"],
  ["#ff7e5f", "#feb47b"],
  ["#ed4264", "#ffedbc"],
  ["#2b5876", "#4e4376"],
  ["#ff9966", "#ff5e62"],
  ["#aa076b", "#61045f"],
];

/* const lightGradients = [
  [
    '#ee9ca7',
    '#ffdde1',
  ],
  [
    '#2193b0',
    '#6dd5ed',
  ],
]; */

export function getRandomColor(colors = allColors) {
  const index = Math.floor(Math.random() * colors.length);
  const remainingColors = [...colors];
  remainingColors.splice(index, 1);
  return { remainingColors, color: colors[index] || allColors[0] };
}

export function getRandomColors(num: number) {
  let colors = allColors;
  const out = [];
  for (let i = 0; i < Math.min(num, allColors.length); i += 1) {
    const { remainingColors, color } = getRandomColor(colors);
    out.push(color);
    colors = remainingColors;
  }
  return out;
}

export function getRandomGradient() {
  return gradientColors[Math.floor(Math.random() * gradientColors.length)];
}
