# Ambient Wall docs

Start with the [project README](../README.md) (what it is, quick start, keys). Then, by what you want to do:

| I want to... | read |
|---|---|
| set up a wall: location, schedule, theme, data sources | [SETUP.md](SETUP.md) (the first-run wizard), then [SOURCES.md](SOURCES.md) for each source |
| connect a data source (weather, calendar, news, Spotify, ping, a sheet, any JSON API, a script) | [SOURCES.md](SOURCES.md) |
| write my own data source | [SOURCES.md: Quick start](SOURCES.md#quick-start-your-first-data-source) |
| write a theme | [THEMES.md: Quick start](THEMES.md#quick-start-your-first-theme), then the rest of [THEMES.md](THEMES.md) (the frame, the design rules, daytime, sound, the cat) |
| understand the backend: containers, signal pool, rules, the WebSocket and REST API | [ARCHITECTURE.md](ARCHITECTURE.md) |
| know why it looks and behaves the way it does | [SPEC.md](SPEC.md), the original design spec |

Other references in the repo:

- [`config/config.example.toml`](../config/config.example.toml): every option, commented.
- [`plugins/example_plugin.py`](../plugins/example_plugin.py): a drop-in Python adapter.
- [`scripts/`](../scripts): helpers (`spotify_auth.py` for the one-time Spotify login, `nowplaying_windows.py` to push what a Windows PC is playing, `example_status.py` for a `command` source).
- [`frontend/sounds/CREDITS.md`](../frontend/sounds/CREDITS.md): authors and licences of the sound recordings.
