// Interface text in English and Urdu. Output language (what is shown and spoken for a sign) is one of
// "en", "ur" or "roman"; the interface follows it ("roman" keeps the English interface).
// The Urdu is a draft (most lines from the upgrade plan's bilingual microcopy). Before release it needs
// review by an Urdu editor and a Deaf PSL user (CLAUDE.md 3); see README "Help wanted".

const STRINGS = {
  tagline: { en: "Talk face to face.", ur: "آمنے سامنے بات کیجیے۔" },
  tabWords: { en: "Words", ur: "الفاظ" },
  tabSentences: { en: "Sentences", ur: "جملے" },
  tabReply: { en: "Reply", ur: "جواب" },
  tabMore: { en: "More", ur: "مزید" },
  langLabel: { en: "Language", ur: "زبان" },
  onboardTitle: { en: "Show a sign → confirm → speak.", ur: "اشارہ کریں ← تصدیق کریں ← بولیں۔" },
  onboardBody: { en: "SignMate turns Pakistan Sign Language into Urdu and English on this device. It always checks with you before it speaks.", ur: "سائن میٹ اسی ڈیوائس پر پاکستانی اشاروں کی زبان کو اردو اور انگریزی میں بدلتا ہے۔ بولنے سے پہلے یہ ہمیشہ آپ سے پوچھتا ہے۔" },
  onboardCompanion: { en: "A helper, not an interpreter. For medical, legal or emergency decisions, use a qualified interpreter when you can.", ur: "یہ ایک مددگار ہے، ترجمان نہیں۔ طبی، قانونی یا ہنگامی فیصلوں کے لیے، جب ممکن ہو، مستند ترجمان کی مدد لیجیے۔" },
  privacyPill: { en: "On-device · nothing recorded", ur: "صرف اسی ڈیوائس پر · کچھ ریکارڈ نہیں" },
  privacyPromise: { en: "Your camera video never leaves this device. SignMate reads your hand movements here, then forgets them.", ur: "آپ کی کیمرہ ویڈیو اس ڈیوائس سے باہر نہیں جاتی۔ سائن میٹ یہیں آپ کے ہاتھوں کی حرکت پڑھتا ہے، پھر بھول جاتا ہے۔" },
  privacyDetail: { en: "While you're online, Google's hand-tracking library (MediaPipe) may send anonymous speed and usage counts. Never images or video.", ur: "آن لائن ہونے پر گوگل کی ہینڈ ٹریکنگ لائبریری رفتار اور استعمال کے گمنام اعداد بھیج سکتی ہے۔ تصویر یا ویڈیو کبھی نہیں۔" },
  inDetail: { en: "In detail", ur: "تفصیل" },
  turnOnCamera: { en: "Turn on camera", ur: "کیمرہ چلائیں" },
  stopCamera: { en: "Stop", ur: "بند کریں" },
  switchCamera: { en: "Flip", ur: "پلٹیں" },
  takeTour: { en: "Take the 1-minute tour", ur: "ایک منٹ کا تعارف دیکھیں" },
  justBrowse: { en: "Just browse", ur: "صرف دیکھیں" },
  framing: { en: "Keep both hands and shoulders in view", ur: "دونوں ہاتھ اور کندھے کیمرے میں رکھیں" },
  stageReady: { en: "Sign a word. Lower your hands when you finish.", ur: "ایک اشارہ کیجیے۔ ختم ہونے پر ہاتھ نیچے کر لیں۔" },
  watching: { en: "Watching…", ur: "دیکھ رہا ہے…" },
  loadingTracker: { en: "Starting hand tracking…", ur: "ہاتھوں کی ٹریکنگ شروع ہو رہی ہے…" },
  loadingModel: { en: "Loading the PSL model…", ur: "پی ایس ایل ماڈل لوڈ ہو رہا ہے…" },
  handsNone: { en: "No hands seen", ur: "ہاتھ نظر نہیں آئے" },
  handsOne: { en: "One hand", ur: "ایک ہاتھ" },
  handsBoth: { en: "Both hands", ur: "دونوں ہاتھ" },
  yesSpeak: { en: "Yes, speak it", ur: "ہاں، بول دیں" },
  notThis: { en: "Not this", ur: "یہ نہیں" },
  orMaybe: { en: "Or:", ur: "یا:" },
  checkTitle: { en: "Not sure. Which one did you sign?", ur: "یقین نہیں۔ آپ نے کون سا اشارہ کیا؟" },
  noneOfThese: { en: "None of these", ur: "ان میں سے کوئی نہیں" },
  speak: { en: "Speak", ur: "بول دیں" },
  speaking: { en: "Speaking", ur: "بول رہا ہے" },
  undo: { en: "Undo", ur: "واپس" },
  clear: { en: "Clear", ur: "صاف کریں" },
  remove: { en: "Remove", ur: "ہٹائیں" },
  trayEmpty: { en: "Signs you make appear here. Tap a word to fix it.", ur: "آپ کے اشارے یہاں آئیں گے۔ درست کرنے کے لیے لفظ پر ٹیپ کریں۔" },
  sentenceCheck: { en: "Is this what you mean?", ur: "کیا آپ یہی کہنا چاہتے ہیں؟" },
  speakNeedsWords: { en: "Add a sign first", ur: "پہلے ایک اشارہ کیجیے" },
  replyPlaceholder: { en: "Type or speak your reply", ur: "اپنا جواب لکھیں یا بولیں" },
  show: { en: "Show", ur: "دکھائیں" },
  voiceTyping: { en: "Voice typing", ur: "بول کر لکھیں" },
  listening: { en: "Listening…", ur: "سن رہا ہے…" },
  fullScreen: { en: "Full screen", ur: "پوری اسکرین" },
  turnAround: { en: "Turn for the other person", ur: "دوسرے شخص کی طرف گھمائیں" },
  noUrduVoice: { en: "This device has no Urdu voice, so SignMate reads the Roman Urdu instead.", ur: "اس ڈیوائس میں اردو آواز نہیں، اس لیے رومن اردو پڑھی جا رہی ہے۔" },
  noVoice: { en: "This browser cannot speak aloud. The words are shown instead.", ur: "یہ براؤزر بول نہیں سکتا۔ الفاظ دکھا دیے گئے ہیں۔" },
  lightMode: { en: "This device is working hard, so SignMate switched to Light mode: hands only.", ur: "یہ ڈیوائس زیادہ بوجھ میں ہے، اس لیے ہلکا موڈ چلا دیا گیا: صرف ہاتھ۔" },
  cameraBlocked: { en: "SignMate can't see the camera. Allow it in your browser settings, then tap Try again.", ur: "سائن میٹ کیمرہ نہیں دیکھ پا رہا۔ براؤزر کی سیٹنگز میں اجازت دیں، پھر \"دوبارہ کوشش\" دبائیں۔" },
  tryAgain: { en: "Try again", ur: "دوبارہ کوشش" },
  tryTour: { en: "Try the guided tour", ur: "تعارفی ٹور دیکھیں" },
  openOnPhone: { en: "Open on your phone", ur: "اپنے فون پر کھولیں" },
  practise: { en: "Practise this sign", ur: "یہ اشارہ مشق کریں" },
  practising: { en: "Practising", ur: "مشق" },
  searchSigns: { en: "Search signs in English, اردو or Roman", ur: "اشارے تلاش کریں" },
  noSignFound: { en: "No sign for that yet. Try another word.", ur: "اس کا اشارہ ابھی نہیں۔ کوئی اور لفظ آزمائیں۔" },
  validation: { en: "Learned from a public PSL dataset; community dataset, not yet validated by Deaf signers. Every sign is a suggestion — you confirm before it speaks.", ur: "ایک عوامی پی ایس ایل ڈیٹا سیٹ سے سیکھا گیا؛ ڈیف افراد نے ابھی اس کی تصدیق نہیں کی۔ ہر اشارہ ایک تجویز ہے — بولنے سے پہلے آپ تصدیق کرتے ہیں۔" },
  notValidated: { en: "Not yet validated by Deaf signers", ur: "ڈیف افراد نے ابھی تصدیق نہیں کی" },
  quickPhrases: { en: "Quick phrases · tap to speak", ur: "فوری جملے · بولنے کے لیے ٹیپ کریں" },
  emergency: { en: "Emergency", ur: "ہنگامی" },
};

export function t(key, lang) {
  const entry = STRINGS[key];
  if (!entry) return key;
  return lang === "ur" ? entry.ur || entry.en : entry.en;
}

export function uiLang(outputLang) {
  return outputLang === "ur" ? "ur" : "en";
}
