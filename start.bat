@echo off
rem Starts the extractor in development mode (hot reload):
rem   backend: uvicorn with --reload on http://localhost:8772, in its own window
rem   frontend: Vite dev server on http://localhost:5176 (proxies /api to 8772), opened in the browser
rem Close both windows (or Ctrl+C) to stop.
cd /d "%~dp0backend"
python -c "import fastapi, uvicorn, PIL, numpy" 2>nul || python -m pip install -r requirements.txt
if not exist "%~dp0frontend\node_modules" (
  pushd "%~dp0frontend"
  call npm install
  popd
)
start "FIFA Patch Extractor - backend" cmd /k python -m uvicorn fpxapi.main:app --host 127.0.0.1 --port 8772 --reload --reload-dir . --reload-dir ..\core\fpx
cd /d "%~dp0frontend"
call npm run dev -- --open
