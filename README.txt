VaaniAI speech intervention interface — G17
=============================================

Built from Presentation II and Presentation III:
- Hindi and Indian English practice
- Choose language and target sound
- Listening example (browser text-to-speech)
- Microphone recording and playback
- Save practice notes and feelings
- Progress summary and CSV export
- Learning/support tips
- Child-friendly dark UI and responsive navigation
- Motion layer: animated page transitions, staggered reveals, hero orb, live microphone level bars,
  count-up numbers, hover effects and a small celebration when an attempt is saved
  (all motion switches off automatically when the device's "reduce motion" setting is on)

Files:
- index.html
- styles.css
- animations.css (all decorative motion; remove its <link> in index.html to turn animation off)
- app.js

Run:
1. Extract the ZIP.
2. Open the extracted folder in VS Code.
3. Install/use Live Server and open index.html.
4. Microphone recording generally requires localhost or HTTPS and browser permission.

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
