$ErrorActionPreference = 'Stop'
Add-Type -LiteralPath (Join-Path $PSScriptRoot '..\desktop\memory-native.cs')
$nodeExe = (Get-Command node).Source
$fixtureFile = Join-Path $PSScriptRoot 'memory-fixture.cjs'
$fixtureProcess = Start-Process -FilePath $nodeExe -ArgumentList ('"' + $fixtureFile + '"') -WindowStyle Hidden -PassThru
try {
  Start-Sleep -Seconds 1
  $row = [KanisMemory]::List('') | Where-Object { $_.pid -eq $fixtureProcess.Id }
  if (-not $row) { throw 'Fixture not eligible' }
  if ($row.hasVisibleWindow -ne $false) { throw 'Hidden fixture not classified as background' }
  $mismatch = [KanisMemory]::Trim($row.pid,'1','')
  if ($mismatch.status -ne 'skipped') { throw 'Creation identity mismatch was not blocked' }
  $excluded = [KanisMemory]::Trim($row.pid,$row.created,$nodeExe)
  if ($excluded.status -ne 'skipped') { throw 'Excluded executable was not blocked' }
  $hostProcess = Get-Process -Id $PID
  $systemProcess = [KanisMemory]::Trim($PID,$hostProcess.StartTime.ToUniversalTime().ToFileTimeUtc().ToString(),'')
  if ($systemProcess.status -ne 'skipped') { throw 'Windows executable was not blocked' }
  $selectionJson = ConvertTo-Json -InputObject @(@{pid=$row.pid;created=$row.created}) -Compress
  $selectionData = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($selectionJson))
  $result = & (Join-Path $PSScriptRoot '..\desktop\memory-helper.exe') trim-background 'C:\Kanis-test-exclusion.exe' $selectionData | ConvertFrom-Json
  $result = @($result)[0]
  if ($result.status -ne 'trimmed' -or $null -eq $result.after) { throw 'Fixture trim failed' }
  Start-Sleep -Seconds 1
  if ($fixtureProcess.HasExited) { throw 'Fixture exited after trimming' }
  [pscustomobject]@{backgroundDetected=$true;identityMismatchBlocked=$true;excludedExeBlocked=$true;windowsExeBlocked=$true;fixtureSurvived=$true;before=$result.before;after=$result.after} | ConvertTo-Json -Compress
} finally {
  if (-not $fixtureProcess.HasExited) { $fixtureProcess.Kill(); $fixtureProcess.WaitForExit() }
  $fixtureProcess.Dispose()
}
