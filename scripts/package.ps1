param([string]$ElectronZip = '')
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
Push-Location $projectPath
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
  $package = Get-Content -LiteralPath (Join-Path $projectPath 'package.json') -Raw | ConvertFrom-Json
  $releaseRoot = Join-Path $projectPath 'release'
  $releasePath = [IO.Path]::GetFullPath((Join-Path $releaseRoot 'Kanis-Windows'))
  $allowed = [IO.Path]::GetFullPath($releaseRoot) + [IO.Path]::DirectorySeparatorChar
  if (-not $releasePath.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe package path' }
  if (Test-Path -LiteralPath $releasePath) {
    $resolved = (Resolve-Path -LiteralPath $releasePath).Path
    if (-not $resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or ((Get-Item -LiteralPath $releasePath).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unsafe package directory' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
  New-Item -ItemType Directory -Path $releasePath -Force | Out-Null
  if ($ElectronZip) { Expand-Archive -LiteralPath $ElectronZip -DestinationPath $releasePath }
  else {
    $runtime = & node -p "require('path').dirname(require('electron'))"
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $runtime 'electron.exe'))) { throw 'Run npm ci first' }
    Copy-Item -Path (Join-Path $runtime '*') -Destination $releasePath -Recurse
  }
  $runtimeVersion = (Get-Content -LiteralPath (Join-Path $releasePath 'version') -Raw).Trim()
  if ($runtimeVersion.TrimStart('v') -ne $package.devDependencies.electron) { throw 'Electron version mismatch' }
  Rename-Item -LiteralPath (Join-Path $releasePath 'electron.exe') -NewName 'Kanis.exe'
  $appPath = Join-Path $releasePath 'resources\app'
  New-Item -ItemType Directory -Path $appPath -Force | Out-Null
  foreach ($directory in @('desktop','dist','assets')) { Copy-Item -LiteralPath (Join-Path $projectPath $directory) -Destination $appPath -Recurse }
  Copy-Item -LiteralPath (Join-Path $projectPath 'package.json') -Destination $appPath
  Copy-Item -LiteralPath (Join-Path $projectPath 'README.md'),(Join-Path $projectPath 'THIRD_PARTY_NOTICES.md'),(Join-Path $projectPath 'VALIDATION.md') -Destination $releasePath
  Copy-Item -LiteralPath (Join-Path $projectPath 'LICENSE') -Destination (Join-Path $releasePath 'LICENSE-Kanis.txt')
  $licenses = Join-Path $releasePath 'licenses'
  New-Item -ItemType Directory -Path $licenses | Out-Null
  foreach ($dependency in @('react','react-dom','scheduler','lucide-react')) {
    $license = Join-Path $projectPath ('node_modules\'+$dependency+'\LICENSE')
    if (-not (Test-Path -LiteralPath $license)) { throw "Missing license: $dependency" }
    Copy-Item -LiteralPath $license -Destination (Join-Path $licenses ($dependency+'.txt'))
  }
  $archivePath = Join-Path $releaseRoot ("Kanis-v"+$package.version+'-Windows-x64.zip')
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $stream = [IO.File]::Open($archivePath,[IO.FileMode]::Create)
  $archive = [IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($item in (Get-ChildItem -LiteralPath $releasePath -File -Recurse | Where-Object {$_.Extension -ne '.log'})) {
      $relative = $item.FullName.Substring($releasePath.Length+1).Replace('\','/')
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$item.FullName,('Kanis-Windows/'+$relative),[IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  } finally { $archive.Dispose();$stream.Dispose() }
  $hashStream = [IO.File]::OpenRead($archivePath)
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { $hash = [BitConverter]::ToString($hasher.ComputeHash($hashStream)).Replace('-','').ToLower() } finally { $hashStream.Dispose();$hasher.Dispose() }
  $checksum = $hash+'  '+[IO.Path]::GetFileName($archivePath)
  [IO.File]::WriteAllText((Join-Path $releaseRoot 'SHA256SUMS.txt'),$checksum+"`n",[Text.UTF8Encoding]::new($false))
  Write-Output $archivePath
} finally { Pop-Location }
