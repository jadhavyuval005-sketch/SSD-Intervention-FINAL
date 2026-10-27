# VaaniAI backend

Flask + SQLAlchemy + JWT API for the VaaniAI frontend (`index.html`, `app.js`).

## Run it (Windows PowerShell shown; on macOS/Linux use `source venv/bin/activate`)

```
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env        # then edit the two secret keys
python app.py
```

The API starts at http://127.0.0.1:5000/api (check http://127.0.0.1:5000/api/health).
Open the frontend with VS Code Live Server (port 5500). `app.js` already points at `http://localhost:5000/api`.

Create an administrator (admins cannot be created from the sign-up form):

```
flask --app app create-admin
```

## Endpoints

| Method | Path | Who | What |
|---|---|---|---|
| POST | `/api/register` | anyone | `{name, email, password, role: client|clinician}` returns `{access_token, user}` |
| POST | `/api/login` | anyone | `{email, password}` returns `{access_token, user}` |
| POST | `/api/logout` | signed in | revokes the current token |
| GET | `/api/me` | signed in | current user |
| POST | `/api/attempts` | signed in | multipart form: `language, sound, words, feeling, note, duration_seconds` + optional `audio` file |
| GET | `/api/attempts` | signed in | your attempts, newest first |
| GET | `/api/attempts/<id>` | owner, assigned clinician, admin | one attempt |
| GET | `/api/attempts/<id>/audio` | owner, assigned clinician, admin | the recording |
| DELETE | `/api/attempts/<id>` | owner | delete attempt and recording |
| GET | `/api/attempts/export.csv` | signed in | your history as CSV |
| GET | `/api/clients` | clinician (own clients), admin (all) | client list with attempt counts |
| GET | `/api/clients/<id>/attempts` | assigned clinician, admin | a client's attempts |
| GET | `/api/admin/users` | admin | all users |
| PATCH | `/api/admin/users/<id>` | admin | `{role?, clinician_id?}` change a role or assign a client to a clinician |

Send the token as `Authorization: Bearer <access_token>`. Errors are JSON: `{"error": "message"}`.

## Security notes

- Passwords are hashed with bcrypt. Login says "Incorrect email or password" for both unknown emails and wrong passwords.
- Roles are enforced on the server for every request, read fresh from the database.
- Five wrong passwords in 15 minutes blocks that email and address for 15 minutes. This counter lives in server memory, so with several workers or restarts use a shared limiter such as Flask-Limiter with Redis.
- Recordings are checked by file content (WebM, Ogg, WAV, MP4/M4A, MP3), capped at `MAX_AUDIO_MB`, and stored under random names.
- Set `APP_ENV=production` with real `SECRET_KEY` and `JWT_SECRET_KEY` when deploying; serve over HTTPS and restrict `CORS_ORIGINS` to your site.

## MySQL / Amazon RDS and S3

- MySQL: `pip install PyMySQL`, then set `DATABASE_URL=mysql+pymysql://USER:PASSWORD@HOST:3306/vaaniai`. Tables are created on first start. When you change the schema later, add Flask-Migrate.
- S3: `pip install boto3`, set `STORAGE_BACKEND=s3`, `S3_BUCKET`, `AWS_REGION`, and provide AWS credentials the normal way (environment or IAM role). Recordings are stored encrypted (AES256) and streamed back only through the authenticated audio endpoint.

## Not included yet

AI feedback / wav2vec2 analysis, password reset by email, and a clinician dashboard in the frontend (the endpoints exist, the screens do not).
