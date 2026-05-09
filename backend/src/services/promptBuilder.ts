/**
 * Structured prompt builder for Lyria 3 music generation.
 *
 * Translates a UI-friendly object (genre, mood, tempo, instruments, …) into a
 * tightly-shaped natural-language prompt. Why a builder vs. raw text?
 *
 * 1. Real artist names trigger Lyria's PROHIBITED_CONTENT filter (verified
 *    live with a Daft Punk prompt). The `inspiredBy` field maps artists to
 *    descriptive style language the filter accepts.
 * 2. Genres benefit from canonical descriptors (BPM ranges, signature
 *    instrumentation) that Lyria responds to far more reliably than
 *    free-text vibes.
 * 3. The "make it unique" suffix is appended last so it consistently
 *    biases toward non-repetitive arrangements without polluting the
 *    descriptor block.
 */

export interface BuilderInput {
  /** Genre slug — see `GENRE_PRESETS` for the full list. */
  genre?: string;
  /** Optional mood slug — see `MOODS`. */
  mood?: string;
  /** "low" | "medium" | "high" — hints overall energy. */
  energy?: "low" | "medium" | "high";
  /** Beats per minute. Falls back to a genre-typical range when missing. */
  bpm?: number;
  /** Era preset (60s, 70s, …). Optional. */
  era?: string;
  /** "instrumental" | "vocals" | "vocal_chops". */
  vocals?: "instrumental" | "vocals" | "vocal_chops";
  /** Vocal language; ignored when vocals = instrumental. */
  language?: string;
  /** Up to a handful of instrument slugs. */
  instruments?: string[];
  /** Curated artist slug for "inspired by" — see `ARTIST_STYLES`. */
  inspiredBy?: string;
  /** Optional free-text bonus notes appended at the end of the descriptor. */
  customNotes?: string;
  /** Target seconds (Lyria 3 Clip caps at 30s). */
  durationSeconds?: number;
  /** When false, skips the "make it unique" suffix. Default true. */
  appendUniqueSuffix?: boolean;
}

export interface GenrePreset {
  slug: string;
  label: string;
  /** One-line vibe descriptor injected into the prompt body. */
  descriptor: string;
  /** Default BPM range when the user doesn't pick one. */
  bpmRange: [number, number];
  /** Genres that thrive on repetition — suffix is muted by default. */
  repetitive?: boolean;
}

