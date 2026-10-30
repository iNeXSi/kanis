$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$taskName = 'Kanis RAMMap ' + $sid
$directory = Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'KanisRAMMap'
$target = Join-Path $directory 'RAMMap64.exe'
$result = @{ready=$false}
function AssertProtected([string]$file) {
  $item = Get-Item -LiteralPath $file
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point rejected' }
  $acl = Get-Acl -LiteralPath $file
  if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin @('S-1-5-18','S-1-5-32-544')) { throw 'Unexpected owner' }
  # Fail closed if any non-admin principal has write/delete/permission-changing access.
  foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @('S-1-5-18','S-1-5-32-544')) {
      if (([int]$rule.FileSystemRights -band 0xD0156) -ne 0) { throw 'Writable elevated executable' }
    }
  }
}
AssertProtected $directory
AssertProtected $target
if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Unexpected file' }
$signature = Get-AuthenticodeSignature -LiteralPath $target
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '^CN=Microsoft Corporation,') { throw 'Signature rejected' }
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
$task = $service.GetFolder('\').GetTask($taskName)
$definition = $task.Definition
if (!$task.Enabled -or $definition.Triggers.Count -ne 0 -or $definition.Actions.Count -ne 1) { throw 'Unexpected task' }
$action = $definition.Actions.Item(1)
if ($action.Type -ne 0 -or $action.Path -ne $target -or $action.Arguments -ne '/accepteula -Ew' -or $action.WorkingDirectory -ne $directory) { throw 'Unexpected action' }
$principalSid = $definition.Principal.UserId
if ($principalSid -notmatch '^S-\d(-\d+)+$') {
  $principalSid = ([Security.Principal.NTAccount]::new($principalSid)).Translate([Security.Principal.SecurityIdentifier]).Value
}
if ($principalSid -ne $sid -or $definition.Principal.LogonType -ne 3 -or $definition.Principal.RunLevel -ne 1) { throw 'Unexpected principal' }
if (!$definition.Settings.AllowDemandStart -or $definition.Settings.MultipleInstances -ne 2 -or $definition.Settings.ExecutionTimeLimit -ne 'PT2M') { throw 'Unexpected task limits' }
$security = New-Object Security.AccessControl.RawSecurityDescriptor($task.GetSecurityDescriptor(7))
if ($security.Owner.Value -notin @('S-1-5-18','S-1-5-32-544')) { throw 'Unexpected task owner' }
foreach ($ace in $security.DiscretionaryAcl) {
  if ($ace.AceType -ne 'AccessAllowed') { continue }
  if ($ace.SecurityIdentifier.Value -notin @('S-1-5-18','S-1-5-32-544')) {
    if ($ace.SecurityIdentifier.Value -ne $sid -or ($ace.AccessMask -band 0x500D0156) -ne 0) { throw 'Unsafe task permissions' }
  }
}
$result = @{ready=$true;taskName=$taskName}
Write-Output ($result | ConvertTo-Json -Compress)
