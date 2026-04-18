# Cuemath · Trial Mastery — Teacher Refresher Module

Live site: **https://cuemath-row.github.io/trial-mastery/**

Deployed via GitHub Pages from this repo.

## Files
- `index.html` — the module (login, 13 sections, quiz, cheat sheet)
- `bundle.css` — Cuemath design system
- `img/` — logos and screens
- `tracking-script.gs` — Google Apps Script backend (deploy separately into a Google Sheet)

## Updating the site
Source of truth: `/Users/jishan.kotangale/Documents/JAI/JAI/teacher-refresher/`

To deploy an update, from that folder run:
```
./deploy.sh
```
This syncs current files to `/Users/jishan.kotangale/Documents/trial-mastery-site/` and pushes to GitHub. GitHub Pages serves the updated site within ~1 minute.