export const GENRE_PRESETS: GenrePreset[] = [
  {
    slug: "lofi",
    label: "Lo-fi Hip Hop",
    descriptor:
      "Lo-fi hip hop with a dusty boom-bap drum loop, warm Fender Rhodes chords, vinyl crackle, and a relaxed swing.",
    bpmRange: [70, 90],
    repetitive: true,
  },
  {
    slug: "synthwave",
    label: "Synthwave / Outrun",
    descriptor:
      "Retro 80s synthwave with arpeggiated bass, gated snare, glittering pads, and a driving cinematic feel.",
    bpmRange: [100, 120],
  },
  {
    slug: "house",
    label: "House",
    descriptor:
      "Four-on-the-floor house groove with crisp claps, filtered chord stabs, sidechained bass, and an uplifting build.",
    bpmRange: [118, 128],
  },
  {
    slug: "techno",
    label: "Techno",
    descriptor:
      "Driving techno with a relentless kick, hypnotic synth loop, industrial percussion, and rolling tension.",
    bpmRange: [128, 138],
  },
  {
    slug: "trap",
    label: "Trap",
    descriptor:
      "Modern trap with 808 sub-bass, triplet hi-hats, snappy claps, and dark atmospheric pads.",
    bpmRange: [130, 160],
  },
  {
    slug: "hiphop",
    label: "Hip Hop",
    descriptor:
      "Hip hop boom-bap with a gritty drum break, sampled chops, deep bassline, and head-nod groove.",
    bpmRange: [85, 100],
  },
  {
    slug: "dnb",
    label: "Drum & Bass",
    descriptor:
      "Liquid drum and bass with a chopped Amen break, rolling reese bass, melodic pads, and atmospheric vocal chops.",
    bpmRange: [170, 180],
  },
  {
    slug: "edm",
    label: "EDM / Big Room",
    descriptor:
      "Energetic EDM build with a cinematic riser, supersaw lead, side-chained piano, and a festival-ready drop.",
    bpmRange: [126, 132],
  },
  {
    slug: "pop",
    label: "Indie Pop",
    descriptor:
      "Bright indie pop with jangly electric guitar, punchy live drums, warm bass, and an instantly memorable hook.",
    bpmRange: [110, 130],
  },
  {
    slug: "rock",
    label: "Rock",
    descriptor:
      "Driving rock with crunchy electric guitars, tight live drums, melodic bass, and dynamic build-ups.",
    bpmRange: [110, 140],
  },
  {
    slug: "folk",
    label: "Acoustic Folk",
    descriptor:
      "Acoustic folk with fingerpicked steel-string guitar, warm upright bass, brushed snare, and intimate ambience.",
    bpmRange: [80, 110],
  },
  {
    slug: "jazz",
    label: "Jazz",
    descriptor:
      "Smooth jazz with brushed drums, walking upright bass, breathy tenor saxophone, and lush piano voicings.",
    bpmRange: [80, 120],
  },
  {
    slug: "classical",
    label: "Classical / Orchestral",
    descriptor:
      "Cinematic orchestral piece with sweeping strings, hopeful brass, gentle harp arpeggios, and dynamic timpani swells.",
    bpmRange: [70, 110],
  },
  {
    slug: "cinematic",
    label: "Cinematic / Trailer",
    descriptor:
      "Cinematic trailer cue with epic strings, hybrid percussion, soaring lead, and a powerful build-and-release.",
    bpmRange: [90, 130],
  },
  {
    slug: "ambient",
    label: "Ambient",
    descriptor:
      "Deep ambient drift with evolving pads, soft bell textures, distant field recordings, and slow harmonic motion.",
    bpmRange: [50, 80],
    repetitive: true,
  },
  {
    slug: "funk",
    label: "Funk",
    descriptor:
      "Tight funk groove with slap bass, syncopated guitar stabs, punchy horn hits, and crisp hi-hats.",
    bpmRange: [100, 120],
  },
  {
    slug: "disco",
    label: "Disco",
    descriptor:
      "Classic disco with four-on-the-floor kick, octave bass, syncopated strings, and shimmering hi-hats.",
    bpmRange: [110, 130],
  },
  {
    slug: "rnb",
    label: "R&B / Soul",
    descriptor:
      "Modern R&B with smooth electric piano, fingerpicked bass, soft trap-influenced drums, and silky atmosphere.",
    bpmRange: [70, 95],
  },
  {
    slug: "reggae",
    label: "Reggae",
    descriptor:
      "Sun-soaked reggae groove with off-beat skanking guitar, deep dub bass, brushed drums, and warm organ pads.",
    bpmRange: [70, 90],
  },
  {
    slug: "bossa",
    label: "Bossa Nova",
    descriptor:
      "Warm bossa nova with nylon-string guitar, soft brushed drums, melodic bass, and gentle piano accents.",
    bpmRange: [110, 140],
  },
  {
    slug: "country",
    label: "Country",
    descriptor:
      "Modern country with twangy electric guitar, brushed drums, walking bass, and pedal steel washes.",
    bpmRange: [90, 120],
  },
  {
    slug: "metal",
    label: "Metal",
    descriptor:
      "Heavy metal with downtuned guitars, double-kick drums, growling bass, and dynamic harmonic shifts.",
    bpmRange: [120, 180],
  },
  {
    slug: "world",
    label: "World / Tribal",
    descriptor:
      "World fusion with ethnic percussion, hand drums, breathy flutes, and chant-like vocal textures.",
    bpmRange: [90, 130],
  },
  {
    slug: "kids",
    label: "Kids / Playful",
    descriptor:
      "Playful upbeat track with bouncy marimba, ukulele strums, hand claps, and whimsical pizzicato strings.",
    bpmRange: [110, 140],
  },
];

export const MOODS: Record<string, string> = {
  chill: "relaxed and laid-back",
  energetic: "high-energy and driving",
  dark: "dark, moody, and mysterious",
  uplifting: "uplifting and hopeful",
  melancholic: "melancholic and reflective",
  dreamy: "dreamy and ethereal",
  aggressive: "aggressive and intense",
  romantic: "romantic and warm",
  mysterious: "mysterious and suspenseful",
  playful: "playful and fun",
  epic: "epic and grand",
  nostalgic: "nostalgic and sentimental",
};

export const ERAS: Record<string, string> = {
  "60s": "with a 1960s analog warmth",
  "70s": "with a 1970s vintage character",
  "80s": "with a vivid 1980s aesthetic",
  "90s": "with a 1990s grit and texture",
  "2000s": "with a polished early-2000s production",
  modern: "with a modern, hi-fi production",
};

export const INSTRUMENTS: Record<string, string> = {
  piano: "acoustic piano",
  rhodes: "Fender Rhodes electric piano",
  synth: "warm analog synth lead",
  guitar: "electric guitar",
  acoustic_guitar: "fingerpicked acoustic guitar",
  bass: "deep electric bass",
  upright_bass: "walking upright bass",
  drums: "live drum kit",
  drum_machine: "vintage drum machine",
  strings: "lush string section",
  brass: "bright brass section",
  saxophone: "tenor saxophone",
  flute: "breathy flute",
  marimba: "warm marimba",
  bells: "shimmering bells",
  pads: "evolving synth pads",
};

