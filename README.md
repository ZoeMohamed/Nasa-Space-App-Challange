# FireWatch

FireWatch displays high-confidence NASA FIRMS observations for Indonesia. Live MODIS and VIIRS data is cleaned, matched, grouped, and prioritized by the Python service before it reaches the Next.js map.

## Getting Started

Configure the server-only NASA key:

```bash
cp .env.example .env.local
# Set NASA_FIRMS_MAP_KEY in .env.local
```

Start the Python processor:

```bash
python3.12 -m venv python-service/.venv
python-service/.venv/bin/pip install -r python-service/requirements.txt
python-service/.venv/bin/python -m uvicorn main:app --app-dir python-service --host 127.0.0.1 --port 8000
```

In another terminal, start Next.js:

```bash
npm install
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open [http://127.0.0.1:3000/map](http://127.0.0.1:3000/map). Python API documentation is available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

## Data flow

```text
NASA FIRMS → Python clean → sensor match → area grid → attention/priority → Next.js
```

The browser never receives the NASA API key. The Python result is cached for five minutes, and the map refreshes every five minutes.

## Test

```bash
python-service/.venv/bin/python -m pytest -c python-service/pytest.ini
npm run lint
npm run build
```
