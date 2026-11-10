# BrightMinds content scripts

Create universities, casts and articles on the BrightMinds backend (`https://api.greenlights.us`),
or purge them. Node 22+, no dependencies.

```bash
cp .env.example .env          # optional: BM_EMAIL / BM_PASSWORD of the posting account
node bm.js                    # interactive menu (folders are picked in a Windows folder window)
node bm.js help               # commands
```

## Posting a batch (e.g. `04 Application/01 Content/3MT/Organised`)

```bash
node bm.js signup                              # once: account content is posted as (verify the email)
node bm.js universities "<content folder>"     # creates the universities the casts reference
node bm.js casts "<content folder>" --dry-run  # validate, show the plan
node bm.js casts "<content folder>"            # upload
```

Every command shows its plan and asks before writing. Re-running is safe: content whose title
already exists on the server is skipped, so after a failure just run the same command again.

**From the home network**, the router drops about every other connection to its own public IP.
The script retries those (6 s each), but setting `BM_API_IP=192.168.1.111` in `.env` reaches the
server directly and avoids the delays (HTTPS stays valid).

## Content format

**Cast** — one sub-folder per cast with `details.json` and one video (mp4/mov/m4v/webm, ≤ 1 GB):

```json
{
  "title": "The nature of the beast",
  "university": "UniversityofOtago",
  "category": "3MT",
  "visibility": "5",
  "link": "https://www.youtube.com/watch?v=qLApu-HZRFg",
  "dateadded": "2022-10-17",
  "department": "Medicine"
}
```

- Required: `title` (≤ 85 chars, unique), `university`, `category` (`3MT` or `Research Presentation`),
  `visibility` (`1`–`5`, 5 = whole world), `link`.
- Optional: `dateadded`, `department` (backend list, e.g. `Medicine`, `SocialSciences`) and `topic`;
  when missing the backend picks them from the transcript.
- `university` is a key such as `UniversityofQueensland` and must exist on the server: the app
  shows its logo next to the cast.

**Article** — one `.json` file per article: same fields plus `description` (the article text,
required) and optional `duration` (minutes); `link` is optional.

**Universities** — created from the keys used by the content. Display names are derived from the
key (`UniversityoftheSunshineCoast` → `University of the Sunshine Coast`); exceptions go in
`universities.json`. Logos: `--icons <folder>` with files named like the key
(`UniversityofOtago.png`), otherwise the BrightMinds icon is used as a placeholder.