/**
 * Curated artist → vibe map. Real artist names are translated to descriptive
 * style language because direct artist names trigger PROHIBITED_CONTENT.
 * Each entry is a short clause we splice into the prompt. The user-facing
 * picker can group these by genre.
 */
export const ARTIST_STYLES: Record<
  string,
  { label: string; description: string; genreHint?: string }
> = {
  daft_punk: {
    label: "Daft Punk",
    description:
      "in the spirit of late-90s French Touch — vocoded vocals, sidechained four-on-the-floor, filtered disco loops",
    genreHint: "house",
  },
  tame_impala: {
    label: "Tame Impala",
    description:
      "psychedelic indie pop with phased synths, flangy bass, and dreamy reverb-soaked vocals",
    genreHint: "pop",
  },
  the_weeknd: {
    label: "The Weeknd",
    description:
      "dark synthwave-leaning R&B with breathy falsetto, gated drums, and 80s-style synths",
    genreHint: "rnb",
  },
  dr_dre: {
    label: "Dr. Dre",
    description:
      "G-funk with thick analog bass, syncopated hi-hats, vintage synth leads, and laid-back swagger",
    genreHint: "hiphop",
  },
  jay_z: {
    label: "Jay-Z",
    description:
      "East Coast hip hop with sampled soul chops, hard-hitting drums, and confident swing",
    genreHint: "hiphop",
  },
  kanye: {
    label: "Kanye West (early)",
    description:
      "soul-sampled hip hop with chopped vocal loops, warm bass, and orchestral grandeur",
    genreHint: "hiphop",
  },
  hans_zimmer: {
    label: "Hans Zimmer",
    description:
      "epic cinematic score with hybrid percussion, ostinato strings, and a slow harmonic build",
    genreHint: "cinematic",
  },
  ludovico_einaudi: {
    label: "Ludovico Einaudi",
    description:
      "minimalist neoclassical piano with repeating arpeggios, gentle string swells, and emotional restraint",
    genreHint: "classical",
  },
  bon_iver: {
    label: "Bon Iver",
    description:
      "atmospheric folk with stacked vocal harmonies, soft electronics, and intimate close-mic ambience",
    genreHint: "folk",
  },
  the_beatles: {
    label: "The Beatles",
    description:
      "60s pop-rock with jangly Rickenbacker guitars, harmonized vocals, melodic bass, and analog warmth",
    genreHint: "rock",
  },
  pink_floyd: {
    label: "Pink Floyd",
    description:
      "psychedelic prog rock with spacey synth pads, slide guitar, slow build-ups, and atmospheric depth",
    genreHint: "rock",
  },
  metallica: {
    label: "Metallica",
    description:
      "thrash metal with palm-muted downpicked riffs, double-kick drums, and aggressive harmonic shifts",
    genreHint: "metal",
  },
  bob_marley: {
    label: "Bob Marley",
    description:
      "roots reggae with off-beat skanking guitar, bubbling organ, deep dub bass, and laid-back vocal cadence",
    genreHint: "reggae",
  },
  miles_davis: {
    label: "Miles Davis (Kind of Blue era)",
    description:
      "modal jazz with brushed drums, walking bass, muted trumpet improvisation, and sparse piano voicings",
    genreHint: "jazz",
  },
  john_coltrane: {
    label: "John Coltrane",
    description:
      "modal jazz with cascading saxophone runs, swinging drums, and rich harmonic exploration",
    genreHint: "jazz",
  },
  taylor_swift: {
    label: "Taylor Swift",
    description:
      "polished pop with intimate vocal phrasing, plucked acoustic guitar, layered synth pads, and a memorable chorus hook",
    genreHint: "pop",
  },
  billie_eilish: {
    label: "Billie Eilish",
    description:
      "minimal alt-pop with whispered vocals, subby 808s, ASMR-tight ambience, and dark cinematic touches",
    genreHint: "pop",
  },
  drake: {
    label: "Drake",
    description:
      "moody trap-soul with sparse 808s, spacious atmosphere, melodic vocal cadence, and late-night ambience",
    genreHint: "trap",
  },
  beyonce: {
    label: "Beyoncé",
    description:
      "powerful R&B with stacked vocal harmonies, syncopated drums, brass stabs, and confident groove",
    genreHint: "rnb",
  },
  kraftwerk: {
    label: "Kraftwerk",
    description:
      "minimalist electro with vintage drum machines, robotic vocoded vocals, sequenced bass, and clean motorik pulse",
    genreHint: "techno",
  },
  ed_sheeran: {
    label: "Ed Sheeran",
    description:
      "warm acoustic singer-songwriter pop with looped guitar, soft hand percussion, and an earnest melodic hook",
    genreHint: "pop",
  },
  fred_again: {
    label: "Fred again..",
    description:
      "intimate house with chopped voice memo samples, deep sub-bass, soft pads, and emotional dance-floor build",
    genreHint: "house",
  },
};

