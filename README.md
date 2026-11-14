# Tango · Vocab Pools

A small, dependency-free vocabulary trainer. You pick **word pools** (topics), a **difficulty** and a **seed**. The app then walks you through the mix in batches of 3–5 words:

1. **Introduce:** each word large, with its reading, romanization, audio, an example sentence with furigana, and a memory tip.
2. **Drill:** meaning (multiple choice), reverse (meaning → word), listening, fill-in-the-blank, typing the reading, and a match round.
3. **Produce:** write your own sentence with each word, hear it read back, compare with the model sentence and rate yourself.

Progress is stored per word in your browser (localStorage). Each pool card shows how much you know, and the home screen suggests when to step up a difficulty.

## Run it locally

Browsers block `fetch()` from `file://`, so serve the folder:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Host on GitHub Pages

1. Push this folder to a GitHub repo (the files at the repo root).
2. Repo → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `/ (root)`.
3. Open `https://<you>.github.io/<repo>/`.

`.nojekyll` is included so GitHub serves every file untouched.

## Sharing a pool (seeds)

The URL hash holds the whole session: language, pools, difficulty, batch size, order and seed. For example:

```
…/#lang=ja&pools=ja-mtg-keywords,ja-anime-battle&lv=12&size=4&seed=red-fox-11
```

The same link gives anyone the same words in the same order. The **Share** button copies it. Pools you imported yourself only exist in your browser; share their JSON file too.

## Adding content

### A new pool for an existing language

1. Create `data/<lang>/<something>.json`:

```json
{
  "id": "ja-my-pool",
  "language": "ja",
  "category": "Anime",
  "title": "My Pool",
  "description": "Shown on the pool card.",
  "words": [
    {
      "word": "呪文",
      "reading": "じゅもん",
      "meaning": "spell",
      "pos": "noun",
      "level": 1,
      "sentence": "{相手|あいて}は[{呪文|じゅもん}]を{唱|とな}えた。",
      "translation": "The opponent cast a spell.",
      "tip": "呪 (curse, has a mouth 口) + 文 (writing)."
    }
  ]
}
```

2. Add its path to that language's `pools` list in `data/languages.json`.

| field | required | notes |
|---|---|---|
| `word` | ✔ | As written (kanji, etc.) |
| `meaning` | ✔ | English gloss; `;` or `,` for alternatives |
| `reading` |  | Kana for Japanese. Used for audio, the typing drill and romaji |
| `level` |  | `1` easy, `2` medium, `3` hard (default 2) |
| `pos` |  | Part of speech; distractors prefer the same `pos` |
| `sentence` |  | Example. `{漢字\|かな}` = furigana, `[ … ]` = the target word (for fill-in-the-blank). If you skip `[ ]` and the word appears verbatim, it's marked automatically |
| `translation` |  | English for the sentence |
| `tip` |  | Mnemonic / kanji breakdown |
| `romaji` |  | Override the auto-generated romanization |
| `say` |  | Override what the speech engine reads for the word |

`id` must be unique: it's used in share links. Progress is keyed by `language + word + reading`, so the same word in two pools shares progress.

### A new language

Add an entry to `data/languages.json`:

```json
{ "code": "ko", "name": "Korean", "native": "한국어", "tts": "ko-KR", "pools": ["data/ko/basics.json"] }
```

* `tts` is a BCP-47 tag for the browser's speech engine (the OS needs a voice for it; see Settings → Voice).
* `"romanize": "kana"` turns on automatic Japanese romaji and kana/romaji answer matching. Other languages skip it. The typing drill then becomes "see meaning → type the word" (accent-insensitive, with a reminder about accents).
* `data/fr/` is a full non-Japanese pack (7 pools, 175 words). `data/es/starter.json` is a minimal example.
* For gendered languages, put the gender in `pos` (e.g. `"noun · f"`). It's shown on the card, and distractors prefer the same `pos`.
* Sentence writing accepts inflected forms for single words (détruire → détruisez). Avoid `{ }` in sentences, since it's furigana markup.

### Quick import (no files)

**Add pool** in the app accepts pasted JSON or simple text lines:

```
# title: My Anime Words
# language: ja
# category: Custom
# word | reading | meaning | level | sentence | translation | tip
仲間 | なかま | comrade, friend | 1 | [{仲間|なかま}]を{守|まも}る。 | I'll protect my friends. | 仲 + 間
```

Columns are separated by ` | ` with spaces around the bar (so `{漢字|かな}` inside a sentence is safe), or by tabs. That makes it easy to paste from a spreadsheet. Use `# columns: word, meaning, sentence` to change the order. Imported pools are saved in the browser and can be exported to JSON to commit into `data/`.

## Keyboard

`1–4` choose · `Enter` continue · `R` replay audio · Flashcards: `Space` flip, `← →` move, `1` again, `2` know it · `⌘/Ctrl+Enter` check your sentence.

## Files

```
index.html     page shell
style.css      styles (light + dark)
app.js         everything else: data loading, seeded mixing, lesson engine, drills, import, settings
data/          languages.json + one JSON file per pool
```
