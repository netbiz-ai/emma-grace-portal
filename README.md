# Emma-Grace's Game Portal

A safe, consolidated game hub for a 6 year old's iPad, designed to grow with her until age 7.
Features **Mini the unicorn** as the mascot.
It is a plain HTML/CSS/JS web app with no build step, no frameworks, and no tracking.

## What is inside

- **Home screen** with big, colorful, touch-friendly cards organized by category.
- **10 built-in mini-games** that work fully offline:
  - Pet Pals (hatch eggs, feed/play/wash/rest your pets to earn hearts and adopt more; pets grow from Newborn to Full Grown across 5 rarity tiers)
  - Magic Garden (plant seeds, water them, and harvest for coins; crops grow in real time even while away, with rotating seed stock, weather, and rare Gold/Rainbow/Shocked mutations worth up to 100x)
  - Rainbow Racer (3-lane kart racer: tap left/right to dodge traffic, grab stars, catch turbo bolts; 3 hearts per run, best distance saved)
  - Keyboard Dash (tap to jump across giant candy keyboard keys; every key landed is +1 speed, one fall sends you back to the start; reach ENTER to escape each stage)
  - Dress Up Studio (style an outfit for the day's theme - hat, outfit, shoes, buddy, extra, plus a "Me" picker - then earn 2-5 stars on the runway)
  - Block Builder (paint with 12 block types on a 10x7 grid; save builds to a gallery and reload them)
  - Drawing Pad (paint, save to a gallery of the last 20 drawings)
  - Memory Match (emoji card pairs)
  - Number Quest (counting and addition)
  - Word Wonders (missing-letter word game)
- **Adaptive difficulty** driven by her birthdate:
  - Age 6: numbers to 10, 3-letter words, 12 memory cards
  - Age 7: addition to 20, 4-5 letter words, 16 memory cards
  - Upgrades automatically on her 7th birthday.
- **Daily Challenge**: one question per day (seeded by date), worth a bonus star.
- **Star rewards**: parents award stars for good behavior; kids can view but not grant.
- **Game Shelf**: cards for apps that live outside the portal (Minecraft, Toca Life, etc.), editable from the parent panel.
- **Mini the unicorn**: a custom SVG mascot, drifting unicorns in the sky, and a hand-drawn unicorn app icon.
- **Grown-Ups panel** (PIN protected, default PIN `1234`):
  - Set name and birthdate
  - Daily time limit for the portal (15-90 min or unlimited)
  - Break Time: instantly pause everything
  - Playtime report for the last 7 days, plus today's per-game breakdown
  - Award stars, manage shelf cards, change PIN, reset all data

## First-time setup

1. Deploy the app (see below).
2. Open it on the iPad, tap **Grown-Ups**, enter the default PIN `1234`.
3. Set her name and birthdate, pick a daily time limit, and **change the PIN**.
4. Add the app to the Home Screen (see below).

## Deploy for free

### Option A: GitHub Pages

1. Create a new GitHub repository (public).
2. Push this folder: `git init && git add . && git commit -m "Emma-Grace's game portal" && git remote add origin <your-repo-url> && git push -u origin main`
3. In the repo: **Settings → Pages → Source: Deploy from a branch → main → / (root) → Save**.
4. Wait a minute, then open `https://<your-username>.github.io/<repo-name>/` on the iPad.

### Option B: Netlify

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag this whole folder onto the page.
3. Netlify gives you a random `https://something.netlify.app` URL (you can rename it in site settings).

## Add to the iPad Home Screen

1. Open the deployed URL in **Safari** on the iPad.
2. Tap the **Share** button (square with an arrow).
3. Tap **Add to Home Screen**.
4. Launch it from the home screen icon; it runs full-screen like a native app and works offline after the first load.

## Important: pair it with iOS Screen Time

This portal can only enforce limits on itself.
It cannot control Minecraft, Toca Life, or any other installed app.
Use **Settings → Screen Time → App Limits** and **Downtime** (with Family Sharing and a Child Account) for hard limits on everything outside the portal.

## Kid safety & privacy

Built to be safe for under-13s, following COPPA, Apple App Store kids-category,
and Google Play Families guidelines:

- **No personal data collected.** Nothing is asked of the child; the name and
  birthdate in the parent panel stay on the device.
- **No accounts, no identifiers.** No sign-in, cookies, device IDs, or
  fingerprinting. All state lives only in the device's localStorage.
- **No ads, analytics, or tracking of any kind.**
- **No third-party content or calls from the games.** Everything is drawn with
  emoji, CSS, and WebAudio - no images or media are fetched. (The only network
  request in the whole app is Google Fonts on page load.)
- **No chat or social features** and no way to contact or be contacted.
- **Nothing leaves the device.** Drawings, builds, pets, and progress are never
  uploaded or shared.
- **No purchases or real money.** In-game hearts/coins/stars are earned only
  by playing; there is nothing to buy and no loot boxes.
- **No external links for kids.** The only outward links (Game Shelf websites)
  are set up by a grown-up in the PIN-protected parent panel.
- **No dark patterns.** No streak pressure, no ads disguised as buttons, no
  "come back" manipulation; pets and gardens never punish absence.
- **Age-appropriate content.** No violence, gambling, or scary material;
  failure states are gentle (a race ends with a trophy screen, outfits always
  earn at least 2 stars).
- **Parental controls built in.** PIN-gated panel with daily time limit,
  Break Time, and playtime reports; pair with iOS Screen Time for hard limits
  (see below).

## Honest limitations

- The PIN is a soft lock to keep little fingers out of settings, not real security.
- Clearing Safari's website data resets the whole app, including stars, drawings, and settings.
- Home Screen web apps store data separately from Safari tabs, so set things up in the Home Screen copy, not in a Safari tab.
- External apps cannot be launched from a web page reliably, so shelf cards show a friendly "ask a grown-up" message plus an optional web link you configure.

## Development

No build step.
Edit `index.html`, `style.css`, `app.js`, `sw.js` directly.
Regenerate icons with `node tools/make-icons.js`.
If you change any asset, bump the `CACHE` version in `sw.js` so devices pick up the update.

Test locally with `python3 -m http.server 8000` and open `http://localhost:8000`.
Note: service workers (offline mode) only register on `localhost` or HTTPS.
