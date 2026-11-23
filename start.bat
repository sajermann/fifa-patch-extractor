@echo off
rem Starts the extractor in development mode (hot reload), backend and frontend in this same window:
rem   [back]  uvicorn with --reload on http://localhost:8772 (restarts when a .py file changes)
rem   [front] Vite dev server on http://localhost:5176 (proxies /api to 8772), opened in the browser
rem Ctrl+C stops both.
cd /d "%~dp0backend"
python -c "import fastapi, uvicorn, PIL, numpy" 2>nul || python -m pip install -r requirements.txt
if not exist "%~dp0frontend\node_modules\.bin\concurrently.cmd" (
  pushd "%~dp0frontend"
  call npm install
  popd
)
set PYTHONUNBUFFERED=1
cd /d "%~dp0frontend"
call node_modules\.bin\concurrently.cmd --kill-others --names back,front --prefix-colors cyan,green ^
  "cd ..\backend && python -m uvicorn fpxapi.main:app --host 127.0.0.1 --port 8772 --reload --reload-dir . --reload-dir ..\core\fpx" ^
  "npm run dev -- --open"
