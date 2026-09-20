#================================================================
# Build a distributable .zip of the extension (for the Chrome Web
# Store or manual sharing). Run: .\build.ps1
#================================================================
$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

# Read version from manifest.json for the archive name.
$manifest = Get-Content -Path "manifest.json" -Raw | ConvertFrom-Json
$version = $manifest.version
$out = "dist/vk-message-checker-$version.zip"

New-Item -ItemType Directory -Path "dist" -Force | Out-Null
if (Test-Path -LiteralPath $out) {
    Remove-Item -LiteralPath $out -Force
}

# Package only the files Chrome needs at runtime.
$items = @("manifest.json", "_locales", "css", "html", "js", "icons")

# Stage files into a temp folder so we can exclude one-off files.
$stage = Join-Path $env:TEMP ("vk-message-checker-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stage | Out-Null

try {
    foreach ($item in $items) {
        Copy-Item -Path $item -Destination $stage -Recurse -Force
    }

    # Remove files we don't ship.
    Remove-Item -LiteralPath (Join-Path $stage "icons/source.png") -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path $stage -Recurse -Filter "*.DS_Store" | Remove-Item -Force -ErrorAction SilentlyContinue

    Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $out -Force

    Write-Host "Created $out"
}
finally {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}
