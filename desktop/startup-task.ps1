$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$taskName = 'Kanis Startup ' + $sid
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
$folder = $service.GetFolder('\')
function FindTask {
  try { return $folder.GetTask($taskName) }
  catch { if ($_.Exception.HResult -eq -2147024894) { return $null }; throw }
}
if ($mode -eq 'enable') {
  if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'Missing Kanis executable' }
  $definition = $service.NewTask(0)
  $definition.RegistrationInfo.Description = 'Start Kanis in the system tray after this user signs in.'
  $definition.Principal.UserId = $sid
  $definition.Principal.LogonType = 3
  $definition.Principal.RunLevel = 0
  $trigger = $definition.Triggers.Create(9)
  $trigger.UserId = $sid
  $trigger.Delay = 'PT20S'
  $action = $definition.Actions.Create(0)
  $action.Path = $exe
  $action.Arguments = '--background'
  $action.WorkingDirectory = Split-Path -Parent $exe
  $definition.Settings.Enabled = $true
  $definition.Settings.StartWhenAvailable = $true
  $definition.Settings.DisallowStartIfOnBatteries = $false
  $definition.Settings.StopIfGoingOnBatteries = $false
  $definition.Settings.ExecutionTimeLimit = 'PT0S'
  $definition.Settings.MultipleInstances = 2
  $definition.Settings.AllowDemandStart = $true
  $taskAcl = "O:${sid}G:SYD:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GA;;;${sid})"
  $null = $folder.RegisterTaskDefinition($taskName,$definition,22,$sid,$null,3,$taskAcl)
} elseif ($mode -eq 'disable') {
  if (FindTask) { $folder.DeleteTask($taskName,0) }
} elseif ($mode -ne 'inspect') { throw 'Invalid startup action' }
$task = FindTask
$enabled = $false
if ($task) {
  $definition = $task.Definition
  $principalSid = $definition.Principal.UserId
  if ($principalSid -notmatch '^S-1-') { $principalSid = ([Security.Principal.NTAccount]::new($principalSid)).Translate([Security.Principal.SecurityIdentifier]).Value }
  $enabled = $task.Enabled -and $definition.Actions.Count -eq 1 -and $definition.Triggers.Count -eq 1 -and $principalSid -eq $sid -and $definition.Principal.RunLevel -eq 0 -and $definition.Principal.LogonType -eq 3
  if ($enabled) {
    $action = $definition.Actions.Item(1)
    $trigger = $definition.Triggers.Item(1)
    $triggerSid = $trigger.UserId
    if ($triggerSid -notmatch '^S-1-') { $triggerSid = ([Security.Principal.NTAccount]::new($triggerSid)).Translate([Security.Principal.SecurityIdentifier]).Value }
    $enabled = $action.Type -eq 0 -and $action.Path -eq $exe -and $action.Arguments -eq '--background' -and $trigger.Type -eq 9 -and $trigger.Enabled -and $triggerSid -eq $sid
  }
}
@{exists=($null -ne $task);enabled=[bool]$enabled;taskName=$taskName} | ConvertTo-Json -Compress
