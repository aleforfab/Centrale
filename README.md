# Dancing with the SARs

NASA Space Apps Challenge 2026 prototype for visualizing radar-based surface
change. The application compares pre- and post-event radar observations,
displays a change mask and time series, and links the result to source
granules from the Alaska Satellite Facility.

## Current data status

The backend includes a NISAR GCOV processing pipeline that searches ASF,
processes selected acquisitions into static map products, and exposes those
products through the API. The frontend displays built NISAR products and their
acquisition provenance. A site must be configured and built before the app
reports NISAR data as ready; the app does not silently substitute Sentinel-1.

See [`dancing-with-sars-backend/docs/DEMO_RUNBOOK.md`](dancing-with-sars-backend/docs/DEMO_RUNBOOK.md)
for site preparation, product builds, verification, and local startup. The
legacy Sentinel-1/Earth Engine routes are available only when
`ENABLE_SENTINEL1_FALLBACK=true`.

## Project layout

- `dancing-with-the-sars-frontend`: Next.js interface with Mapbox map layers,
  controls, time-series visualization, and ASF granules.
- `dancing-with-sars-backend`: FastAPI service for Earth Engine processing and
  ASF catalog searches.

## Backend setup

```powershell
cd dancing-with-sars-backend
python -m venv .venv
.\\.venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --reload --port 8000
```

```bash
cd dancing-with-sars-backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

Earth Engine must be authenticated before analysis requests can run. Use a
local Earth Engine login, or configure the service-account variables documented
in `.env.example`. ASF searches may work without Earth Engine credentials.

Useful checks:

```powershell
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod http://localhost:8000/api/data-status
```

```bash
curl http://localhost:8000/health
curl http://localhost:8000/api/data-status
```

## Frontend setup

```powershell
cd dancing-with-the-sars-frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

```bash
cd dancing-with-the-sars-frontend
npm install
cp .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_API_URL` to the backend URL and provide a
`NEXT_PUBLIC_MAPBOX_TOKEN` for deployments. This token must be URL-restricted in the Mapbox dashboard for public demos.

## Demo flow

1. Build and verify a site using the NISAR workflow in the demo runbook.
2. Start the backend and frontend, then select the built site.
3. Compare backscatter and change-product layers, and review pair statistics,
   time series, data gaps, and acquisition provenance.

Change products show radar backscatter differences and threshold masks; they
do not by themselves establish the cause of a change or measure displacement.
Review each site's caveats and acquisition metadata when interpreting results.

## Reliability and validation

The API validates bounding boxes, date ordering, polarization, orbit direction,
thresholds, and result limits before starting remote processing. When Earth
Engine is unavailable, analysis endpoints return a clear `503` response rather
than a generic processing failure.
