// Display data for the PSL camera's signs: Roman Urdu labels and gallery groups.
// Roman Urdu: the agent's transliteration of each sign's Urdu label in models/psl/manifest.json (itself an
// agent translation marked "to be reviewed"). These are word labels, never sign descriptions (CLAUDE.md 3).
// Groups are for browsing only.

export const ROMAN_URDU = {
  absolutely: "Bilkul", aircrash: "Hawai hadsa", airplane: "Hawai jahaz", all: "Sab", also: "Bhi", arrival: "Aamad",
  assalam_o_alaikum: "Assalam-o-alaikum", atm: "ATM", bald: "Ganja", beach: "Saahil", beak: "Chonch", bear: "Reechh",
  beard: "Daarhi", bed: "Bistar", bench: "Bench", bicycle: "Cycle", both: "Dono", bridge: "Pul", bring: "Laana",
  bulb: "Bulb", cartoon: "Cartoon", chimpanzee: "Chimpanzee", color_pencils: "Rangeen pencilein", come: "Aaein",
  cow: "Gaaye", crow: "Kawwa", cupboard: "Almaari", deer: "Hiran", doctor: "Doctor", dog: "Kutta",
  donttouch: "Haath mat lagaaein", door: "Darwaaza", elephant: "Haathi", excuseme: "Maaf kijiye",
  facelotion: "Face lotion", fan: "Pankha", garden: "Baagh", generator: "Generator", give: "Dena",
  goodbye: "Khuda hafiz", goodmorning: "Subah bakhair", have_a_good_day: "Aap ka din achha guzre", hello: "Hello",
  help: "Madad", hungry: "Bhooka", ihaveacomplaint: "Mujhe aik shikayat hai", lifejacket: "Life jacket",
  mine: "Mera", mobile_phone: "Phone", nailcutter: "Nail cutter", need: "Zaroorat", peacock: "Mor",
  policecar: "Police ki gaari", razor: "Ustra", shampoo: "Shampoo", shower: "Shower", sunglasses: "Dhoop ka chashma",
  thankyou: "Shukriya", tissue: "Tissue paper", toothbrush: "Tooth brush", toothpaste: "Tooth paste",
  umbrella: "Chhatri", want: "Chaahna", water: "Paani", we: "Hum", welldone: "Shabaash", where: "Kahan?",
  who: "Kaun?", you: "Aap",
};

const TALK = ["assalam_o_alaikum", "hello", "goodbye", "goodmorning", "have_a_good_day", "thankyou", "excuseme", "welldone",
  "help", "water", "doctor", "hungry", "need", "want", "come", "give", "bring", "where", "who", "you", "we", "mine",
  "all", "both", "also", "absolutely", "ihaveacomplaint", "donttouch"];
const ANIMALS = ["bear", "beak", "chimpanzee", "cow", "crow", "deer", "dog", "elephant", "peacock"];

export const GROUPS = [
  { id: "all", en: "All", ur: "سب" },
  { id: "talk", en: "Everyday talk", ur: "روزمرہ بات چیت" },
  { id: "things", en: "Things & places", ur: "چیزیں اور جگہیں" },
  { id: "animals", en: "Animals", ur: "جانور" },
  { id: "two", en: "Two hands", ur: "دونوں ہاتھ" },
];

export function groupOf(gloss) {
  if (TALK.includes(gloss)) return "talk";
  if (ANIMALS.includes(gloss)) return "animals";
  return "things";
}

export function inGroup(entry, group) {
  if (group === "all") return true;
  if (group === "two") return entry.hands === "two";
  return groupOf(entry.gloss) === group;
}

// The camera's signs (not "Not a sign"), with Roman Urdu added, conversation signs first.
export function cameraSigns(manifest) {
  const order = (gloss) => (TALK.includes(gloss) ? TALK.indexOf(gloss) : 100);
  return (manifest?.classes || [])
    .filter((entry) => entry.tier && entry.gloss !== manifest.unknown_class)
    .map((entry) => ({ ...entry, romanUrdu: ROMAN_URDU[entry.gloss] || entry.english }))
    .sort((a, b) => order(a.gloss) - order(b.gloss) || a.english.localeCompare(b.english));
}

// The word for a sign in the chosen output language.
export function label(entry, lang) {
  if (!entry) return "";
  if (lang === "ur") return entry.urdu || entry.english;
  if (lang === "roman") return entry.romanUrdu || ROMAN_URDU[entry.gloss] || entry.english;
  return entry.english;
}

// The other script, shown smaller under the main word.
export function secondary(entry, lang) {
  if (!entry) return "";
  return lang === "en" ? entry.urdu || "" : entry.english;
}

export function withRoman(entry) {
  return entry ? { ...entry, romanUrdu: entry.romanUrdu || ROMAN_URDU[entry.gloss] || entry.english } : entry;
}
