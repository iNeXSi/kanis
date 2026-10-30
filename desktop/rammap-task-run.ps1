if (!$result.ready) { throw 'Not prepared' }
if ($task.State -eq 4 -or $task.State -eq 2) { throw 'Already running' }
$started = Get-Date
$instance = $task.Run($null)
$deadline = $started.AddSeconds(125)
do {
  Start-Sleep -Milliseconds 250
  try { $instance.Refresh(); $state = $instance.State } catch { $state = 3 }
  if ((Get-Date) -gt $deadline) { throw 'Task timeout' }
} while ($state -eq 2 -or $state -eq 4)
$task = $service.GetFolder('\').GetTask($taskName)
if ($task.LastTaskResult -ne 0 -or $task.LastRunTime -lt $started.AddSeconds(-2)) { throw 'Task did not complete successfully' }
Write-Output (@{completed=$true} | ConvertTo-Json -Compress)
