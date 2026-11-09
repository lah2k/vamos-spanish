# ¡Vamos! – 30-day Spanish course (Hebrew UI)

Zero-dependency Node.js app. Progress is stored in `DATA_DIR/db.json`.

## Run
```
PORT=3000 DATA_DIR=./data ADMIN_PIN=your-pin node server.js
```

## Environment
- `PORT` – default 3000
- `DATA_DIR` – where `db.json` lives (mount a volume here in Docker)
- `ADMIN_PIN` – code for the parent area (`#/parent`)

## Content
Lessons live in `public/content/week1..4.js`. In each quiz question the first option (`o[0]`) is the correct one; options are shuffled on screen.
Question ids are `<lesson>-<index>`, so do not reorder existing questions (append new ones instead) or saved mistakes will point to the wrong question.
