VaaniAI speech intervention interface — G17
=============================================

Built from Presentation II and Presentation III:
- Hindi and Indian English practice
- Choose language and target sound
- Listening example (browser text-to-speech)
- Microphone recording and playback
- Save practice notes and feelings
- Progress summary and CSV export
- Login / create account screen (demo only, built into index.html) with Log out in the sidebar
- Learning/support tips
- Tongue twisters page: side-view mouth diagrams that animate the tongue position for 10 sounds (क ग, ट ड, त द, स, श, च, ल, र, th, प ब म),
  plus Hindi and English tongue twisters with Slow / Normal / Fast browser text-to-speech
- Profile dropdown (top right): edit name & role, My progress, Tongue twisters, Speech practice, Learn & support, Log out
- Child-friendly dark UI and responsive navigation
- Motion layer: animated page transitions, staggered reveals, hero orb, live microphone level bars,
  count-up numbers, hover effects and a small celebration when an attempt is saved
  (all motion switches off automatically when the device's "reduce motion" setting is on)

Files:
- index.html (includes the login screen)
- styles.css (includes login styles)
- animations.css (all decorative motion; remove its <link> in index.html to turn animation off)
- app.js (includes login logic, profile dropdown and the tongue-twister data/diagrams; set API_BASE inside it when the Flask API is ready)

Run:
1. Extract the ZIP.
2. Open the extracted folder in VS Code.
3. Install/use Live Server and open index.html.
4. Microphone recording generally requires localhost or HTTPS and browser permission.

Editing the tongue twisters:
- In app.js, the TWISTERS array holds the phrases and SOUNDS holds each mouth diagram (steps, tip, example words).
- Tongue shapes live in the TONGUE object (28 numbers each, same template so they can morph).
- Hindi audio needs a Hindi voice installed in the browser/OS.

Important project scope:
- This is a frontend prototype, not a completed clinical tool.
- The presentation's backend stack is Python + Flask + Flask-JWT-Extended + Flask-Bcrypt + Flask-CORS, SQLAlchemy, MySQL/RDS (SQLite locally), and optional Amazon S3 via boto3.
- This package does NOT connect to those APIs yet. Saved attempt metadata is localStorage-only; audio is not uploaded to Flask/S3.
- AI feedback and wav2vec2 analysis are not implemented here. Do not present this demo as giving clinical accuracy or a diagnosis.
- Demo profile/role selector changes only local display text; it does not enforce role permissions.

Backend integration plan:
1. Confirm the real Flask routes from your backend code.
2. Configure the frontend API base URL (for Vite, typically a VITE_API_BASE_URL environment variable; for plain static HTML, a config value).
3. Use fetch() for registration/login with the backend's exact expected field names and JWT response.
4. Send the JWT with protected API requests as the backend expects.
5. Upload recordings only to the backend's documented upload endpoint and follow its audio format/quality checks.
6. Use server-side access control; hiding tabs in the frontend is not security.
7. Implement prompt-engineered feedback only after the backend endpoint and output validation are available.

This interface is designed around the project requirements in the two supplied presentations, but does not imply that pending AWS deployment, prompt feedback, or wav2vec2 testing has been completed.
