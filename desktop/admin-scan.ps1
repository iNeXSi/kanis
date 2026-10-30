# Read-only, short-lived helper. Pipe name is prepended by the trusted desktop process.
$ErrorActionPreference = 'Stop'
$result = $null
try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'ADMIN_REQUIRED' }
  $windowsFolder = [Environment]::GetFolderPath('Windows')
  $commonData = [Environment]::GetFolderPath('CommonApplicationData')
  $targets = @(
    @{ id='windows-temp'; root=(Join-Path $windowsFolder 'Temp') },
    @{ id='error-archive'; root=(Join-Path $commonData 'Microsoft\Windows\WER\ReportArchive') },
    @{ id='error-queue'; root=(Join-Path $commonData 'Microsoft\Windows\WER\ReportQueue') }
  )
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $categories = @(foreach ($target in $targets) {
    $row = @{id=$target.id;root=$target.root;bytes=[long]0;count=0;recent=0;inaccessible=0;partial=$false;samples=@()}
    $queue = [Collections.Generic.Stack[string]]::new()
    $queue.Push($target.root)
    $visited = 0
    while ($queue.Count -gt 0) {
      if ($visited -ge 20000 -or $watch.Elapsed.TotalSeconds -gt 90) { $row.partial=$true; break }
      $directory = $queue.Pop()
      try {
        $check = [IO.DirectoryInfo]::new($directory)
        $linked = $false
        while ($null -ne $check) { if (($check.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { $linked=$true; break }; $check=$check.Parent }
        if ($linked) { continue }
        if (-not [IO.Directory]::Exists($directory)) { continue }
        $entries = [IO.DirectoryInfo]::new($directory).GetFileSystemInfos()
      } catch { $row.inaccessible++; continue }
      foreach ($entry in $entries) {
        $visited++
        if ($visited -gt 20000 -or $watch.Elapsed.TotalSeconds -gt 90) { $row.partial=$true; break }
        try {
          if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
          if (($entry.Attributes -band [IO.FileAttributes]::Directory) -ne 0) { $queue.Push($entry.FullName); continue }
          if ($entry.LastWriteTimeUtc -gt [DateTime]::UtcNow.AddDays(-7)) { $row.recent++; continue }
          $row.bytes += $entry.Length
          $row.count++
          if ($row.samples.Count -lt 12) { $row.samples += @{name=$entry.Name;bytes=$entry.Length} }
        } catch { $row.inaccessible++ }
      }
    }
    [pscustomobject]$row
  })
  $result = @{categories=$categories;readOnly=$true;minimumAgeDays=7}
} catch { $result = @{error='ADMIN_SCAN_FAILED'} }
try {
  $pipe = [IO.Pipes.NamedPipeClientStream]::new('.', $pipeName, [IO.Pipes.PipeDirection]::Out)
  $pipe.Connect(15000)
  $writer = [IO.StreamWriter]::new($pipe,[Text.UTF8Encoding]::new($false))
  $writer.Write(($result | ConvertTo-Json -Depth 6 -Compress))
  $writer.Flush()
  $writer.Dispose()
  $pipe.Dispose()
} catch { exit 1 }
