$ErrorActionPreference = "Stop"

Write-Host "[test] running unit tests..."
python -m unittest discover -s tests
if ($LASTEXITCODE -ne 0) {
    throw "tests failed"
}

Write-Host "[test] all tests passed."