const UNIQUE_SUFFIX =
  "Don't make just another AI song. Make it unique and highly engaging. Ensure a non-repetitive arrangement with evolving instrumental layers, ups and downs, and unexpected tonal pivots.";

/**
 * Genres where repetition IS the aesthetic (lo-fi, ambient). The "ups and
 * downs" suffix can fight the genre — for repetitive ones we soften it.
 */
const SOFT_SUFFIX =
  "Make it unique and engaging within the genre's traditions. Aim for subtle motion and tasteful variation rather than dramatic shifts.";

export function findGenre(slug?: string): GenrePreset | undefined {
  if (!slug) return undefined;
  return GENRE_PRESETS.find((g) => g.slug === slug);
}

export function buildPrompt(input: BuilderInput): string {
  const genre = findGenre(input.genre);
  const mood = input.mood ? MOODS[input.mood] : undefined;
  const era = input.era ? ERAS[input.era] : undefined;
  const artist = input.inspiredBy ? ARTIST_STYLES[input.inspiredBy] : undefined;
  const instruments = (input.instruments || [])
    .map((slug) => INSTRUMENTS[slug])
    .filter(Boolean);
  const energy = input.energy
    ? input.energy === "high"
      ? "high-energy"
      : input.energy === "low"
      ? "laid-back"
      : "balanced energy"
    : undefined;

  const bpm = (() => {
    if (input.bpm && input.bpm > 30 && input.bpm < 220) return input.bpm;
    if (genre) {
      const [lo, hi] = genre.bpmRange;
      return Math.round((lo + hi) / 2);
    }
    return undefined;
  })();

  const sentences: string[] = [];
  const opener = [
    "Compose an original",
    energy,
    genre?.label.toLowerCase() || "instrumental",
    "track",
  ]
    .filter(Boolean)
    .join(" ");
  sentences.push(opener.trim() + ".");

  if (genre) sentences.push(genre.descriptor);
  if (artist) sentences.push(`Vibe ${artist.description}.`);
  if (mood) sentences.push(`Overall mood: ${mood}.`);
  if (era) sentences.push(`Production ${era}.`);
  if (instruments.length) {
    sentences.push(`Featured instruments: ${instruments.join(", ")}.`);
  }
  if (bpm) sentences.push(`Tempo around ${bpm} BPM.`);

  const vocals = input.vocals || "instrumental";
  if (vocals === "instrumental") {
    sentences.push("Instrumental only — no lyrics.");
  } else if (vocals === "vocal_chops") {
    sentences.push("Use textural vocal chops only — no full lyrics.");
  } else {
    const lang = (input.language || "english").trim();
    sentences.push(`Optional vocals in ${lang}.`);
  }

  if (input.customNotes && input.customNotes.trim()) {
    sentences.push(input.customNotes.trim());
  }

  const seconds = Math.min(
    Math.max(input.durationSeconds ?? 30, 5),
    30
  );
  sentences.push(`Aim for under ${seconds} seconds. Royalty-free style suitable for YouTube content.`);

  const appendSuffix =
    input.appendUniqueSuffix !== false; // default true
  if (appendSuffix) {
    sentences.push(genre?.repetitive ? SOFT_SUFFIX : UNIQUE_SUFFIX);
  }

  return sentences.join(" ");
}

/**
 * Public catalogue endpoint shape — what the front-end picker pulls so it
 * never has to duplicate the slug strings.
 */
export function buildCatalogue() {
  return {
    genres: GENRE_PRESETS.map(({ slug, label, bpmRange, repetitive }) => ({
      slug,
      label,
      bpmRange,
      repetitive: !!repetitive,
    })),
    moods: Object.entries(MOODS).map(([slug, label]) => ({ slug, label })),
    eras: Object.entries(ERAS).map(([slug, label]) => ({ slug, label })),
    instruments: Object.entries(INSTRUMENTS).map(([slug, label]) => ({
      slug,
      label,
    })),
    artists: Object.entries(ARTIST_STYLES).map(([slug, v]) => ({
      slug,
      label: v.label,
      genreHint: v.genreHint || null,
    })),
    energies: [
      { slug: "low", label: "Chill" },
      { slug: "medium", label: "Balanced" },
      { slug: "high", label: "Energetic" },
    ],
    vocals: [
      { slug: "instrumental", label: "Instrumental" },
      { slug: "vocal_chops", label: "Vocal chops only" },
      { slug: "vocals", label: "Full vocals" },
    ],
  };
}
