$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$compilerPath = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$helperPath = Join-Path $projectPath 'desktop\memory-helper.exe'
$sourcePaths = @((Join-Path $projectPath 'desktop\memory-native.cs'),(Join-Path $projectPath 'desktop\memory-program.cs'))
if (Test-Path -LiteralPath $helperPath) {
  $builtAt = (Get-Item -LiteralPath $helperPath).LastWriteTimeUtc
  $newerSources = @($sourcePaths | Where-Object { (Get-Item -LiteralPath $_).LastWriteTimeUtc -gt $builtAt })
  if ($newerSources.Count -eq 0) { return }
}
& $compilerPath /nologo /optimize+ /target:exe /r:System.Web.Extensions.dll ("/out:" + $helperPath) (Join-Path $projectPath 'desktop\memory-native.cs') (Join-Path $projectPath 'desktop\memory-program.cs')
if ($LASTEXITCODE -ne 0) { throw 'Memory helper compilation failed' }
