$ErrorActionPreference = "Stop"

Write-Host "[deploy] checking python..."
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    throw "python not found in PATH. Please install Python 3 and retry."
}

Write-Host "[deploy] checking dependencies..."
python -c "import flask, openpyxl; print('ok')" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[deploy] installing dependencies from requirements.txt..."
    python -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        throw "dependency install failed"
    }
} else {
    Write-Host "[deploy] dependencies already satisfied."
}

Write-Host "[deploy] initializing app/database..."
python -c "from backend_server import create_app; create_app(); print('app ready')"
if ($LASTEXITCODE -ne 0) {
    throw "app initialization failed"
}

Write-Host "[deploy] done."
