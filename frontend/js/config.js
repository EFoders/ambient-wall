// Ambient Wall - frontend config.
// Everything user-tunable lives here. When the page is served by the backend, its "hello" overrides
// location, mode and display (theme, hour24) from config/config.toml; these are the file:// defaults.
window.AW = window.AW || {};

AW.config = {
  location: { name: "Ottawa", lat: 45.4215, lon: -75.6972 }, // daylight, sun and moon; set your own

  // Mode schedule (local time, 24 h). Outside work hours = ambient.
  mode: {
    workStart: "07:00",
    workEnd: "17:00",
    workDays: [1, 2, 3, 4, 5], // Mon-Fri. Weekends are ambient all day.
    transitionSeconds: 8,      // the "exhale"
  },

  theme: "cyberpunk", // default theme id

  clock: { hour24: true, showSeconds: false },

  // Background soundscape (js/audio.js). Off by default; S toggles, + / - volume, ?sound=1. The backend's hello
  // overrides these from [display] sound / volume / sound_work. sound_work = level during work (0 = silent).
  // samples: play the recordings in sounds/ (over http(s); file:// stays procedural unless ?samples=1). ?samples=0|1.
  display: { sound: false, volume: 0.5, sound_work: 0, samples: true,
    // projector boost (shadow lift for dim projectors): 0 off, 1 low, 2 medium, 3 high. G cycles on the wall,
    // ?boost=0-3; a choice made on the wall is remembered on that device and wins over this.
    boost: 0,
    // the cat (js/cat.js): K toggles on the wall, Shift+K changes the coat, ?cat=1|0|<coat>. Coats: tabby, ginger,
    // black, grey, tuxedo, calico, siamese, white. A choice made on the wall is remembered on that device.
    cat: false, cat_coat: "tabby" },

  // Dev keys (see core.js). Disable for the real install.
  devKeys: true,

  // Static demo hosting (no backend anywhere): mock data only, never try to connect. ?backend= still wins.
  demo: false,
};
